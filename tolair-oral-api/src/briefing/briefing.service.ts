import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalEngineService } from '../signals/signal-engine.service';
import { OgsService } from './ogs.service';
import { CohortService } from './cohort.service';

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineService,
    private readonly ogsService: OgsService,
    private readonly cohortService: CohortService,
  ) {}

  /**
   * Generate or retrieve a full briefing for a provider.
   */
  async generateBriefing(npi: string) {
    // Verify provider exists
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
    });

    if (!provider) {
      throw new NotFoundException(`Provider not found: NPI ${npi}`);
    }

    // 1. Assign cohort
    const { cohortKey, peerCount, benchmarks } = await this.cohortService.assignCohort(npi);

    // 2. Compute signals
    const signalResult = await this.signalEngine.computeSignals(npi);

    // 3. Compute OGS
    const ogsResult = await this.ogsService.computeOgs(npi);

    // 4. Calculate percentile within cohort
    const ogsPercentile = await this.calculatePercentile(ogsResult.score, cohortKey);

    // 5. Get top signals for summary
    const activeSignals = await this.prisma.oralSignal.findMany({
      where: { npi, status: 'ACTIVE' },
      orderBy: [{ severity: 'asc' }, { dollarImpactMax: 'desc' }],
      take: 3,
    });

    // 6. Build domain summary
    const allSignals = await this.prisma.oralSignal.findMany({
      where: { npi, status: 'ACTIVE' },
    });

    const domainSummary: Record<string, { count: number; maxSeverity: string }> = {};
    for (const signal of allSignals) {
      if (!domainSummary[signal.domain]) {
        domainSummary[signal.domain] = { count: 0, maxSeverity: 'INFO' };
      }
      domainSummary[signal.domain].count++;
      // Update severity if higher
      const severityOrder = ['CRITICAL', 'ELEVATED', 'WARN', 'INFO'];
      const currentIdx = severityOrder.indexOf(domainSummary[signal.domain].maxSeverity);
      const signalIdx = severityOrder.indexOf(signal.severity);
      if (signalIdx < currentIdx) {
        domainSummary[signal.domain].maxSeverity = signal.severity;
      }
    }

    // 7. Build top signals payload
    const topSignals = activeSignals.map(s => ({
      signalCode: s.signalCode,
      domain: s.domain,
      severity: s.severity,
      dollarImpactMin: s.dollarImpactMin,
      dollarImpactMax: s.dollarImpactMax,
      impactUnit: s.impactUnit,
      narrative: s.narrativeText,
    }));

    // 8. Create or update the briefing
    const briefing = await this.prisma.oralBriefing.create({
      data: {
        npi,
        ogsScore: ogsResult.score,
        ogsPercentile,
        cohortKey,
        peerCount,
        topSignals: topSignals as any,
        domainSummary: domainSummary as any,
        benchmarkSnapshot: benchmarks.map(b => ({
          metricName: b.metricName,
          metricLabel: b.metricLabel,
          p25: b.p25,
          median: b.median,
          p75: b.p75,
          unit: b.unit,
          dataSource: b.dataSource,
        })) as any,
        version: 'v1.0',
      },
    });

    return {
      briefing,
      provider: {
        npi: provider.npi,
        displayName: provider.displayName,
        city: provider.city,
        state: provider.state,
        specialty: provider.specialty,
        practiceType: provider.practiceType,
        dsoAffiliation: provider.dsoAffiliation,
        entityType: provider.entityType,
      },
      ogs: ogsResult,
      cohort: { cohortKey, peerCount },
      signalCount: allSignals.length,
      dataSources: {
        providerIdentity: 'CMS NPPES National Provider Identifier Registry',
        benchmarks: `ADA Survey of Dental Practice — cohort averages for ${cohortKey}`,
        ogsScore: 'Computed from public data signals (NPPES, ADA Survey, HRSA, CMS)',
        signals: 'Deterministic signals derived from public benchmark gaps and designations',
      },
      disclaimer: 'Benchmark comparisons reflect cohort averages from the ADA Survey of Dental Practice, not this specific practice\'s actual performance data. Dollar impact estimates are ranges based on national benchmarks. Connect your practice management system through the Tolair platform for real-time, practice-specific governance analytics.',
    };
  }

  /**
   * Preview-only endpoint — returns just OGS score and top domain.
   * No session required.
   */
  async getBriefingPreview(npi: string) {
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
      select: {
        npi: true,
        displayName: true,
        city: true,
        state: true,
        specialty: true,
        practiceType: true,
        dsoAffiliation: true,
        ogsScore: true,
        hrsaHpsaDesignated: true,
        entityType: true,
        addressLine1: true,
        zip: true,
      },
    });

    if (!provider) {
      throw new NotFoundException(`Provider not found: NPI ${npi}`);
    }

    // Link individual providers to their organization NPI
    let linkedOrganization: { npi: string; displayName: string } | null = null;
    if (provider.entityType === 'INDIVIDUAL' && provider.city && provider.state) {
      const org = await this.prisma.oralProvider.findFirst({
        where: {
          entityType: 'ORGANIZATION',
          city: provider.city,
          state: provider.state,
          zip: provider.zip,
          npi: { not: npi },
        },
        select: { npi: true, displayName: true },
      });
      if (org) {
        linkedOrganization = org;
      }
    }

    // Get top signal domain
    const topSignal = await this.prisma.oralSignal.findFirst({
      where: { npi, status: 'ACTIVE' },
      orderBy: [{ severity: 'asc' }, { dollarImpactMax: 'desc' }],
      select: {
        domain: true,
        severity: true,
        signalCode: true,
      },
    });

    return {
      provider,
      ogsScore: provider.ogsScore,
      topDomain: topSignal?.domain || null,
      topSeverity: topSignal?.severity || null,
      gated: true,
      linkedOrganization,
      dataSources: {
        providerIdentity: 'CMS NPPES National Provider Identifier Registry (updated monthly)',
        benchmarks: 'ADA Survey of Dental Practice (national/regional cohort averages, not practice-specific)',
        ogsScore: 'Computed from public data signals only — not based on actual practice financial data',
        signals: 'Derived from public data benchmarks, HRSA designations, and market analysis',
      },
      disclaimer: 'All data shown is derived from publicly available sources. Benchmark comparisons reflect cohort averages, not this specific practice\'s performance. Connect your practice management system through the Tolair platform for practice-specific analytics.',
    };
  }

  private async calculatePercentile(score: number, cohortKey: string): Promise<number> {
    // Count how many providers in same cohort have lower OGS
    const specialtyPart = cohortKey.split('|')[0];

    const [lowerCount, totalCount] = await Promise.all([
      this.prisma.oralProvider.count({
        where: {
          specialty: specialtyPart as any,
          ogsScore: { lt: score, not: null },
        },
      }),
      this.prisma.oralProvider.count({
        where: {
          specialty: specialtyPart as any,
          ogsScore: { not: null },
        },
      }),
    ]);

    if (totalCount === 0) return 50;
    return Math.round((lowerCount / totalCount) * 100);
  }
}
