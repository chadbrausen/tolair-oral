import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NppesService } from './nppes.service';
import { AdaBenchmarkService } from './ada-benchmark.service';
import { HrsaService } from './hrsa.service';
import { CmsDentalService } from './cms-dental.service';
import { StateBoardService } from './state-board.service';

@Injectable()
export class EtlScheduler {
  private readonly logger = new Logger(EtlScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nppesService: NppesService,
    private readonly adaBenchmarkService: AdaBenchmarkService,
    private readonly hrsaService: HrsaService,
    private readonly cmsDentalService: CmsDentalService,
    private readonly stateBoardService: StateBoardService,
  ) {}

  // Sunday 2AM UTC
  @Cron('0 2 * * 0')
  async handleWeeklySync() {
    await this.runFullEtl();
  }

  async runFullEtl(): Promise<void> {
    const fullStart = Date.now();
    this.logger.log('═══ Starting FULL ETL pipeline ═══');

    const fullLog = await this.prisma.oralEtlLog.create({
      data: { pipeline: 'FULL', status: 'STARTED' },
    });

    const results: Record<string, unknown> = {};

    // 1. NPPES — provider registry
    results.nppes = await this.runPipeline('NPPES', () => this.nppesService.syncNppes());

    // 2. ADA Benchmarks — cohort benchmarks
    results.ada = await this.runPipeline('ADA_BENCHMARK', () => this.adaBenchmarkService.syncBenchmarks());

    // 3. HRSA — HPSA enrichment (depends on providers existing)
    results.hrsa = await this.runPipeline('HRSA', () => this.hrsaService.syncHrsa());

    // 4. CMS Dental — state-level Medicaid benchmarks
    results.cms = await this.runPipeline('CMS_DENTAL', () => this.cmsDentalService.syncCmsDental());

    // 5. State Board — license status derivation
    results.stateBoard = await this.runPipeline('STATE_BOARD', () => this.stateBoardService.syncStateBoard());

    const duration = Date.now() - fullStart;
    await this.prisma.oralEtlLog.update({
      where: { id: fullLog.id },
      data: {
        status: 'COMPLETED',
        duration,
        details: results as object,
        completedAt: new Date(),
      },
    });

    this.logger.log(`═══ FULL ETL pipeline complete in ${(duration / 1000).toFixed(1)}s ═══`);
  }

  private async runPipeline<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<T | { error: string }> {
    const start = Date.now();
    this.logger.log(`── Starting ${name} pipeline ──`);

    const log = await this.prisma.oralEtlLog.create({
      data: { pipeline: name, status: 'STARTED' },
    });

    try {
      const result = await fn();
      const duration = Date.now() - start;

      await this.prisma.oralEtlLog.update({
        where: { id: log.id },
        data: {
          status: 'COMPLETED',
          duration,
          details: result as object,
          completedAt: new Date(),
        },
      });

      this.logger.log(`── ${name} complete in ${(duration / 1000).toFixed(1)}s ──`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.prisma.oralEtlLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          duration,
          error: errorMessage,
          completedAt: new Date(),
        },
      });

      this.logger.error(`── ${name} FAILED after ${(duration / 1000).toFixed(1)}s: ${errorMessage} ──`);
      return { error: errorMessage };
    }
  }
}
