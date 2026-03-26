import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegistryService } from './registry.service';

@Controller('oral')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async search(
    @Query('q') q: string,
    @Query('specialty') specialty?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Query must be at least 2 characters');
    }

    return this.registryService.search({
      q: q.trim(),
      specialty,
      state,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get('entity/:npi')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getByNpi(@Param('npi') npi: string) {
    if (!/^\d{10}$/.test(npi)) {
      throw new BadRequestException('NPI must be a 10-digit number');
    }

    return this.registryService.findByNpi(npi);
  }

  @Get('dso/:slug')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getDsoBySlug(@Param('slug') slug: string) {
    if (!slug || slug.trim().length < 2) {
      throw new BadRequestException('Invalid DSO slug');
    }

    return this.registryService.findDsoBySlug(slug.trim());
  }

  @Get('state/:stateCode/summary')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getStateSummary(@Param('stateCode') stateCode: string) {
    if (!/^[A-Za-z]{2}$/.test(stateCode)) {
      throw new BadRequestException('State code must be a 2-letter abbreviation');
    }

    return this.registryService.getStateSummary(stateCode);
  }
}
