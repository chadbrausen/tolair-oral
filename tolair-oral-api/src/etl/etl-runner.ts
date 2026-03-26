/**
 * Standalone ETL runner — run with: npm run etl:full
 * Bootstraps the NestJS app and runs the full ETL pipeline.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EtlScheduler } from './etl.scheduler';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const scheduler = app.get(EtlScheduler);
  const pipeline = process.argv[2] || 'full';

  console.log(`\n🦷 Reveal Oral Health — ETL Runner`);
  console.log(`Pipeline: ${pipeline}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    if (pipeline === 'full') {
      await scheduler.runFullEtl();
    } else {
      // Run individual pipelines
      const nppesService = app.get('NppesService', { strict: false });
      const adaService = app.get('AdaBenchmarkService', { strict: false });
      const hrsaService = app.get('HrsaService', { strict: false });
      const cmsService = app.get('CmsDentalService', { strict: false });
      const stateBoardService = app.get('StateBoardService', { strict: false });

      switch (pipeline) {
        case 'nppes':
          await nppesService.syncNppes();
          break;
        case 'ada':
          await adaService.syncBenchmarks();
          break;
        case 'hrsa':
          await hrsaService.syncHrsa();
          break;
        case 'cms':
          await cmsService.syncCmsDental();
          break;
        case 'state-board':
          await stateBoardService.syncStateBoard();
          break;
        default:
          console.error(`Unknown pipeline: ${pipeline}`);
          console.log('Available: full | nppes | ada | hrsa | cms | state-board');
          process.exit(1);
      }
    }

    console.log(`\nCompleted: ${new Date().toISOString()}`);
  } catch (error) {
    console.error('ETL pipeline failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
