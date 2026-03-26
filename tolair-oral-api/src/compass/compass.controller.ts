import {
  Controller,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CompassService } from './compass.service';
import type { CompassQueryDto } from './compass.service';

@Controller('oral')
export class CompassController {
  constructor(private readonly compassService: CompassService) {}

  @Post('compass/query')
  @Throttle({ default: { limit: 20, ttl: 86400000 } }) // 20 per day
  async query(@Body() body: CompassQueryDto) {
    if (!body.npi || !body.query || !body.sessionToken) {
      throw new BadRequestException('npi, query, and sessionToken are required');
    }

    if (body.query.trim().length < 3) {
      throw new BadRequestException('Query must be at least 3 characters');
    }

    if (body.query.length > 2000) {
      throw new BadRequestException('Query must be under 2000 characters');
    }

    return this.compassService.query(body);
  }
}
