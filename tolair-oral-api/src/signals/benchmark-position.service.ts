import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class BenchmarkPositionService {
  private readonly logger = new Logger(BenchmarkPositionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) {
      this.logger.warn(`Provider ${npi} not found`);
      return [];
    }

    const signals: any[] = [];

    // Fetch existing active signals for this provider to assess data sufficiency
    const existingSignals = await this.prisma.oralSignal.findMany({
      where: {
        npi,
        status: 'ACTIVE',
      },
    });

    // Count distinct domains with active signals
    const distinctDomains = new Set(existingSignals.map((s) => s.domain));

    // BENCHMARK_BELOW_25TH: ogsScore < 25
    if (provider.ogsScore !== null && provider.ogsScore !== undefined && provider.ogsScore < 25) {
      // Calculate dollar impact as sum of all active signal dollar impacts for this NPI
      const dollarImpact = existingSignals.reduce((sum, s) => {
        const evidence = s.evidencePayload as any;
        if (evidence && typeof evidence.dollarImpact === 'number') {
          return sum + evidence.dollarImpact;
        }
        return sum;
      }, 0);

      const key = deterministicKey(npi, 'BENCHMARK_POSITION', 'BENCHMARK_BELOW_25TH');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'ELEVATED',
          status: 'ACTIVE',
          evidencePayload: {
            ogsScore: provider.ogsScore,
            percentile: 'BELOW_25TH',
            dollarImpact,
            activeSignalCount: existingSignals.length,
            distinctDomains: Array.from(distinctDomains),
            description: `Provider OGS score of ${provider.ogsScore} is below the 25th percentile. Aggregate dollar impact: $${dollarImpact.toLocaleString()}`,
          },
          dataSource: 'COMPUTED',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'BENCHMARK_POSITION',
          signalCode: 'BENCHMARK_BELOW_25TH',
          severity: 'ELEVATED',
          status: 'ACTIVE',
          dataSource: 'COMPUTED',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            ogsScore: provider.ogsScore,
            percentile: 'BELOW_25TH',
            dollarImpact,
            activeSignalCount: existingSignals.length,
            distinctDomains: Array.from(distinctDomains),
            description: `Provider OGS score of ${provider.ogsScore} is below the 25th percentile. Aggregate dollar impact: $${dollarImpact.toLocaleString()}`,
          },
        },
      });
      signals.push(signal);
    }

    // BENCHMARK_TOP_QUARTILE: ogsScore >= 75
    if (provider.ogsScore !== null && provider.ogsScore !== undefined && provider.ogsScore >= 75) {
      const key = deterministicKey(npi, 'BENCHMARK_POSITION', 'BENCHMARK_TOP_QUARTILE');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'INFO',
          status: 'ACTIVE',
          evidencePayload: {
            ogsScore: provider.ogsScore,
            percentile: 'TOP_QUARTILE',
            activeSignalCount: existingSignals.length,
            description: `Provider OGS score of ${provider.ogsScore} is in the top quartile (>=75)`,
          },
          dataSource: 'COMPUTED',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'BENCHMARK_POSITION',
          signalCode: 'BENCHMARK_TOP_QUARTILE',
          severity: 'INFO',
          status: 'ACTIVE',
          dataSource: 'COMPUTED',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            ogsScore: provider.ogsScore,
            percentile: 'TOP_QUARTILE',
            activeSignalCount: existingSignals.length,
            description: `Provider OGS score of ${provider.ogsScore} is in the top quartile (>=75)`,
          },
        },
      });
      signals.push(signal);
    }

    // BENCHMARK_NO_DATA: fewer than 3 active signals across different domains
    if (distinctDomains.size < 3) {
      const key = deterministicKey(npi, 'BENCHMARK_POSITION', 'BENCHMARK_NO_DATA');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'INFO',
          status: 'ACTIVE',
          evidencePayload: {
            distinctDomainCount: distinctDomains.size,
            domains: Array.from(distinctDomains),
            threshold: 3,
            description: `Insufficient signal data: only ${distinctDomains.size} domain(s) with active signals (minimum 3 required for reliable benchmarking)`,
          },
          dataSource: 'COMPUTED',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'BENCHMARK_POSITION',
          signalCode: 'BENCHMARK_NO_DATA',
          severity: 'INFO',
          status: 'ACTIVE',
          dataSource: 'COMPUTED',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            distinctDomainCount: distinctDomains.size,
            domains: Array.from(distinctDomains),
            threshold: 3,
            description: `Insufficient signal data: only ${distinctDomains.size} domain(s) with active signals (minimum 3 required for reliable benchmarking)`,
          },
        },
      });
      signals.push(signal);
    }

    this.logger.log(`BENCHMARK_POSITION: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
