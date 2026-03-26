import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { hashEmail } from '../common/log-sanitizer';

export interface HubspotContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  npi: string;
  practiceName: string;
  specialty: string;
  dsoAffiliation: string | null;
  city: string;
  state: string;
  ogsScore: number | null;
  sessionToken?: string;
  utmSource?: string;
}

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);
  private readonly apiKey: string;
  private readonly hubspotBaseUrl = 'https://api.hubapi.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.configService.get<string>('HUBSPOT_API_KEY', '');
  }

  async syncContact(data: HubspotContactData): Promise<string | null> {
    if (!this.apiKey) {
      this.logger.warn('HUBSPOT_API_KEY not configured — skipping CRM sync');
      return null;
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      // Search for existing contact by email
      const searchRes = await axios.post(
        `${this.hubspotBaseUrl}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: data.email,
            }],
          }],
        },
        { headers },
      );

      // Build properties with reveal_oral_ prefix for custom fields
      const properties: Record<string, string> = {
        // Standard HubSpot properties
        email: data.email,
        firstname: data.firstName || '',
        lastname: data.lastName || '',
        jobtitle: data.title || '',
        city: data.city,
        state: data.state,
        // Custom reveal_oral_ properties
        reveal_oral_npi: data.npi,
        reveal_oral_practice_name: data.practiceName,
        reveal_oral_specialty: data.specialty,
        reveal_oral_dso_affiliation: data.dsoAffiliation || '',
        reveal_oral_city: data.city,
        reveal_oral_state: data.state,
        reveal_oral_ogs_score: data.ogsScore?.toString() || '',
        reveal_oral_lead_date: new Date().toISOString().split('T')[0],
        reveal_oral_utm_source: data.utmSource || '',
      };

      if (data.sessionToken) {
        properties.reveal_oral_session_token = data.sessionToken;
      }

      let contactId: string;

      if (searchRes.data.total > 0) {
        contactId = searchRes.data.results[0].id;
        await axios.patch(
          `${this.hubspotBaseUrl}/crm/v3/objects/contacts/${contactId}`,
          { properties },
          { headers },
        );
        this.logger.log(`HubSpot contact updated: ${hashEmail(data.email)} (${contactId})`);
      } else {
        properties.lifecyclestage = 'lead';
        properties.hs_lead_status = 'NEW';
        const createRes = await axios.post(
          `${this.hubspotBaseUrl}/crm/v3/objects/contacts`,
          { properties },
          { headers },
        );
        contactId = createRes.data.id;
        this.logger.log(`HubSpot contact created: ${hashEmail(data.email)} (${contactId})`);
      }

      // Update the lead record with HubSpot contact ID
      await this.prisma.oralLead.updateMany({
        where: { email: data.email, npi: data.npi },
        data: {
          hubspotContactId: contactId,
          hubspotSyncedAt: new Date(),
        },
      });

      return contactId;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      this.logger.error(`HubSpot sync error for ${hashEmail(data.email)}: ${msg}`);
      // Don't throw — HubSpot sync failure should not block the lead flow
      return null;
    }
  }

  /**
   * Ensure all reveal_oral_ custom properties exist in HubSpot.
   * Run this once during setup or as a CLI command.
   */
  async ensureCustomProperties(): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('HUBSPOT_API_KEY not configured — skipping property setup');
      return;
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const customProps = [
      { name: 'reveal_oral_npi', label: 'Reveal Oral NPI', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'NPI number from NPPES' },
      { name: 'reveal_oral_practice_name', label: 'Reveal Oral Practice Name', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'Dental practice display name' },
      { name: 'reveal_oral_specialty', label: 'Reveal Oral Specialty', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'Dental specialty type' },
      { name: 'reveal_oral_dso_affiliation', label: 'Reveal Oral DSO Affiliation', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'DSO name if affiliated' },
      { name: 'reveal_oral_city', label: 'Reveal Oral City', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'Practice city' },
      { name: 'reveal_oral_state', label: 'Reveal Oral State', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'Practice state (2-letter)' },
      { name: 'reveal_oral_ogs_score', label: 'Reveal Oral OGS Score', type: 'number', fieldType: 'number', groupName: 'contactinformation', description: 'Oral Governance Score at time of lead' },
      { name: 'reveal_oral_session_token', label: 'Reveal Oral Session Token', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'Session token for briefing access' },
      { name: 'reveal_oral_lead_date', label: 'Reveal Oral Lead Date', type: 'date', fieldType: 'date', groupName: 'contactinformation', description: 'Date of email gate submission' },
      { name: 'reveal_oral_utm_source', label: 'Reveal Oral UTM Source', type: 'string', fieldType: 'text', groupName: 'contactinformation', description: 'UTM source parameter' },
    ];

    for (const prop of customProps) {
      try {
        await axios.post(
          `${this.hubspotBaseUrl}/crm/v3/properties/contacts`,
          prop,
          { headers },
        );
        this.logger.log(`HubSpot property created: ${prop.name}`);
      } catch (error: any) {
        if (error.response?.status === 409) {
          this.logger.log(`HubSpot property already exists: ${prop.name}`);
        } else {
          this.logger.error(`Failed to create HubSpot property ${prop.name}: ${error.response?.data?.message || error.message}`);
        }
      }
    }
  }
}
