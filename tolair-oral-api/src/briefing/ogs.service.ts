import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// OGS Component Weights (must sum to 1.0)
const OGS_WEIGHTS = {
  benchmarkPosition: 0.25,    // How they compare to ADA benchmarks
  hrsaDesignation: 0.15,      // HPSA shortage area status
  marketDensity: 0.15,        // Competition/capacity in their area
  dsoAffiliation: 0.15,       // DSO governance patterns
  complianceStatus: 0.10,     // License and compliance
  payerDiversity: 0.10,       // Medicaid mix estimation
  signalDensity: 0.10,        // Number and severity of active signals
};

@Injectable()
export class OgsService {
  private readonly logger = new Logger(OgsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the Oral Governance Score for a provider.
   * Returns 0-100 score. Higher = more governance opportunity.
   */
  async computeOgs(npi: string): Promise<{
    score: number;
    components: Record<string, number>;
    version: string;
  }> {
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi },
      include: {
        signals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!provider) {
      throw new Error(`Provider not found: ${npi}`);
    }

    const components: Record<string, number> = {};

    // 1. Benchmark Position (0-100)
    // Higher score = more deviation from benchmarks = more opportunity
    components.benchmarkPosition = await this.scoreBenchmarkPosition(provider);

    // 2. HRSA Designation (0-100)
    // Designated shortage area = higher score (more need)
    if (provider.hrsaHpsaDesignated) {
      components.hrsaDesignation = Math.min(100, 50 + (provider.hrsaHpsaScore || 0) * 2);
    } else {
      components.hrsaDesignation = 20; // Base score for non-HPSA
    }

    // 3. Market Density (0-100)
    components.marketDensity = await this.scoreMarketDensity(provider);

    // 4. DSO Affiliation (0-100)
    if (provider.dsoAffiliation) {
      // DSO-affiliated practices have specific governance patterns
      components.dsoAffiliation = 65 + (provider.dsoConfidence || 0) * 20;
    } else {
      // Independent practices may need governance support
      components.dsoAffiliation = 45;
    }

    // 5. Compliance Status (0-100)
    if (provider.licenseStatus === 'SUSPENDED' || provider.licenseStatus === 'INACTIVE') {
      components.complianceStatus = 95;
    } else if (provider.deactivationDate) {
      components.complianceStatus = 80;
    } else {
      components.complianceStatus = 25;
    }

    // 6. Payer Diversity (0-100)
    // Estimated from state-level Medicaid data
    components.payerDiversity = await this.scorePayerDiversity(provider.state);

    // 7. Signal Density (0-100)
    const activeSignals = provider.signals;
    const criticalCount = activeSignals.filter(s => s.severity === 'CRITICAL').length;
    const elevatedCount = activeSignals.filter(s => s.severity === 'ELEVATED').length;
    const warnCount = activeSignals.filter(s => s.severity === 'WARN').length;
    components.signalDensity = Math.min(100,
      criticalCount * 30 + elevatedCount * 15 + warnCount * 5 + activeSignals.length * 3
    );

    // Weighted sum
    let score = 0;
    score += components.benchmarkPosition * OGS_WEIGHTS.benchmarkPosition;
    score += components.hrsaDesignation * OGS_WEIGHTS.hrsaDesignation;
    score += components.marketDensity * OGS_WEIGHTS.marketDensity;
    score += components.dsoAffiliation * OGS_WEIGHTS.dsoAffiliation;
    score += components.complianceStatus * OGS_WEIGHTS.complianceStatus;
    score += components.payerDiversity * OGS_WEIGHTS.payerDiversity;
    score += components.signalDensity * OGS_WEIGHTS.signalDensity;

    score = Math.round(score * 10) / 10;

    // Persist the score
    await this.prisma.oralProvider.update({
      where: { npi },
      data: {
        ogsScore: score,
        ogsComputedAt: new Date(),
        ogsVersion: 'v1.0',
      },
    });

    return { score, components, version: 'v1.0' };
  }

  private async scoreBenchmarkPosition(provider: any): Promise<number> {
    // Get the provider's national benchmarks for their specialty
    const nationalKey = `${provider.specialty}|NATIONAL|ALL|ALL`;
    const benchmarks = await this.prisma.oralCohortBenchmark.findMany({
      where: { cohortKey: nationalKey },
    });

    if (benchmarks.length === 0) return 50; // Default if no benchmarks

    // Score based on how many benchmarks show opportunity
    // More benchmarks with gaps = higher OGS
    let opportunitySignals = 0;
    for (const bm of benchmarks) {
      if (bm.median != null) {
        // Without actual practice data, we estimate based on practice type
        // DSO-affiliated tend to have more supply-side optimization
        // Solo practices tend to have more overhead opportunity
        if (provider.practiceType === 'INDIVIDUAL_PROVIDER') {
          opportunitySignals += 1; // Solo practices typically have more gaps
        } else if (provider.dsoAffiliation) {
          opportunitySignals += 0.5; // DSOs have some gaps
        } else {
          opportunitySignals += 0.7;
        }
      }
    }
    return Math.min(100, Math.round((opportunitySignals / benchmarks.length) * 80));
  }

  private async scoreMarketDensity(provider: any): Promise<number> {
    // Count providers in same zipCluster
    const peerCount = await this.prisma.oralProvider.count({
      where: {
        zipCluster: provider.zipCluster,
        specialty: provider.specialty,
        npi: { not: provider.npi },
      },
    });

    // More competitors = higher density score = more governance opportunity
    if (peerCount >= 20) return 85;
    if (peerCount >= 10) return 70;
    if (peerCount >= 5) return 55;
    if (peerCount >= 2) return 40;
    return 25;
  }

  private async scorePayerDiversity(state: string): Promise<number> {
    // Look up state Medicaid participation rate
    const medicaid = await this.prisma.oralCohortBenchmark.findFirst({
      where: {
        cohortKey: `STATE_MEDICAID|${state}`,
        metricName: 'medicaid_dentist_participation_rate',
      },
    });

    if (medicaid?.median != null) {
      // Higher Medicaid participation = more payer diversity issues = higher score
      return Math.min(100, Math.round(medicaid.median * 1.2));
    }

    return 45; // Default
  }
}
