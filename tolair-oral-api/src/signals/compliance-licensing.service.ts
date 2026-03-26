import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

function deterministicKey(npi: string, domain: string, signalCode: string, context: string = ''): string {
  return createHash('sha256').update(`${npi}|${domain}|${signalCode}|${context}`).digest('hex');
}

@Injectable()
export class ComplianceLicensingService {
  private readonly logger = new Logger(ComplianceLicensingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(npi: string): Promise<any[]> {
    const provider = await this.prisma.oralProvider.findUnique({ where: { npi } });
    if (!provider) {
      this.logger.warn(`Provider ${npi} not found`);
      return [];
    }

    const signals: any[] = [];

    // COMPLIANCE_LICENSE_INACTIVE: licenseStatus is INACTIVE or SUSPENDED
    if (provider.licenseStatus === 'INACTIVE' || provider.licenseStatus === 'SUSPENDED') {
      const key = deterministicKey(npi, 'COMPLIANCE_LICENSING', 'COMPLIANCE_LICENSE_INACTIVE');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'CRITICAL',
          status: 'ACTIVE',
          evidencePayload: {
            licenseStatus: provider.licenseStatus,
            licenseState: provider.licenseState,
            providerName: provider.displayName,
            description: `Provider license is ${provider.licenseStatus} in ${provider.licenseState || 'unknown state'}`,
          },
          dataSource: 'STATE_BOARD',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'COMPLIANCE_LICENSING',
          signalCode: 'COMPLIANCE_LICENSE_INACTIVE',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          dataSource: 'STATE_BOARD',
          evidenceType: 'REGULATORY',
          evidencePayload: {
            licenseStatus: provider.licenseStatus,
            licenseState: provider.licenseState,
            providerName: provider.displayName,
            description: `Provider license is ${provider.licenseStatus} in ${provider.licenseState || 'unknown state'}`,
          },
        },
      });
      signals.push(signal);
    }

    // COMPLIANCE_NPI_DEACTIVATED: deactivationDate is not null
    if (provider.deactivationDate !== null) {
      const deactivationDateStr =
        provider.deactivationDate instanceof Date
          ? provider.deactivationDate.toISOString().split('T')[0]
          : String(provider.deactivationDate);

      const key = deterministicKey(npi, 'COMPLIANCE_LICENSING', 'COMPLIANCE_NPI_DEACTIVATED');
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'ELEVATED',
          status: 'ACTIVE',
          evidencePayload: {
            deactivationDate: provider.deactivationDate,
            npi,
            providerName: provider.displayName,
            description: `NPI ${npi} was deactivated on ${deactivationDateStr}`,
          },
          dataSource: 'NPPES',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'COMPLIANCE_LICENSING',
          signalCode: 'COMPLIANCE_NPI_DEACTIVATED',
          severity: 'ELEVATED',
          status: 'ACTIVE',
          dataSource: 'NPPES',
          evidenceType: 'REGULATORY',
          evidencePayload: {
            deactivationDate: provider.deactivationDate,
            npi,
            providerName: provider.displayName,
            description: `NPI ${npi} was deactivated on ${deactivationDateStr}`,
          },
        },
      });
      signals.push(signal);
    }

    // COMPLIANCE_NO_STATE_LICENSE: licenseState doesn't match provider state
    if (provider.licenseState && provider.state && provider.licenseState !== provider.state) {
      const key = deterministicKey(npi, 'COMPLIANCE_LICENSING', 'COMPLIANCE_NO_STATE_LICENSE', provider.state);
      const signal = await this.prisma.oralSignal.upsert({
        where: { deterministicKey: key },
        update: {
          severity: 'ELEVATED',
          status: 'ACTIVE',
          evidencePayload: {
            practiceState: provider.state,
            licenseState: provider.licenseState,
            providerName: provider.displayName,
            description: `Provider practices in ${provider.state} but license is in ${provider.licenseState}`,
          },
          dataSource: 'NPPES',
          computedAt: new Date(),
        },
        create: {
          deterministicKey: key,
          npi,
          domain: 'COMPLIANCE_LICENSING',
          signalCode: 'COMPLIANCE_NO_STATE_LICENSE',
          severity: 'ELEVATED',
          status: 'ACTIVE',
          dataSource: 'NPPES',
          evidenceType: 'REGULATORY',
          evidencePayload: {
            practiceState: provider.state,
            licenseState: provider.licenseState,
            providerName: provider.displayName,
            description: `Provider practices in ${provider.state} but license is in ${provider.licenseState}`,
          },
        },
      });
      signals.push(signal);
    }

    this.logger.log(`COMPLIANCE_LICENSING: ${signals.length} signals for NPI ${npi}`);
    return signals;
  }
}
