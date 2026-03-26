import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class HrsaDesignationService {
  private readonly logger = new Logger(HrsaDesignationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) {
      this.logger.warn(`Provider ${npi} not found`);
      return [];
    }

    const signals: any[] = [];

    // HRSA_DENTAL_SHORTAGE_AREA: provider is HPSA designated
    if (provider.hrsaHpsaDesignated) {
      const key = deterministicKey(npi, 'HRSA_DESIGNATION', 'HRSA_DENTAL_SHORTAGE_AREA');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'INFO',
          status: 'ACTIVE',
          evidencePayload: {
            hpsaDesignated: true,
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `Provider is located in a dental Health Professional Shortage Area (HPSA)`,
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'HRSA_DESIGNATION',
          signalCode: 'HRSA_DENTAL_SHORTAGE_AREA',
          severity: 'INFO',
          status: 'ACTIVE',
          dataSource: 'HRSA',
          evidenceType: 'HRSA_DESIGNATION',
          evidencePayload: {
            hpsaDesignated: true,
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `Provider is located in a dental Health Professional Shortage Area (HPSA)`,
          },
        },
      });
      signals.push(signal);
    }

    // HRSA_HIGH_HPSA_SCORE: HPSA score >= 15
    if (provider.hrsaHpsaScore !== null && provider.hrsaHpsaScore !== undefined && provider.hrsaHpsaScore >= 15) {
      const key = deterministicKey(npi, 'HRSA_DESIGNATION', 'HRSA_HIGH_HPSA_SCORE');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'WARN',
          status: 'ACTIVE',
          evidencePayload: {
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            threshold: 15,
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `High HPSA score of ${provider.hrsaHpsaScore} (threshold: 15) indicates significant dental shortage`,
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'HRSA_DESIGNATION',
          signalCode: 'HRSA_HIGH_HPSA_SCORE',
          severity: 'WARN',
          status: 'ACTIVE',
          dataSource: 'HRSA',
          evidenceType: 'HRSA_DESIGNATION',
          evidencePayload: {
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            threshold: 15,
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `High HPSA score of ${provider.hrsaHpsaScore} (threshold: 15) indicates significant dental shortage`,
          },
        },
      });
      signals.push(signal);
    }

    // HRSA_FQHC_ADJACENT: practiceType is FQHC or CHC
    if (
      provider.practiceType === 'FEDERAL_QUALIFIED_HEALTH_CENTER' ||
      provider.practiceType === 'COMMUNITY_HEALTH_CENTER'
    ) {
      const key = deterministicKey(npi, 'HRSA_DESIGNATION', 'HRSA_FQHC_ADJACENT');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'INFO',
          status: 'ACTIVE',
          evidencePayload: {
            practiceType: provider.practiceType,
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `Provider practice type is ${provider.practiceType}, indicating FQHC/CHC adjacency`,
          },
          dataSource: 'HRSA',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'HRSA_DESIGNATION',
          signalCode: 'HRSA_FQHC_ADJACENT',
          severity: 'INFO',
          status: 'ACTIVE',
          dataSource: 'HRSA',
          evidenceType: 'HRSA_DESIGNATION',
          evidencePayload: {
            practiceType: provider.practiceType,
            hpsaScore: provider.hrsaHpsaScore,
            shortageType: 'DENTAL',
            state: provider.state,
            city: provider.city,
            zipCode: provider.zip,
            description: `Provider practice type is ${provider.practiceType}, indicating FQHC/CHC adjacency`,
          },
        },
      });
      signals.push(signal);
    }

    this.logger.log(`HRSA_DESIGNATION: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
