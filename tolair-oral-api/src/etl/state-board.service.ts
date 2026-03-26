import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 500;

@Injectable()
export class StateBoardService {
  private readonly logger = new Logger(StateBoardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bulk sync license status based on NPPES deactivation dates.
   *
   * Full state dental board API integration (scraping individual state
   * board portals) is planned for a future wave. For now, we derive
   * license status from NPPES enumeration/deactivation records:
   *   - Providers with no deactivationDate -> ACTIVE
   *   - Providers with a deactivationDate  -> INACTIVE
   */
  async syncStateBoard(): Promise<{ updated: number }> {
    this.logger.log(
      'Starting state board license status sync (NPPES-derived)',
    );
    this.logger.warn(
      'Full state board API integration is not yet implemented. ' +
        'Using NPPES deactivation dates as a proxy for license status.',
    );

    let updated = 0;

    // Set ACTIVE for providers without a deactivation date
    const activateResult = await this.prisma.oralProvider.updateMany({
      where: {
        deactivationDate: null,
        OR: [
          { licenseStatus: null },
          { licenseStatus: { not: 'ACTIVE' } },
        ],
      },
      data: {
        licenseStatus: 'ACTIVE',
        lastEnrichedAt: new Date(),
      },
    });
    updated += activateResult.count;
    this.logger.log(
      `Set ${activateResult.count} providers to ACTIVE (no deactivation date)`,
    );

    // Set INACTIVE for providers with a deactivation date
    const deactivateResult = await this.prisma.oralProvider.updateMany({
      where: {
        deactivationDate: { not: null },
        OR: [
          { licenseStatus: null },
          { licenseStatus: { not: 'INACTIVE' } },
        ],
      },
      data: {
        licenseStatus: 'INACTIVE',
        isActive: false,
        lastEnrichedAt: new Date(),
      },
    });
    updated += deactivateResult.count;
    this.logger.log(
      `Set ${deactivateResult.count} providers to INACTIVE (deactivation date present)`,
    );

    this.logger.log(
      `State board sync complete: ${updated} provider license statuses updated`,
    );

    return { updated };
  }

  /**
   * Manually update license information for a single provider.
   * Used for one-off corrections or when state board data is obtained
   * through manual lookup.
   */
  async updateProviderLicense(
    npi: string,
    licenseState: string,
    licenseNumber: string,
    status: string,
  ): Promise<void> {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED'];
    if (!validStatuses.includes(status)) {
      throw new Error(
        `Invalid license status "${status}". Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
      select: { id: true, displayName: true },
    });

    if (!provider) {
      throw new Error(`Provider with NPI ${npi} not found`);
    }

    await this.prisma.oralProvider.update({
      where: { npi },
      data: {
        licenseState,
        licenseNumber,
        licenseStatus: status,
        isActive: status === 'ACTIVE',
        lastEnrichedAt: new Date(),
      },
    });

    this.logger.log(
      `Updated license for ${provider.displayName} (NPI: ${npi}): ` +
        `state=${licenseState}, number=${licenseNumber}, status=${status}`,
    );
  }
}
