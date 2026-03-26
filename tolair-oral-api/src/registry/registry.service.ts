import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Typeahead search across providers and DSOs.
   * Searches displayName, city, dsoAffiliation using case-insensitive contains.
   */
  async search(params: {
    q: string;
    specialty?: string;
    state?: string;
    limit?: number;
  }) {
    const { q, specialty, state, limit = 10 } = params;
    const take = Math.min(limit, 20);

    // Search the search index for fast typeahead
    const where: any = {
      OR: [
        { displayName: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { dsoName: { contains: q, mode: 'insensitive' } },
        { npi: { startsWith: q } },
      ],
    };

    if (specialty) {
      where.specialty = specialty;
    }
    if (state) {
      where.state = state.toUpperCase();
    }

    const results = await this.prisma.oralSearchIndex.findMany({
      where,
      take,
      orderBy: [
        { ogsScore: 'desc' }, // Higher OGS first (more actionable)
      ],
      select: {
        npi: true,
        displayName: true,
        city: true,
        state: true,
        specialty: true,
        dsoName: true,
        ogsScore: true,
      },
    });

    return {
      results,
      count: results.length,
      query: q,
    };
  }

  /**
   * Full provider profile by NPI.
   * Returns all fields + top 3 signal previews + DSO info.
   */
  async findByNpi(npi: string) {
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
      include: {
        signals: {
          where: { status: 'ACTIVE' },
          orderBy: { severity: 'asc' }, // CRITICAL first
          take: 3,
          select: {
            id: true,
            domain: true,
            signalCode: true,
            severity: true,
            dollarImpactMin: true,
            dollarImpactMax: true,
            impactUnit: true,
            evidenceType: true,
            dataSource: true,
            narrativeText: true,
            computedAt: true,
          },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException(`Provider not found: NPI ${npi}`);
    }

    // If DSO-affiliated, get the DSO info
    let dsoInfo: any = null;
    if (provider.dsoAffiliation) {
      dsoInfo = await this.prisma.oralDso.findFirst({
        where: { dsoName: provider.dsoAffiliation },
        select: {
          dsoName: true,
          ownershipType: true,
          parentCompany: true,
          estimatedLocations: true,
          estimatedDentists: true,
          statesPresent: true,
          peSponsors: true,
        },
      });
    }

    return {
      provider,
      dsoInfo,
      signalPreviewCount: provider.signals.length,
    };
  }

  /**
   * DSO profile by URL slug (lowercase, hyphenated name).
   */
  async findDsoBySlug(slug: string) {
    // Convert slug back to name pattern: "heartland-dental" -> search for it
    const searchName = slug.replace(/-/g, ' ');

    const dso = await this.prisma.oralDso.findFirst({
      where: {
        dsoName: { contains: searchName, mode: 'insensitive' },
      },
    });

    if (!dso) {
      throw new NotFoundException(`DSO not found: ${slug}`);
    }

    // Get affiliated provider count and state distribution
    const affiliatedProviders = await this.prisma.oralProvider.groupBy({
      by: ['state', 'specialty'],
      where: { dsoAffiliation: dso.dsoName },
      _count: { npi: true },
    });

    const totalProviders = affiliatedProviders.reduce(
      (sum, g) => sum + g._count.npi,
      0,
    );

    const stateDistribution: Record<string, number> = {};
    const specialtyDistribution: Record<string, number> = {};
    for (const g of affiliatedProviders) {
      stateDistribution[g.state] = (stateDistribution[g.state] || 0) + g._count.npi;
      specialtyDistribution[g.specialty] = (specialtyDistribution[g.specialty] || 0) + g._count.npi;
    }

    // Get top OGS-scored providers in this DSO
    const topProviders = await this.prisma.oralProvider.findMany({
      where: { dsoAffiliation: dso.dsoName },
      orderBy: { ogsScore: 'desc' },
      take: 10,
      select: {
        npi: true,
        displayName: true,
        city: true,
        state: true,
        ogsScore: true,
        specialty: true,
      },
    });

    return {
      dso,
      affiliatedProviderCount: totalProviders,
      stateDistribution,
      specialtyDistribution,
      topProviders,
    };
  }

  /**
   * State-level summary.
   */
  async getStateSummary(stateCode: string) {
    const state = stateCode.toUpperCase();

    // Provider count by specialty
    const specialtyCounts = await this.prisma.oralProvider.groupBy({
      by: ['specialty'],
      where: { state },
      _count: { npi: true },
    });

    // HPSA designation rate
    const [totalInState, hpsaDesignated] = await Promise.all([
      this.prisma.oralProvider.count({ where: { state } }),
      this.prisma.oralProvider.count({ where: { state, hrsaHpsaDesignated: true } }),
    ]);

    const hpsaRate = totalInState > 0 ? (hpsaDesignated / totalInState) * 100 : 0;

    // Top 5 DSOs present
    const dsoCounts = await this.prisma.oralProvider.groupBy({
      by: ['dsoAffiliation'],
      where: { state, dsoAffiliation: { not: null } },
      _count: { npi: true },
      orderBy: { _count: { npi: 'desc' } },
      take: 5,
    });

    // Average OGS score
    const ogsAgg = await this.prisma.oralProvider.aggregate({
      where: { state, ogsScore: { not: null } },
      _avg: { ogsScore: true },
      _min: { ogsScore: true },
      _max: { ogsScore: true },
    });

    return {
      state,
      totalProviders: totalInState,
      specialtyCounts: specialtyCounts.map((s) => ({
        specialty: s.specialty,
        count: s._count.npi,
      })),
      hpsaDesignatedCount: hpsaDesignated,
      hpsaDesignationRate: Math.round(hpsaRate * 10) / 10,
      topDsos: dsoCounts.map((d) => ({
        name: d.dsoAffiliation,
        providerCount: d._count.npi,
      })),
      ogsStats: {
        average: ogsAgg._avg.ogsScore ? Math.round(ogsAgg._avg.ogsScore * 10) / 10 : null,
        min: ogsAgg._min.ogsScore,
        max: ogsAgg._max.ogsScore,
      },
    };
  }
}
