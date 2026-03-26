import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SignalsModule } from '../signals/signals.module';
import { BriefingService } from './briefing.service';
import { OgsService } from './ogs.service';
import { CohortService } from './cohort.service';
import { BriefingController } from './briefing.controller';

@Module({
  imports: [PrismaModule, SignalsModule],
  controllers: [BriefingController],
  providers: [BriefingService, OgsService, CohortService],
  exports: [BriefingService],
})
export class BriefingModule {}
