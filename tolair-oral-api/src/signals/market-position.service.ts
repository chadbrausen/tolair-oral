import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class MarketPositionService {
  private readonly logger = new Logger(MarketPositionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) {
      this.logger.warn(`Provider ${npi} not found`);
      return [];
    }

    const signals: any[] = [];

    // MARKET_HIGH_DENSITY: >= 15 providers in same zipCluster + specialty
    if (provider.zipCluster && provider.specialty) {
      const clusterCount = await this.prisma.oralProvider.count({
        where: {
          zipCluster: provider.zipCluster,
          specialty: provider.specialty,
        },
      });

      if (clusterCount >= 15) {
        const key = deterministicKey(npi, 'MARKET_POSITION', 'MARKET_HIGH_DENSITY', provider.zipCluster);
        const signal = await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          update: {
            severity: 'INFO',
            status: 'ACTIVE',
            evidencePayload: {
              zipCluster: provider.zipCluster,
              specialty: provider.specialty,
              providerCount: clusterCount,
              description: `High provider density: ${clusterCount} ${provider.specialty} providers in cluster ${provider.zipCluster}`,
            },
            dataSource: 'NPPES + COMPUTED',
            computedAt: new Date(),
          },
          create: {
            deterministicKey: key,
            npi,
            domain: 'MARKET_POSITION',
            signalCode: 'MARKET_HIGH_DENSITY',
            severity: 'INFO',
            status: 'ACTIVE',
            dataSource: 'NPPES + COMPUTED',
            evidenceType: 'DENSITY_SIGNAL',
            evidencePayload: {
              zipCluster: provider.zipCluster,
              specialty: provider.specialty,
              providerCount: clusterCount,
              description: `High provider density: ${clusterCount} ${provider.specialty} providers in cluster ${provider.zipCluster}`,
            },
          },
        });
        signals.push(signal);
      }
    }

    // MARKET_LOW_DENSITY_OPPORTUNITY: HRSA designated AND zipCluster has < 5 same-specialty providers
    if (provider.zipCluster && provider.specialty && provider.hrsaHpsaDesignated) {
      const clusterCount = await this.prisma.oralProvider.count({
        where: {
          zipCluster: provider.zipCluster,
          specialty: provider.specialty,
        },
      });

      if (clusterCount < 5) {
        const key = deterministicKey(npi, 'MARKET_POSITION', 'MARKET_LOW_DENSITY_OPPORTUNITY', provider.zipCluster);
        const signal = await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          update: {
            severity: 'INFO',
            status: 'ACTIVE',
            evidencePayload: {
              zipCluster: provider.zipCluster,
              specialty: provider.specialty,
              providerCount: clusterCount,
              hrsaDesignated: true,
              description: `Low density opportunity: only ${clusterCount} ${provider.specialty} providers in HRSA-designated cluster ${provider.zipCluster}`,
            },
            dataSource: 'HRSA + NPPES',
            computedAt: new Date(),
          },
          create: {
            deterministicKey: key,
            npi,
            domain: 'MARKET_POSITION',
            signalCode: 'MARKET_LOW_DENSITY_OPPORTUNITY',
            severity: 'INFO',
            status: 'ACTIVE',
            dataSource: 'HRSA + NPPES',
            evidenceType: 'DENSITY_SIGNAL',
            evidencePayload: {
              zipCluster: provider.zipCluster,
              specialty: provider.specialty,
              providerCount: clusterCount,
              hrsaDesignated: true,
              description: `Low density opportunity: only ${clusterCount} ${provider.specialty} providers in HRSA-designated cluster ${provider.zipCluster}`,
            },
          },
        });
        signals.push(signal);
      }
    }

    // MARKET_DSO_PENETRATION: DSO ratio in zipCluster > 40%
    if (provider.zipCluster) {
      const totalInCluster = await this.prisma.oralProvider.count({
        where: { zipCluster: provider.zipCluster },
      });

      const dsoInCluster = await this.prisma.oralProvider.count({
        where: {
          zipCluster: provider.zipCluster,
          dsoAffiliation: { not: null },
        },
      });

      if (totalInCluster > 0) {
        const dsoRatio = dsoInCluster / totalInCluster;

        if (dsoRatio > 0.4) {
          const isDsoAffiliated = !!provider.dsoAffiliation;
          const severity = isDsoAffiliated ? 'INFO' : 'WARN';
          const key = deterministicKey(npi, 'MARKET_POSITION', 'MARKET_DSO_PENETRATION', provider.zipCluster);

          const signal = await this.prisma.oralSignal.upsert({
            where: { deterministicKey: key },
            update: {
              severity,
              status: 'ACTIVE',
              evidencePayload: {
                zipCluster: provider.zipCluster,
                totalProviders: totalInCluster,
                dsoProviders: dsoInCluster,
                dsoRatio: Math.round(dsoRatio * 100),
                providerIsDso: isDsoAffiliated,
                description: `DSO penetration at ${Math.round(dsoRatio * 100)}% in cluster ${provider.zipCluster} (${dsoInCluster}/${totalInCluster} providers)`,
              },
              dataSource: 'NPPES + COMPUTED',
              computedAt: new Date(),
            },
            create: {
              deterministicKey: key,
              npi,
              domain: 'MARKET_POSITION',
              signalCode: 'MARKET_DSO_PENETRATION',
              severity,
              status: 'ACTIVE',
              dataSource: 'NPPES + COMPUTED',
              evidenceType: 'DENSITY_SIGNAL',
              evidencePayload: {
                zipCluster: provider.zipCluster,
                totalProviders: totalInCluster,
                dsoProviders: dsoInCluster,
                dsoRatio: Math.round(dsoRatio * 100),
                providerIsDso: isDsoAffiliated,
                description: `DSO penetration at ${Math.round(dsoRatio * 100)}% in cluster ${provider.zipCluster} (${dsoInCluster}/${totalInCluster} providers)`,
              },
            },
          });
          signals.push(signal);
        }
      }
    }

    // MARKET_SPECIALTY_GAP: Non-GP specialty below national average density
    if (provider.specialty === 'GENERAL_DENTISTRY') {
      // Skip this signal for general dentistry providers
    } else if (provider.specialty && provider.state) {
      const stateSpecialtyCount = await this.prisma.oralProvider.count({
        where: {
          state: provider.state,
          specialty: provider.specialty,
        },
      });

      const nationalSpecialtyCount = await this.prisma.oralProvider.count({
        where: { specialty: provider.specialty },
      });

      const nationalAvgPerState = nationalSpecialtyCount / 50;

      if (stateSpecialtyCount < nationalAvgPerState) {
        const key = deterministicKey(
          npi,
          'MARKET_POSITION',
          'MARKET_SPECIALTY_GAP',
          `${provider.state}|${provider.specialty}`,
        );
        const signal = await this.prisma.oralSignal.upsert({
          where: { deterministicKey: key },
          update: {
            severity: 'INFO',
            status: 'ACTIVE',
            evidencePayload: {
              state: provider.state,
              specialty: provider.specialty,
              stateCount: stateSpecialtyCount,
              nationalTotal: nationalSpecialtyCount,
              nationalAvgPerState: Math.round(nationalAvgPerState * 10) / 10,
              description: `Specialty gap: ${provider.state} has ${stateSpecialtyCount} ${provider.specialty} providers vs national avg of ${Math.round(nationalAvgPerState * 10) / 10} per state`,
            },
            dataSource: 'NPPES + COMPUTED',
            computedAt: new Date(),
          },
          create: {
            deterministicKey: key,
            npi,
            domain: 'MARKET_POSITION',
            signalCode: 'MARKET_SPECIALTY_GAP',
            severity: 'INFO',
            status: 'ACTIVE',
            dataSource: 'NPPES + COMPUTED',
            evidenceType: 'DENSITY_SIGNAL',
            evidencePayload: {
              state: provider.state,
              specialty: provider.specialty,
              stateCount: stateSpecialtyCount,
              nationalTotal: nationalSpecialtyCount,
              nationalAvgPerState: Math.round(nationalAvgPerState * 10) / 10,
              description: `Specialty gap: ${provider.state} has ${stateSpecialtyCount} ${provider.specialty} providers vs national avg of ${Math.round(nationalAvgPerState * 10) / 10} per state`,
            },
          },
        });
        signals.push(signal);
      }
    }

    this.logger.log(`MARKET_POSITION: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
