import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class RevenueCycleService {
  private readonly logger = new Logger(RevenueCycleService.name);
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const signals: any[] = [];
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) return signals;

    // Load benchmarks
    const collectionsBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'collections_ratio',
      },
    });

    const productionBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'net_production_per_dentist_day',
      },
    });

    const medicaidBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|STATE|${provider.state}|ALL`,
        metricName: 'medicaid_participation_rate',
      },
    });

    // Signal: REVCYCLE_COLLECTIONS_BELOW_BENCHMARK
    if (collectionsBenchmark?.median != null && productionBenchmark?.median != null) {
      if (collectionsBenchmark.median < 95) {
        const severity = collectionsBenchmark.median < 92 ? 'ELEVATED' : 'WARN';
        const annualProduction = productionBenchmark.median * 250;
        const gap = (95 - collectionsBenchmark.median) / 100;

        const dollarMin = Math.round(annualProduction * gap * 0.6);
        const dollarMax = Math.round(annualProduction * gap * 1.2);

        const key = deterministicKey(npi, 'REVENUE_CYCLE', 'REVCYCLE_COLLECTIONS_BELOW_BENCHMARK', provider.specialty);
        await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          create: {
            deterministicKey: key,
            npi,
            domain: 'REVENUE_CYCLE',
            signalCode: 'REVCYCLE_COLLECTIONS_BELOW_BENCHMARK',
            severity,
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            impactUnit: 'ANNUAL',
            evidenceType: 'BENCHMARK_GAP',
            evidencePayload: {
              cohortMedianCollectionsRatio: collectionsBenchmark.median,
              targetCollectionsRatio: 95,
              gapPct: Math.round(gap * 10000) / 100,
              annualProductionEstimate: annualProduction,
            },
            dataSource: 'ADA_SURVEY',
            narrativeText: `Cohort collections ratio (${collectionsBenchmark.median}%) is below the 95% target. Estimated annual revenue gap: $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()}.`,
          },
          update: {
            severity,
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            evidencePayload: {
              cohortMedianCollectionsRatio: collectionsBenchmark.median,
              targetCollectionsRatio: 95,
              gapPct: Math.round(gap * 10000) / 100,
              annualProductionEstimate: annualProduction,
            },
            dataSource: 'ADA_SURVEY',
            computedAt: new Date(),
          },
        });
        signals.push({ signalCode: 'REVCYCLE_COLLECTIONS_BELOW_BENCHMARK', severity });
      }
    }

    // Signal: REVCYCLE_MEDICAID_PARTICIPATION
    if (
      medicaidBenchmark?.median != null &&
      medicaidBenchmark.median > 50 &&
      provider.hrsaHpsaDesignated
    ) {
      const key = deterministicKey(npi, 'REVENUE_CYCLE', 'REVCYCLE_MEDICAID_PARTICIPATION', `${provider.state}|${provider.specialty}`);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'REVENUE_CYCLE',
          signalCode: 'REVCYCLE_MEDICAID_PARTICIPATION',
          severity: 'INFO',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            state: provider.state,
            medicaidParticipationRate: medicaidBenchmark.median,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            hrsaHpsaScore: provider.hrsaHpsaScore,
          },
          dataSource: 'HRSA',
          narrativeText: `Practice is in ${provider.state} where Medicaid dental participation is ${medicaidBenchmark.median}% and is HRSA HPSA designated. High Medicaid volume may present unique revenue cycle challenges and enhanced reimbursement opportunities.`,
        },
        update: {
          evidencePayload: {
            state: provider.state,
            medicaidParticipationRate: medicaidBenchmark.median,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            hrsaHpsaScore: provider.hrsaHpsaScore,
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'REVCYCLE_MEDICAID_PARTICIPATION', severity: 'INFO' });
    }

    // Signal: REVCYCLE_INSURANCE_MIX_RISK
    if (
      medicaidBenchmark?.median != null &&
      medicaidBenchmark.median > 55 &&
      provider.hrsaHpsaDesignated
    ) {
      const key = deterministicKey(npi, 'REVENUE_CYCLE', 'REVCYCLE_INSURANCE_MIX_RISK', `${provider.state}|${provider.specialty}`);

      // Estimate revenue at risk from payer mix concentration
      const annualProduction = productionBenchmark?.median
        ? productionBenchmark.median * 250
        : 0;
      const dollarMin = annualProduction > 0 ? Math.round(annualProduction * 0.03) : undefined;
      const dollarMax = annualProduction > 0 ? Math.round(annualProduction * 0.08) : undefined;

      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'REVENUE_CYCLE',
          signalCode: 'REVCYCLE_INSURANCE_MIX_RISK',
          severity: 'WARN',
          dollarImpactMin: dollarMin ?? null,
          dollarImpactMax: dollarMax ?? null,
          impactUnit: annualProduction > 0 ? 'ANNUAL' : null,
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            state: provider.state,
            medicaidParticipationRate: medicaidBenchmark.median,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            hrsaHpsaScore: provider.hrsaHpsaScore,
            riskFactors: [
              'High Medicaid participation (>55%)',
              'HRSA HPSA designated area',
              'Potential reimbursement rate volatility',
            ],
          },
          dataSource: 'HRSA',
          narrativeText: `Practice in ${provider.state} (${medicaidBenchmark.median}% Medicaid participation) within an HRSA HPSA designated area faces insurance mix concentration risk. Medicaid-heavy payer mix may create revenue volatility.`,
        },
        update: {
          dollarImpactMin: dollarMin ?? null,
          dollarImpactMax: dollarMax ?? null,
          evidencePayload: {
            state: provider.state,
            medicaidParticipationRate: medicaidBenchmark.median,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            hrsaHpsaScore: provider.hrsaHpsaScore,
            riskFactors: [
              'High Medicaid participation (>55%)',
              'HRSA HPSA designated area',
              'Potential reimbursement rate volatility',
            ],
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'REVCYCLE_INSURANCE_MIX_RISK', severity: 'WARN' });
    }

    this.logger.log(`REVENUE_CYCLE: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
