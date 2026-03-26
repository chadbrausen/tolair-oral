import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { buildSystemPrompt, CompassContext } from './prompts/oral-system-prompt';
import { buildSignalExplainerPrompt } from './prompts/oral-signal-explainer';
import { buildBenchmarkInterpreterPrompt } from './prompts/oral-benchmark-interpreter';
import { buildDsoAnalystPrompt } from './prompts/oral-dso-analyst';
import { buildHrsaAdvisorPrompt } from './prompts/oral-hrsa-advisor';
import { buildHandoffPrompt } from './prompts/oral-handoff';

export interface CompassQueryDto {
  npi: string;
  query: string;
  sessionToken: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface CompassCitation {
  claim: string;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// In-memory conversation store (per session)
const conversationStore = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

const MAX_HISTORY = 20;
const AI_MODEL = 'gpt-4o';

@Injectable()
export class CompassService {
  private readonly logger = new Logger(CompassService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async query(dto: CompassQueryDto) {
    // 1. Validate session
    const session = await this.prisma.oralSession.findUnique({
      where: { token: dto.sessionToken },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    // Rate limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (session.requestCount >= 20 && session.lastRequest && session.lastRequest >= todayStart) {
      throw new BadRequestException('Daily query limit reached (20 queries per day). Please try again tomorrow.');
    }

    // 2. Load provider with signals
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi: dto.npi },
      include: {
        signals: {
          where: { status: 'ACTIVE' },
          orderBy: [{ severity: 'asc' }, { dollarImpactMax: 'desc' }],
          take: 15,
        },
      },
    });

    if (!provider) {
      throw new BadRequestException(`Provider not found: NPI ${dto.npi}`);
    }

    // 3. Load benchmarks
    const cohortKey = `${provider.specialty}|NATIONAL|ALL|ALL`;
    const benchmarks = await this.prisma.oralCohortBenchmark.findMany({
      where: { cohortKey },
    });

    // 4. Build context
    const ctx: CompassContext = {
      provider: {
        npi: provider.npi,
        displayName: provider.displayName,
        city: provider.city,
        state: provider.state,
        specialty: provider.specialty,
        practiceType: provider.practiceType,
        dsoAffiliation: provider.dsoAffiliation,
        hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
        hrsaHpsaScore: provider.hrsaHpsaScore,
        hrsaShortageType: provider.hrsaShortageType,
        ogsScore: provider.ogsScore,
        entityType: provider.entityType,
      },
      signals: provider.signals.map(s => ({
        domain: s.domain,
        signalCode: s.signalCode,
        severity: s.severity,
        dollarImpactMin: s.dollarImpactMin,
        dollarImpactMax: s.dollarImpactMax,
        impactUnit: s.impactUnit,
        narrativeText: s.narrativeText,
        dataSource: s.dataSource,
        evidenceType: s.evidenceType,
      })),
      benchmarks: benchmarks.map(b => ({
        metricName: b.metricName,
        metricLabel: b.metricLabel,
        p25: b.p25,
        median: b.median,
        p75: b.p75,
        unit: b.unit,
        dataSource: b.dataSource,
        dataYear: b.dataYear,
      })),
      cohortKey,
    };

    // 5. Build system prompt with specialized supplements
    let systemPrompt = buildSystemPrompt(ctx);
    systemPrompt += '\n\n' + this.detectAndAppendSpecializedPrompt(dto.query, ctx, provider);

    // 6. Build messages with conversation history
    const history = this.getOrCreateHistory(dto.sessionToken);

    if (dto.conversationHistory?.length && history.length === 0) {
      history.push(...dto.conversationHistory);
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: dto.query },
    ];

    // 7. Call OpenAI
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not configured — returning mock response');
      const citations = this.buildCitations(ctx);
      return {
        response: `Compass AI is not yet configured. Please set OPENAI_API_KEY.\n\nFor ${provider.displayName} (NPI: ${provider.npi}), the OGS score is ${provider.ogsScore ?? 'pending'}/100.`,
        requestHash: 'mock-' + Date.now(),
        citations,
        model: 'mock',
      };
    }

