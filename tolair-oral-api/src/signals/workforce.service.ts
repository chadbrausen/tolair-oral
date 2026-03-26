import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class WorkforceService {
  private readonly logger = new Logger(WorkforceService.name);
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const signals: any[] = [];
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) return signals;

    // Load benchmarks
    const staffBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'staff_per_dentist_fte',
      },
    });

    const hygieneBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'hygiene_production_ratio',
      },
    });

    const productionBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
        metricName: 'net_production_per_dentist_day',
      },
    });

    // Signal: WORKFORCE_DENTIST_TO_CHAIR_GAP
    if (
      staffBenchmark?.p75 != null &&
      staffBenchmark.p75 > 4.0 &&
      provider.practiceType === 'INDIVIDUAL_PROVIDER'
    ) {
      const key = deterministicKey(npi, 'WORKFORCE', 'WORKFORCE_DENTIST_TO_CHAIR_GAP', provider.specialty);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'WORKFORCE',
          signalCode: 'WORKFORCE_DENTIST_TO_CHAIR_GAP',
          severity: 'WARN',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            practiceType: provider.practiceType,
            cohortMedianStaffPerDentist: staffBenchmark.median,
            cohortP75StaffPerDentist: staffBenchmark.p75,
            rationale: 'Solo practices with high cohort staffing benchmarks may be under-staffed relative to peers, limiting throughput.',
          },
          dataSource: 'ADA_SURVEY',
          narrativeText: `Solo practice in a cohort where P75 staffing is ${staffBenchmark.p75} staff per dentist FTE. High staffing demand in this specialty may indicate capacity constraints for solo operators.`,
        },
        update: {
          evidencePayload: {
            practiceType: provider.practiceType,
            cohortMedianStaffPerDentist: staffBenchmark.median,
            cohortP75StaffPerDentist: staffBenchmark.p75,
            rationale: 'Solo practices with high cohort staffing benchmarks may be under-staffed relative to peers, limiting throughput.',
          },
          dataSource: 'ADA_SURVEY',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'WORKFORCE_DENTIST_TO_CHAIR_GAP', severity: 'WARN' });
    }

    // Signal: WORKFORCE_HYGIENE_RATIO_GAP
    if (hygieneBenchmark?.median != null && hygieneBenchmark.median < 28) {
      const dollarMin = 80_000;
      const dollarMax = 160_000;

      const key = deterministicKey(npi, 'WORKFORCE', 'WORKFORCE_HYGIENE_RATIO_GAP', provider.specialty);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'WORKFORCE',
          signalCode: 'WORKFORCE_HYGIENE_RATIO_GAP',
          severity: 'WARN',
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          impactUnit: 'ANNUAL',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            cohortMedianHygieneRatio: hygieneBenchmark.median,
            targetHygieneRatio: 28,
            gapPct: Math.round((28 - hygieneBenchmark.median) * 100) / 100,
            impactPerHygienist: { min: dollarMin, max: dollarMax },
          },
          dataSource: 'ADA_SURVEY',
          narrativeText: `Cohort hygiene production ratio (${hygieneBenchmark.median}%) is below the 28% benchmark. Each underutilized hygienist represents $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()} in unrealized annual production.`,
        },
        update: {
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          evidencePayload: {
            cohortMedianHygieneRatio: hygieneBenchmark.median,
            targetHygieneRatio: 28,
            gapPct: Math.round((28 - hygieneBenchmark.median) * 100) / 100,
            impactPerHygienist: { min: dollarMin, max: dollarMax },
          },
          dataSource: 'ADA_SURVEY',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'WORKFORCE_HYGIENE_RATIO_GAP', severity: 'WARN' });
    }

    // Signal: WORKFORCE_SOLO_SCALE_RISK
    if (
      provider.entityType === 'INDIVIDUAL_PROVIDER' &&
      provider.hrsaHpsaScore != null &&
      provider.hrsaHpsaScore >= 10
    ) {
      const key = deterministicKey(npi, 'WORKFORCE', 'WORKFORCE_SOLO_SCALE_RISK', `${provider.state}|${provider.specialty}`);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'WORKFORCE',
          signalCode: 'WORKFORCE_SOLO_SCALE_RISK',
          severity: 'INFO',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            entityType: provider.entityType,
            practiceType: provider.practiceType,
            hrsaHpsaScore: provider.hrsaHpsaScore,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            state: provider.state,
            rationale: 'Solo provider in a high-need HPSA area may benefit from workforce scaling partnerships or DSO affiliation.',
          },
          dataSource: 'HRSA',
          narrativeText: `Solo provider in an HRSA HPSA area (score: ${provider.hrsaHpsaScore}). High shortage designation suggests workforce scaling opportunity through partnerships, associate hiring, or DSO affiliation.`,
        },
        update: {
          evidencePayload: {
            entityType: provider.entityType,
            practiceType: provider.practiceType,
            hrsaHpsaScore: provider.hrsaHpsaScore,
            hrsaHpsaDesignated: provider.hrsaHpsaDesignated,
            state: provider.state,
            rationale: 'Solo provider in a high-need HPSA area may benefit from workforce scaling partnerships or DSO affiliation.',
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'WORKFORCE_SOLO_SCALE_RISK', severity: 'INFO' });
    }

    this.logger.log(`WORKFORCE: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
