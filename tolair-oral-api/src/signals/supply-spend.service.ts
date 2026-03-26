import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class SupplySpendService {
  private readonly logger = new Logger(SupplySpendService.name);
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const signals: any[] = [];
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) return signals;

    // Load cohort benchmarks
    const supplyBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'supply_expense_ratio',
      },
    });

    const productionBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'net_production_per_dentist_day',
      },
    });

    const overheadBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'overhead_ratio',
      },
    });

    // Signal: SUPPLY_SPEND_ABOVE_COHORT
    if (supplyBenchmark?.median != null && supplyBenchmark?.p75 != null && productionBenchmark?.median != null) {
      // Use p75 as proxy for the provider's estimated supply ratio
      // If p75 is significantly above median, it indicates high-cost tail
      const gapRatio = (supplyBenchmark.p75 - supplyBenchmark.median) / supplyBenchmark.median;

      if (gapRatio > 0.10) {
        const annualProduction = productionBenchmark.median * 250;
        const overheadRatio = overheadBenchmark?.median ?? 60;
        const estimatedCollections = annualProduction * (1 - overheadRatio / 100);
        const excessPct = supplyBenchmark.p75 - supplyBenchmark.median;

        const dollarMin = Math.round(estimatedCollections * (excessPct / 100) * 0.5);
        const dollarMax = Math.round(estimatedCollections * (excessPct / 100) * 1.2);

        const severity = gapRatio > 0.20 ? 'ELEVATED' : 'WARN';

        const key = deterministicKey(npi, 'SUPPLY_SPEND', 'SUPPLY_SPEND_ABOVE_COHORT', provider.specialty);
        await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          create: {
            deterministicKey: key,
            npi,
            domain: 'SUPPLY_SPEND',
            signalCode: 'SUPPLY_SPEND_ABOVE_COHORT',
            severity,
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            impactUnit: 'ANNUAL',
            evidenceType: 'BENCHMARK_GAP',
            evidencePayload: {
              cohortMedian: supplyBenchmark.median,
              cohortP75: supplyBenchmark.p75,
              gapRatioPct: Math.round(gapRatio * 100),
              excessPct,
              annualProductionEstimate: annualProduction,
              estimatedCollections,
            },
            dataSource: 'ADA_SURVEY',
            narrativeText: `Supply expense ratio cohort P75 (${supplyBenchmark.p75}%) is ${Math.round(gapRatio * 100)}% above median (${supplyBenchmark.median}%). Practices in the upper quartile may be overspending by $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()} annually.`,
          },
          update: {
            severity,
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            evidencePayload: {
              cohortMedian: supplyBenchmark.median,
              cohortP75: supplyBenchmark.p75,
              gapRatioPct: Math.round(gapRatio * 100),
              excessPct,
              annualProductionEstimate: annualProduction,
              estimatedCollections,
            },
            dataSource: 'ADA_SURVEY',
            computedAt: new Date(),
          },
        });
        signals.push({ signalCode: 'SUPPLY_SPEND_ABOVE_COHORT', severity });
      }
    }

    // Signal: SUPPLY_SPEND_IMPLANT_VARIANCE
    if (
      provider.specialty === 'ORAL_MAXILLOFACIAL_SURGERY' ||
      provider.specialty === 'PERIODONTICS'
    ) {
      const dollarMin = 15_000;
      const dollarMax = 45_000;

      const key = deterministicKey(npi, 'SUPPLY_SPEND', 'SUPPLY_SPEND_IMPLANT_VARIANCE', provider.specialty);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'SUPPLY_SPEND',
          signalCode: 'SUPPLY_SPEND_IMPLANT_VARIANCE',
          severity: 'WARN',
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          impactUnit: 'ANNUAL',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            specialty: provider.specialty,
            implantCostVarianceRange: { min: dollarMin, max: dollarMax },
            rationale: 'Implant component pricing varies significantly across vendors and GPO contracts.',
          },
          dataSource: 'CMS_MEDICAID',
          narrativeText: `${provider.specialty.replace(/_/g, ' ')} practices typically see implant supply cost variance of $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()} annually depending on vendor mix and GPO participation.`,
        },
        update: {
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          evidencePayload: {
            specialty: provider.specialty,
            implantCostVarianceRange: { min: dollarMin, max: dollarMax },
            rationale: 'Implant component pricing varies significantly across vendors and GPO contracts.',
          },
          dataSource: 'CMS_MEDICAID',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'SUPPLY_SPEND_IMPLANT_VARIANCE', severity: 'WARN' });
    }

    // Signal: SUPPLY_SPEND_NO_GPO
    if (!provider.dsoAffiliation && supplyBenchmark?.median != null) {
      const soloBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
        where: {
          cohortKey: `${provider.specialty}|NATIONAL|SOLO|INDEPENDENT`,
          metricName: 'supply_expense_ratio',
        },
      });

      if (soloBenchmark?.median != null && supplyBenchmark.median >= soloBenchmark.median) {
        const dollarMin = 8_000;
        const dollarMax = 25_000;

        const key = deterministicKey(npi, 'SUPPLY_SPEND', 'SUPPLY_SPEND_NO_GPO', provider.specialty);
        await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          create: {
            deterministicKey: key,
            npi,
            domain: 'SUPPLY_SPEND',
            signalCode: 'SUPPLY_SPEND_NO_GPO',
            severity: 'INFO',
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            impactUnit: 'ANNUAL',
            evidenceType: 'BENCHMARK_GAP',
            evidencePayload: {
              practiceType: provider.practiceType,
              cohortSupplyRatio: supplyBenchmark.median,
              soloMedian: soloBenchmark.median,
              gpoSavingsEstimate: { min: dollarMin, max: dollarMax },
            },
            dataSource: 'ADA_SURVEY',
            narrativeText: `Non-DSO practice with supply expense ratio at or above solo median (${soloBenchmark.median}%). GPO participation could yield $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()} in annual savings.`,
          },
          update: {
            dollarImpactMin: dollarMin,
            dollarImpactMax: dollarMax,
            evidencePayload: {
              practiceType: provider.practiceType,
              cohortSupplyRatio: supplyBenchmark.median,
              soloMedian: soloBenchmark.median,
              gpoSavingsEstimate: { min: dollarMin, max: dollarMax },
            },
            dataSource: 'ADA_SURVEY',
            computedAt: new Date(),
          },
        });
        signals.push({ signalCode: 'SUPPLY_SPEND_NO_GPO', severity: 'INFO' });
      }
    }

    this.logger.log(`SUPPLY_SPEND: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