    const requestPayload = JSON.stringify({ messages, model: AI_MODEL });
    const requestHash = createHash('sha256').update(requestPayload).digest('hex');

    try {
      const response = await this.client.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 1500,
        messages,
      });

      const responseText = response.choices[0]?.message?.content || '';

      // Anti-hallucination: check for dollar figures not in signals
      const validatedResponse = this.validateDollarFigures(responseText, ctx.signals);

      const fullHash = createHash('sha256')
        .update(requestPayload + validatedResponse)
        .digest('hex');

      // Update session
      await this.prisma.oralSession.update({
        where: { id: session.id },
        data: { requestCount: { increment: 1 }, lastRequest: new Date() },
      });

      // Store conversation
      history.push({ role: 'user', content: dto.query });
      history.push({ role: 'assistant', content: validatedResponse });
      while (history.length > MAX_HISTORY * 2) {
        history.splice(0, 2);
      }

      // Build citations
      const citations = this.buildCitations(ctx, validatedResponse);

      // Store AI audit hash on the most relevant signal
      if (provider.signals.length > 0) {
        await this.prisma.oralSignal.update({
          where: { id: provider.signals[0].id },
          data: { aiRequestHash: fullHash, aiModel: AI_MODEL },
        }).catch(() => {});
      }

      this.logger.log(`Compass query for NPI ${dto.npi}: "${dto.query.substring(0, 50)}..." (hash: ${fullHash.substring(0, 12)})`);

      return {
        response: validatedResponse,
        requestHash: fullHash,
        citations,
        model: AI_MODEL,
        conversationLength: history.length,
      };
    } catch (error: any) {
      this.logger.error(`OpenAI API error: ${error.message}`);
      throw new BadRequestException('Compass AI is temporarily unavailable. Please try again.');
    }
  }

  private detectAndAppendSpecializedPrompt(query: string, ctx: CompassContext, provider: any): string {
    const q = query.toLowerCase();
    const supplements: string[] = [];

    if (q.includes('signal') || q.includes('finding') || q.includes('governance issue') || q.includes('what did you find')) {
      if (ctx.signals.length > 0) {
        supplements.push(buildSignalExplainerPrompt(ctx.signals[0] as any));
      }
    }

    if (q.includes('benchmark') || q.includes('compare') || q.includes('percentile') || q.includes('how do') || q.includes('peer')) {
      supplements.push(buildBenchmarkInterpreterPrompt(ctx.benchmarks, ctx.cohortKey, ctx.provider.practiceType));
    }

    if (q.includes('dso') || q.includes('dental service organization') || q.includes('corporate') || q.includes('private equity') || q.includes('affiliation')) {
      supplements.push(buildDsoAnalystPrompt(
        provider.dsoAffiliation ? {
          dsoName: provider.dsoAffiliation,
          ownershipType: null,
          parentCompany: null,
          peSponsors: [],
          estimatedLocations: null,
          estimatedDentists: null,
          statesPresent: [],
        } : null,
        ctx.provider.displayName,
      ));
    }

    if (q.includes('hrsa') || q.includes('shortage') || q.includes('hpsa') || q.includes('underserved')) {
      supplements.push(buildHrsaAdvisorPrompt(ctx.provider));
    }

    if (q.includes('next step') || q.includes('what should') || q.includes('platform') || q.includes('connect') || q.includes('demo') || q.includes('tolair') || q.includes('deeper') || q.includes('real data')) {
      supplements.push(buildHandoffPrompt(ctx.provider.displayName, ctx.signals[0]?.domain || null));
    }

    return supplements.length > 0
      ? '═══ SPECIALIZED CONTEXT ═══\n' + supplements.join('\n\n---\n\n')
      : '';
  }

  private buildCitations(ctx: CompassContext, responseText?: string): CompassCitation[] {
    const citations: CompassCitation[] = [];

    for (const signal of ctx.signals) {
      const confidence = this.mapSourceConfidence(signal.dataSource);
      citations.push({
        claim: `${signal.signalCode}: ${signal.narrativeText || 'Governance signal detected'}`,
        source: this.formatSourceCitation(signal.dataSource),
        confidence,
      });
    }

    const sourcesUsed = new Set<string>();
    for (const bm of ctx.benchmarks) {
      const sourceKey = `${bm.dataSource}|${bm.dataYear}`;
      if (!sourcesUsed.has(sourceKey)) {
        sourcesUsed.add(sourceKey);
        citations.push({
          claim: `Cohort benchmarks for ${ctx.cohortKey}`,
          source: this.formatSourceCitation(bm.dataSource) + (bm.dataYear ? `, ${bm.dataYear}` : ''),
          confidence: bm.dataSource === 'ADA_SURVEY' ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    if (ctx.provider.hrsaHpsaDesignated) {
      citations.push({
        claim: `HPSA dental shortage area designation (Score: ${ctx.provider.hrsaHpsaScore}/25)`,
        source: 'HRSA Bureau of Health Workforce, HPSA Dental Designation Database',
        confidence: 'HIGH',
      });
    }

    citations.push({
      claim: `Provider identity and practice profile for NPI ${ctx.provider.npi}`,
      source: 'CMS NPPES National Provider Identifier Registry',
      confidence: 'HIGH',
    });

    return citations;
  }

  private mapSourceConfidence(dataSource: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (dataSource) {
      case 'NPPES': return 'HIGH';
      case 'HRSA': return 'HIGH';
      case 'ADA_SURVEY': return 'HIGH';
      case 'ADA_SURVEY_ESTIMATED': return 'MEDIUM';
      case 'CMS_MEDICAID': return 'MEDIUM';
      case 'STATE_BOARD': return 'MEDIUM';
      case 'COMPUTED': return 'LOW';
      default: return 'LOW';
    }
  }

  private formatSourceCitation(dataSource: string): string {
    switch (dataSource) {
      case 'NPPES': return 'CMS NPPES National Provider Identifier Registry';
      case 'HRSA': return 'HRSA Bureau of Health Workforce';
      case 'ADA_SURVEY': return 'ADA Survey of Dental Practice';
      case 'ADA_SURVEY_ESTIMATED': return 'ADA Survey of Dental Practice (estimated)';
      case 'CMS_MEDICAID': return 'CMS Medicaid Dental Claims Data';
      case 'CMS_MEDICARE_PARTB': return 'CMS Medicare Part B Claims';
      case 'STATE_BOARD': return 'State Dental Board Records';
      case 'COMPUTED': return 'Tolair Computed Signal (derived from public data)';
      default: return dataSource;
    }
  }

  private validateDollarFigures(response: string, signals: CompassContext['signals']): string {
    const dollarPattern = /\$[\d,]+(?:\.\d{2})?/g;
    const matches = response.match(dollarPattern);

    if (matches) {
      for (const match of matches) {
        const numStr = match.replace('$', '').replace(/,/g, '');
        const num = parseFloat(numStr);
        const isValid = signals.some(s =>
          (s.dollarImpactMin != null && Math.abs(s.dollarImpactMin - num) < 1) ||
          (s.dollarImpactMax != null && Math.abs(s.dollarImpactMax - num) < 1)
        );

        if (!isValid && num > 100) {
          this.logger.warn(`Anti-hallucination: blocked dollar figure ${match} for NPI query`);
          response = response.replace(match, '[specific amount available on the Tolair platform]');
        }
      }
    }

    return response;
  }

  private getOrCreateHistory(sessionToken: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (!conversationStore.has(sessionToken)) {
      conversationStore.set(sessionToken, []);
    }
    return conversationStore.get(sessionToken)!;
  }
}
