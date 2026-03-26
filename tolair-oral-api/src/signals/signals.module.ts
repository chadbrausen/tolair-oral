import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SignalEngineService } from './signal-engine.service';
import { DsoContractService } from './dso-contract.service';
import { SupplySpendService } from './supply-spend.service';
import { RevenueCycleService } from './revenue-cycle.service';
import { WorkforceService } from './workforce.service';
import { MarketPositionService } from './market-position.service';
import { ComplianceLicensingService } from './compliance-licensing.service';
import { HrsaDesignationService } from './hrsa-designation.service';
import { BenchmarkPositionService } from './benchmark-position.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SignalEngineService,
    DsoContractService,
    SupplySpendService,
    RevenueCycleService,
    WorkforceService,
    MarketPositionService,
    ComplianceLicensingService,
    HrsaDesignationService,
    BenchmarkPositionService,
  ],
  exports: [SignalEngineService],
})
export class SignalsModule {}
