import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class DsoContractService {
  private readonly logger = new Logger(DsoContractService.name);
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const signals: any[] = [];
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) return signals;

    // Only relevant for DSO-affiliated practices
    if (!provider.dsoAffiliation) return signals;

    // Load DSO info
    const dso = await this.prisma.oralDso.findFirst({
      where: { dsoName: provider.dsoAffiliation },
    });

    // Load supply expense benchmark
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

    // Signal: DSO_CONTRACT_OFF_GPO
    if (supplyBenchmark?.median != null && productionBenchmark?.median != null) {
      const independentBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
        where: {
          cohortKey: `${provider.specialty}|NATIONAL|SOLO|INDEPENDENT`,
          metricName: 'supply_expense_ratio',
        },
      });

      if (independentBenchmark?.median != null) {
        const dsoBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
          where: {
            cohortKey: `${provider.specialty}|NATIONAL|ALL|DSO_AFFILIATED`,
            metricName: 'supply_expense_ratio',
          },
        });

        if (dsoBenchmark?.median != null) {
          // DSO-affiliated should have lower supply costs due to GPO access
          // Flag if DSO supply ratio exceeds independent peer median by >15%
          const excessRatio = (dsoBenchmark.median - independentBenchmark.median) / independentBenchmark.median;

          if (excessRatio > 0.15) {
            const annualProduction = productionBenchmark.median * 250;
            const overheadBenchmark = await this.prisma.oralCohortBenchmark.findFirst({
              where: {
                cohortKey: `${provider.specialty}|NATIONAL|ALL|ALL`,
                metricName: 'overhead_ratio',
              },
            });
            const overheadRatio = overheadBenchmark?.median ?? 60;
            const estimatedCollections = annualProduction * (1 - overheadRatio / 100);

            const excessAmount = (dsoBenchmark.median - independentBenchmark.median) / 100;
            const dollarMin = Math.round(estimatedCollections * excessAmount * 0.5);
            const dollarMax = Math.round(estimatedCollections * excessAmount * 1.5);

            const key = deterministicKey(npi, 'DSO_CONTRACT', 'DSO_CONTRACT_OFF_GPO', provider.specialty);
            await this.prisma.oralSignal.upsert({
              where: { deterministicKey: key },
              create: {
                deterministicKey: key,
                npi,
                domain: 'DSO_CONTRACT',
                signalCode: 'DSO_CONTRACT_OFF_GPO',
                severity: 'ELEVATED',
                dollarImpactMin: dollarMin,
                dollarImpactMax: dollarMax,
                impactUnit: 'ANNUAL',
                evidenceType: 'BENCHMARK_GAP',
                evidencePayload: {
                  dsoSupplyRatio: dsoBenchmark.median,
                  independentSupplyRatio: independentBenchmark.median,
                  excessRatioPct: Math.round(excessRatio * 100),
                  annualProductionEstimate: annualProduction,
                  estimatedCollections,
                },
                dataSource: 'ADA_SURVEY',
                narrativeText: `DSO-affiliated supply expense ratio (${dsoBenchmark.median}%) exceeds independent practice benchmark (${independentBenchmark.median}%) by ${Math.round(excessRatio * 100)}%. Estimated annual impact: $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()}.`,
              },
              update: {
                severity: 'ELEVATED',
                dollarImpactMin: dollarMin,
                dollarImpactMax: dollarMax,
                evidencePayload: {
                  dsoSupplyRatio: dsoBenchmark.median,
                  independentSupplyRatio: independentBenchmark.median,
                  excessRatioPct: Math.round(excessRatio * 100),
                  annualProductionEstimate: annualProduction,
                  estimatedCollections,
                },
                dataSource: 'ADA_SURVEY',
                computedAt: new Date(),
              },
            });
            signals.push({ signalCode: 'DSO_CONTRACT_OFF_GPO', severity: 'ELEVATED' });
          }
        }
      }
    }

    // Signal: DSO_CONTRACT_REBATE_GAP
    if (dso && (dso.estimatedLocations ?? 0) >= 10) {
      const locations = dso.estimatedLocations!;
      const dollarMin = locations * 50 * 12;
      const dollarMax = locations * 200 * 12;

      const key = deterministicKey(npi, 'DSO_CONTRACT', 'DSO_CONTRACT_REBATE_GAP', dso.dsoName);
      await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        create: {
          deterministicKey: key,
          npi,
          domain: 'DSO_CONTRACT',
          signalCode: 'DSO_CONTRACT_REBATE_GAP',
          severity: 'WARN',
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          impactUnit: 'ANNUAL',
          evidenceType: 'BENCHMARK_GAP',
          evidencePayload: {
            dsoName: dso.dsoName,
            estimatedLocations: locations,
            perLocationPerMonth: { min: 50, max: 200 },
          },
          dataSource: 'ADA_SURVEY',
          narrativeText: `${dso.dsoName} operates ~${locations} locations. Estimated uncaptured GPO rebate opportunity: $${dollarMin.toLocaleString()}–$${dollarMax.toLocaleString()} annually.`,
        },
        update: {
          dollarImpactMin: dollarMin,
          dollarImpactMax: dollarMax,
          evidencePayload: {
            dsoName: dso.dsoName,
            estimatedLocations: locations,
            perLocationPerMonth: { min: 50, max: 200 },
          },
          dataSource: 'ADA_SURVEY',
          computedAt: new Date(),
        },
      });
      signals.push({ signalCode: 'DSO_CONTRACT_REBATE_GAP', severity: 'WARN' });
    }

    // Signal: DSO_CONTRACT_TIER_MISALIGNMENT
    if (dso && dso.estimatedLocations != null) {
      const loc = dso.estimatedLocations;
      // Near tier boundaries: Tier 1 (1-10), Tier 2 (11-50), Tier 3 (50+)
      if ((loc >= 8 && loc <= 12) || (loc >= 45 && loc <= 55)) {
        const currentTier = loc <= 10 ? 1 : loc <= 50 ? 2 : 3;
        const nextTier = currentTier + 1;

        const key = deterministicKey(npi, 'DSO_CONTRACT', 'DSO_CONTRACT_TIER_MISALIGNMENT', dso.dsoName);
        await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          create: {
            deterministicKey: key,
            npi,
            domain: 'DSO_CONTRACT',
            signalCode: 'DSO_CONTRACT_TIER_MISALIGNMENT',
            severity: 'WARN',
            evidenceType: 'BENCHMARK_GAP',
            evidencePayload: {
              dsoName: dso.dsoName,
              estimatedLocations: loc,
              currentTier,
              nextTier,
              tierThresholds: { tier1: '1-10', tier2: '11-50', tier3: '50+' },
            },
            dataSource: 'COMPUTED',
            narrativeText: `${dso.dsoName} (~${loc} locations) is near a GPO tier boundary. Moving to Tier ${nextTier} could unlock additional volume discounts.`,
          },
          update: {
            evidencePayload: {
              dsoName: dso.dsoName,
              estimatedLocations: loc,
              currentTier,
              nextTier,
              tierThresholds: { tier1: '1-10', tier2: '11-50', tier3: '50+' },
            },
            dataSource: 'COMPUTED',
            computedAt: new Date(),
          },
        });
        signals.push({ signalCode: 'DSO_CONTRACT_TIER_MISALIGNMENT', severity: 'WARN' });
      }
    }

    this.logger.log(`DSO_CONTRACT: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
