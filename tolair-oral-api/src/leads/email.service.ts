import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { hashEmail } from '../common/log-sanitizer';

export interface BriefingEmailData {
  to: string;
  firstName?: string;
  practiceName: string;
  npi: string;
  sessionToken: string;
  ogsScore: number | null;
  topSignalDomain?: string;
  topSignalSeverity?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    } else {
      this.logger.warn('SMTP not configured — emails will be logged only');
    }
  }

  async sendBriefingEmail(data: BriefingEmailData): Promise<void> {
    const siteUrl = this.configService.get<string>('CORS_ORIGIN', 'https://oral.tolair.org');
    const briefingUrl = `${siteUrl}/provider/${data.npi}?token=${data.sessionToken}`;
    const firstName = data.firstName || 'there';
    const ogsDisplay = data.ogsScore != null ? `${data.ogsScore}/100` : 'pending';
    const ogsColor = data.ogsScore != null
      ? data.ogsScore >= 75 ? '#00B4A0' : data.ogsScore >= 50 ? '#F59E0B' : '#EF4444'
      : '#94A3B8';

    // Format top signal for teaser
    let signalTeaser = '';
    if (data.topSignalDomain) {
      const domainLabel = this.formatDomain(data.topSignalDomain);
      const severityLabel = data.topSignalSeverity || 'INFO';
      const severityColor = severityLabel === 'CRITICAL' ? '#EF4444'
        : severityLabel === 'ELEVATED' ? '#F97316'
        : severityLabel === 'WARN' ? '#F59E0B'
        : '#3B82F6';
      signalTeaser = `
        <div style="background: #152840; padding: 16px; border-radius: 6px; margin: 16px 0; border-left: 4px solid ${severityColor};">
          <p style="color: #94A3B8; margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Top Governance Finding</p>
          <p style="color: #F8FAFC; margin: 0; font-size: 16px; font-weight: 600;">${domainLabel}</p>
          <p style="color: ${severityColor}; margin: 4px 0 0 0; font-size: 13px;">Severity: ${severityLabel}</p>
        </div>`;
    }

    const subject = `Your Reveal Oral Health briefing for ${data.practiceName}`;

    const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background: #0D1B2A;">
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F2132; color: #F8FAFC; padding: 40px 32px; border-radius: 8px;">

    <div style="text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #1E3A5F;">
      <h1 style="color: #F8FAFC; font-size: 22px; margin: 0; font-weight: 700;">Reveal Oral Health</h1>
      <p style="color: #94A3B8; font-size: 13px; margin: 6px 0 0 0;">Governance Intelligence by Tolair</p>
    </div>

    <p style="color: #F8FAFC; font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>

    <p style="color: #94A3B8; font-size: 15px; line-height: 1.6;">Your governance intelligence briefing for <strong style="color: #F8FAFC;">${data.practiceName}</strong> (NPI: ${data.npi}) is ready.</p>

    <div style="background: #0D1B2A; padding: 28px; border-radius: 8px; margin: 24px 0; text-align: center; border: 1px solid #1E3A5F;">
      <p style="color: #94A3B8; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Governance Health Score</p>
      <p style="color: ${ogsColor}; font-size: 48px; font-weight: 700; margin: 0; letter-spacing: -1px;">${ogsDisplay}</p>
    </div>

    ${signalTeaser}

    <div style="text-align: center; margin: 28px 0;">
      <a href="${briefingUrl}" style="display: inline-block; background: #00B4A0; color: #0D1B2A; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;">View Full Briefing</a>
    </div>

    <p style="color: #94A3B8; font-size: 13px; line-height: 1.5;">Your briefing includes benchmark comparisons, governance signals across 8 domains, and AI-powered insights from Compass. This link expires in 24 hours.</p>

    <hr style="border: none; border-top: 1px solid #1E3A5F; margin: 28px 0;" />

    <p style="color: #94A3B8; font-size: 13px; line-height: 1.5;">Questions? Reply to this email — Chad Brausen reads every one.</p>

    <div style="text-align: center; margin-top: 24px;">
      <p style="color: #4B5563; font-size: 11px; margin: 0;">
        Reveal Oral Health is a free intelligence tool by <a href="https://tolair.org" style="color: #00B4A0; text-decoration: none;">Tolair, Inc.</a><br/>
        <a href="mailto:chadbrausen@tolair.org" style="color: #00B4A0; text-decoration: none;">chadbrausen@tolair.org</a> &middot; <a href="https://tolair.org" style="color: #00B4A0; text-decoration: none;">tolair.org</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `Hi ${firstName},

Your governance intelligence briefing for ${data.practiceName} (NPI: ${data.npi}) is ready.

Governance Health Score: ${ogsDisplay}
${data.topSignalDomain ? `Top Finding: ${this.formatDomain(data.topSignalDomain)} (${data.topSignalSeverity})` : ''}

View your full briefing: ${briefingUrl}

Your briefing includes benchmark comparisons, governance signals, and AI-powered insights. This link expires in 24 hours.

Questions? Reply to this email — Chad Brausen reads every one.
chadbrausen@tolair.org

Reveal Oral Health by Tolair, Inc. — tolair.org`;

    const from = this.configService.get<string>('SMTP_FROM', 'noreply@tolair.org');
    const replyTo = 'chadbrausen@tolair.org';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({ from, replyTo, to: data.to, subject, html, text });
        this.logger.log(`Briefing email sent to ${hashEmail(data.to)}`);
      } catch (error: any) {
        this.logger.error(`Email send failed: ${error.message}`);
        throw error;
      }
    } else {
      this.logger.log(`[EMAIL PREVIEW] To: ${hashEmail(data.to)} | Subject: ${subject}`);
      this.logger.log(`[EMAIL PREVIEW] Briefing URL: ${briefingUrl}`);
    }
  }

  private formatDomain(domain: string): string {
    const map: Record<string, string> = {
      DSO_CONTRACT: 'DSO Contract Governance',
      SUPPLY_SPEND: 'Supply Spend',
      REVENUE_CYCLE: 'Revenue Cycle',
      WORKFORCE: 'Workforce & Productivity',
      MARKET_POSITION: 'Market Position',
      COMPLIANCE_LICENSING: 'Compliance & Licensing',
      HRSA_DESIGNATION: 'HRSA Designation',
      BENCHMARK_POSITION: 'Benchmark Position',
    };
    return map[domain] || domain;
  }
}
