import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RegistryModule } from './registry/registry.module';
import { EtlModule } from './etl/etl.module';
import { SignalsModule } from './signals/signals.module';
import { BriefingModule } from './briefing/briefing.module';
import { LeadsModule } from './leads/leads.module';
import { CompassModule } from './compass/compass.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 5 },
      { name: 'medium', ttl: 60000, limit: 60 },
      { name: 'long', ttl: 3600000, limit: 200 },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RegistryModule,
    EtlModule,
    SignalsModule,
    BriefingModule,
    LeadsModule,
    CompassModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
