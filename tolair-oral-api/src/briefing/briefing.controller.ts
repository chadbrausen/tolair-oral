import {
  Controller,
  Get,
  Param,
  BadRequestException,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BriefingService } from './briefing.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('oral')
export class BriefingController {
  constructor(
    private readonly briefingService: BriefingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('briefing/:npi/preview')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getBriefingPreview(@Param('npi') npi: string) {
    if (!/^\d{10}$/.test(npi)) {
      throw new BadRequestException('NPI must be a 10-digit number');
    }

    return this.briefingService.getBriefingPreview(npi);
  }

  @Get('briefing/:npi')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getBriefing(
    @Param('npi') npi: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!/^\d{10}$/.test(npi)) {
      throw new BadRequestException('NPI must be a 10-digit number');
    }

    // Validate session token
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException(
        'Session token required. Submit your email at POST /oral/leads to get access.',
      );
    }

    // Verify session
    const session = await this.prisma.oralSession.findUnique({
      where: { token },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session token');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please submit your email again.');
    }

    // Update session request count
    await this.prisma.oralSession.update({
      where: { id: session.id },
      data: {
        requestCount: { increment: 1 },
        lastRequest: new Date(),
      },
    });

    return this.briefingService.generateBriefing(npi);
  }
}
