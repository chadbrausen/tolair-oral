import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DsoContractService } from './dso-contract.service';
import { SupplySpendService } from './supply-spend.service';
import { RevenueCycleService } from './revenue-cycle.service';
import { WorkforceService } from './workforce.service';
import { MarketPositionService } from './market-position.service';
import { ComplianceLicensingService } from './compliance-licensing.service';
import { HrsaDesignationService } from './hrsa-designation.service';
import { BenchmarkPositionService } from './benchmark-position.service';

@Injectable()
export class SignalEngineService {
  private readonly logger = new Logger(SignalEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dsoContractService: DsoContractService,
    private readonly supplySpendService: SupplySpendService,
    private readonly revenueCycleService: RevenueCycleService,
    private readonly workforceService: WorkforceService,
    private readonly marketPositionService: MarketPositionService,
    private readonly complianceLicensingService: ComplianceLicensingService,
    private readonly hrsaDesignationService: HrsaDesignationService,
    private readonly benchmarkPositionService: BenchmarkPositionService,
  ) {}

  async computeSignals(npi: string): Promise<{
    totalSignals: number;
    byDomain: Record<string, number>;
    bySeverity: Record<string, number>;
    signals: any[];
  }> {
    this.logger.log(`Computing signals for NPI ${npi}...`);
    const startTime = Date.now();

    // Run all 8 domains (some can run in parallel since they're independent)
    const [
      dsoContractSignals,
      supplySpendSignals,
      revenueCycleSignals,
      workforceSignals,
      marketPositionSignals,
      complianceLicensingSignals,
      hrsaDesignationSignals,
    ] = await Promise.all([
      this.safeEvaluate('DSO_CONTRACT', () => this.dsoContractService.evaluate(npi)),
      this.safeEvaluate('SUPPLY_SPEND', () => this.supplySpendService.evaluate(npi)),
      this.safeEvaluate('REVENUE_CYCLE', () => this.revenueCycleService.evaluate(npi)),
      this.safeEvaluate('WORKFORCE', () => this.workforceService.evaluate(npi)),
      this.safeEvaluate('MARKET_POSITION', () => this.marketPositionService.evaluate(npi)),
      this.safeEvaluate('COMPLIANCE_LICENSING', () => this.complianceLicensingService.evaluate(npi)),
      this.safeEvaluate('HRSA_DESIGNATION', () => this.hrsaDesignationService.evaluate(npi)),
    ]);

    // Benchmark position runs AFTER other signals since it reads them
    const benchmarkPositionSignals = await this.safeEvaluate(
      'BENCHMARK_POSITION',
      () => this.benchmarkPositionService.evaluate(npi),
    );

    const allSignals = [
      ...dsoContractSignals,
      ...supplySpendSignals,
      ...revenueCycleSignals,
      ...workforceSignals,
      ...marketPositionSignals,
      ...complianceLicensingSignals,
      ...hrsaDesignationSignals,
      ...benchmarkPositionSignals,
    ];

    // Aggregate by domain
    const byDomain: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const s of allSignals) {
      const domain = s.signalCode?.split('_').slice(0, -1).join('_') || 'UNKNOWN';
      // Actually use the domain from the signal
      byDomain[s.domain || domain] = (byDomain[s.domain || domain] || 0) + 1;
      bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
    }

    const duration = Date.now() - startTime;
    this.logger.log(`Signal computation for NPI ${npi}: ${allSignals.length} signals in ${duration}ms`);

    return {
      totalSignals: allSignals.length,
      byDomain,
      bySeverity,
      signals: allSignals,
    };
  }

  private async safeEvaluate(domain: string, fn: () => Promise<any[]>): Promise<any[]> {
    try {
      return await fn();
    } catch (error: any) {
      this.logger.error(`Signal domain ${domain} failed: ${error.message}`);
      return [];
    }
  }
}
