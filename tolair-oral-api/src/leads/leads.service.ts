import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HubspotService } from './hubspot.service';
import { EmailService } from './email.service';
import { randomBytes } from 'crypto';
import { hashEmail, maskNpi } from '../common/log-sanitizer';

export interface CreateLeadDto {
  npi: string;
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hubspotService: HubspotService,
    private readonly emailService: EmailService,
  ) {}

  async createLead(dto: CreateLeadDto) {
    // Validate NPI format
    if (!/^\d{10}$/.test(dto.npi)) {
      throw new BadRequestException('NPI must be a 10-digit number');
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(dto.email)) {
      throw new BadRequestException('Invalid email address');
    }

    // Check if provider exists and get top signal for email teaser
    const provider = await this.prisma.oralProvider.findUnique({
      where: { npi: dto.npi },
      select: {
        npi: true,
        displayName: true,
        practiceType: true,
        specialty: true,
        dsoAffiliation: true,
        city: true,
        state: true,
        ogsScore: true,
        signals: {
          where: { status: 'ACTIVE' },
          orderBy: [{ severity: 'asc' }, { dollarImpactMax: 'desc' }],
          take: 1,
          select: { domain: true, severity: true },
        },
      },
    });

    if (!provider) {
      throw new BadRequestException(`Provider not found: NPI ${dto.npi}`);
    }

    const topSignal = provider.signals[0] || null;

    // Check for existing lead with same email + NPI (return existing session)
    const existingLead = await this.prisma.oralLead.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        npi: dto.npi,
        sessionExpiry: { gt: new Date() },
      },
    });

    if (existingLead) {
      this.logger.log(`Returning existing session for ${hashEmail(dto.email)} / NPI ${maskNpi(dto.npi)}`);
      return {
        sessionToken: existingLead.sessionToken,
        sessionExpiry: existingLead.sessionExpiry,
        briefingUrl: `/provider/${dto.npi}`,
        existing: true,
      };
    }

    // Generate session token (URL-safe, 48 chars)
    const sessionToken = randomBytes(36).toString('base64url');
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create lead
    const lead = await this.prisma.oralLead.create({
      data: {
        npi: dto.npi,
        practiceType: provider.practiceType,
        specialty: provider.specialty,
        dsoAffiliation: provider.dsoAffiliation,
        city: provider.city,
        state: provider.state,
        ogsScore: provider.ogsScore,
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        title: dto.title,
        sessionToken,
        sessionExpiry,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        referrerUrl: dto.referrerUrl,
      },
    });

    // Create session
    await this.prisma.oralSession.create({
      data: {
        token: sessionToken,
        npi: dto.npi,
        leadId: lead.id,
        expiresAt: sessionExpiry,
      },
    });

    // Fire async tasks (don't await — non-blocking)
    this.hubspotService.syncContact({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      title: dto.title,
      npi: dto.npi,
      practiceName: provider.displayName,
      specialty: provider.specialty,
      dsoAffiliation: provider.dsoAffiliation,
      city: provider.city,
      state: provider.state,
      ogsScore: provider.ogsScore,
      sessionToken,
      utmSource: dto.utmSource,
    }).catch(err => this.logger.error(`HubSpot sync failed: ${err.message}`));

    this.emailService.sendBriefingEmail({
      to: dto.email.toLowerCase(),
      firstName: dto.firstName,
      practiceName: provider.displayName,
      npi: dto.npi,
      sessionToken,
      ogsScore: provider.ogsScore,
      topSignalDomain: topSignal?.domain,
      topSignalSeverity: topSignal?.severity,
    }).catch(err => this.logger.error(`Email send failed: ${err.message}`));

    this.logger.log(`Lead created: ${hashEmail(dto.email)} for NPI ${maskNpi(dto.npi)}`);

    return {
      sessionToken,
      sessionExpiry,
      briefingUrl: `/provider/${dto.npi}`,
      existing: false,
    };
  }

  async validateSession(token: string): Promise<{
    valid: boolean;
    npi?: string;
    leadId?: string;
    expiresAt?: Date;
  }> {
    const session = await this.prisma.oralSession.findUnique({
      where: { token },
    });

    if (!session) {
      return { valid: false };
    }

    if (session.expiresAt < new Date()) {
      return { valid: false };
    }

    return {
      valid: true,
      npi: session.npi,
      leadId: session.leadId || undefined,
      expiresAt: session.expiresAt,
    };
  }
}
