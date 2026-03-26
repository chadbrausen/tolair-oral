import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Map state codes to ADA Census regions
const STATE_TO_REGION: Record<string, string> = {
  CT: 'NORTHEAST', ME: 'NORTHEAST', MA: 'NORTHEAST', NH: 'NORTHEAST',
  RI: 'NORTHEAST', VT: 'NORTHEAST', NJ: 'NORTHEAST', NY: 'NORTHEAST', PA: 'NORTHEAST',
  IL: 'MIDWEST', IN: 'MIDWEST', MI: 'MIDWEST', OH: 'MIDWEST', WI: 'MIDWEST',
  IA: 'MIDWEST', KS: 'MIDWEST', MN: 'MIDWEST', MO: 'MIDWEST', NE: 'MIDWEST',
  ND: 'MIDWEST', SD: 'MIDWEST',
  DE: 'SOUTH', FL: 'SOUTH', GA: 'SOUTH', MD: 'SOUTH', NC: 'SOUTH',
  SC: 'SOUTH', VA: 'SOUTH', DC: 'SOUTH', WV: 'SOUTH',
  AL: 'SOUTH', KY: 'SOUTH', MS: 'SOUTH', TN: 'SOUTH',
  AR: 'SOUTH', LA: 'SOUTH', OK: 'SOUTH', TX: 'SOUTH',
  AZ: 'WEST', CO: 'WEST', ID: 'WEST', MT: 'WEST', NV: 'WEST',
  NM: 'WEST', UT: 'WEST', WY: 'WEST',
  AK: 'WEST', CA: 'WEST', HI: 'WEST', OR: 'WEST', WA: 'WEST',
};

@Injectable()
export class CohortService {
  private readonly logger = new Logger(CohortService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the cohort key for a provider.
   * Format: {specialty}|{region}|{practiceSize}|{dsoStatus}
   */
  buildCohortKey(provider: {
    specialty: string;
    state: string;
    practiceType: string;
    dsoAffiliation: string | null;
  }): string {
    const region = STATE_TO_REGION[provider.state] || 'NATIONAL';

    let practiceSize = 'ALL';
    if (provider.practiceType === 'INDIVIDUAL_PROVIDER') practiceSize = 'SOLO';
    else if (provider.practiceType === 'GROUP_PRACTICE') practiceSize = 'SMALL_GROUP';
    else if (provider.practiceType === 'DSO_AFFILIATED') practiceSize = 'LARGE_GROUP';

    const dsoStatus = provider.dsoAffiliation ? 'DSO_AFFILIATED' : 'INDEPENDENT';

    return `${provider.specialty}|${region}|${practiceSize}|${dsoStatus}`;
  }

  /**
   * Assigns a provider to their cohort. Returns the cohort key and peer count.
   */
  async assignCohort(npi: string): Promise<{
    cohortKey: string;
    peerCount: number;
    benchmarks: any[];
  }> {
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
      select: { id: true, specialty: true, state: true, practiceType: true, dsoAffiliation: true },
    });

    if (!provider) {
      throw new Error(`Provider not found: ${npi}`);
    }

    const cohortKey = this.buildCohortKey(provider);

    // Upsert cohort assignment
    await this.prisma.oralCohortAssignment.upsert({
      where: {
        providerId_cohortKey: {
          providerId: provider.id,
          cohortKey,
        },
      },
      create: {
        providerId: provider.id,
        cohortKey,
      },
      update: {
        assignedAt: new Date(),
      },
    });

    // Count peers in same cohort
    const peerCount = await this.prisma.oralCohortAssignment.count({
      where: { cohortKey },
    });

    // Get benchmarks for this cohort - try exact key first, fall back to broader keys
    let benchmarks = await this.prisma.oralCohortBenchmark.findMany({
      where: { cohortKey },
    });

    // If no exact match, try national-level for the specialty
    if (benchmarks.length === 0) {
      const nationalKey = `${provider.specialty}|NATIONAL|ALL|ALL`;
      benchmarks = await this.prisma.oralCohortBenchmark.findMany({
        where: { cohortKey: nationalKey },
      });
    }

    return { cohortKey, peerCount, benchmarks };
  }
}
