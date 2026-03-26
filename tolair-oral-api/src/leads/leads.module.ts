import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsService } from './leads.service';
import { HubspotService } from './hubspot.service';
import { EmailService } from './email.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsService, HubspotService, EmailService],
  exports: [LeadsService],
})
export class LeadsModule {}
