import {
  Controller,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import type { CreateLeadDto } from './leads.service';

@Controller('oral')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('leads')
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 per hour per IP
  async createLead(@Body() body: CreateLeadDto) {
    if (!body.npi || !body.email) {
      throw new BadRequestException('npi and email are required');
    }

    return this.leadsService.createLead(body);
  }
}
