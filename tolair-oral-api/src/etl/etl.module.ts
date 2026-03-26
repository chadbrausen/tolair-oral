import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NppesService } from './nppes.service';
import { AdaBenchmarkService } from './ada-benchmark.service';
import { HrsaService } from './hrsa.service';
import { CmsDentalService } from './cms-dental.service';
import { StateBoardService } from './state-board.service';
import { EtlScheduler } from './etl.scheduler';

@Module({
  imports: [PrismaModule],
  providers: [
    NppesService,
    AdaBenchmarkService,
    HrsaService,
    CmsDentalService,
    StateBoardService,
    EtlScheduler,
  ],
  exports: [
    NppesService,
    AdaBenchmarkService,
    HrsaService,
    CmsDentalService,
    StateBoardService,
    EtlScheduler,
  ],
})
export class EtlModule {}
