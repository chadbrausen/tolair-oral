import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { parse } from 'csv-parse';
import * as fs from 'fs';
import * as path from 'path';

interface HpsaRecord {
  designated: boolean;
  score: number;
  type: 'GEOGRAPHIC' | 'POPULATION' | 'FACILITY';
}

const HRSA_CSV_URL =
  'https://data.hrsa.gov/api/download?filename=BCD_HPSA_FCT_DET_DH.csv';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'hrsa');
const CSV_FILENAME = 'BCD_HPSA_FCT_DET_DH.csv';

const HPSA_TYPE_MAP: Record<string, HpsaRecord['type']> = {
  'Geographic Area': 'GEOGRAPHIC',
  'Population Group': 'POPULATION',
  Facility: 'FACILITY',
};

const BATCH_SIZE = 500;

@Injectable()
export class HrsaService {
  private readonly logger = new Logger(HrsaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncHrsa(): Promise<{ enrichedCount: number; hpsaZipCount: number }> {
    this.logger.log('Starting HRSA HPSA dental enrichment sync');

    // 1. Download the CSV
    const csvPath = await this.downloadCsv();

    // 2. Parse into lookup maps
    const { zipMap, countyMap } = await this.parseCsv(csvPath);
    this.logger.log(
      `Parsed HPSA data: ${zipMap.size} ZIP entries, ${countyMap.size} county entries`,
    );

    // 3. Query and enrich providers in batches
    let enrichedCount = 0;
    let cursor: string | undefined;

    while (true) {
      const providers = await this.prisma.oralProvider.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          npi: true,
          zip: true,
          state: true,
        },
        orderBy: { id: 'asc' },
      });

      if (providers.length === 0) break;

      const updates: Promise<unknown>[] = [];

      for (const provider of providers) {
        const zip5 = provider.zip?.substring(0, 5);
        let match: HpsaRecord | undefined;

        // Try ZIP-level match first
        if (zip5 && zipMap.has(zip5)) {
          match = zipMap.get(zip5);
        }

        // Fall back to county-level match using state FIPS lookup
        if (!match) {
          // Try all county keys that start with a plausible state FIPS
          // We iterate county map entries filtered by state abbreviation
          for (const [key, record] of countyMap.entries()) {
            const countyState = key.split('|')[2];
            if (countyState === provider.state) {
              match = record;
              break;
            }
          }
        }

        if (match) {
          updates.push(
            this.prisma.oralProvider.update({
              where: { id: provider.id },
              data: {
                hrsaHpsaDesignated: true,
                hrsaHpsaScore: match.score,
                hrsaShortageType: match.type,
                lastEnrichedAt: new Date(),
              },
            }),
          );
          enrichedCount++;
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      cursor = providers[providers.length - 1].id;

      this.logger.debug(
        `Processed batch ending at cursor ${cursor}, enriched so far: ${enrichedCount}`,
      );
    }

    this.logger.log(
      `HRSA sync complete: ${enrichedCount} providers in HPSA areas, ${zipMap.size} HPSA ZIPs`,
    );

    return { enrichedCount, hpsaZipCount: zipMap.size };
  }

  private async downloadCsv(): Promise<string> {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      this.logger.log(`Created data directory: ${DATA_DIR}`);
    }

    const csvPath = path.join(DATA_DIR, CSV_FILENAME);

    this.logger.log('Downloading HRSA HPSA dental CSV...');
    const response = await axios.get(HRSA_CSV_URL, {
      responseType: 'stream',
      timeout: 120_000,
    });

    const writer = fs.createWriteStream(csvPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(csvPath);
    this.logger.log(
      `Downloaded HRSA CSV: ${(stats.size / 1024 / 1024).toFixed(1)} MB`,
    );

    return csvPath;
  }

  private async parseCsv(csvPath: string): Promise<{
    zipMap: Map<string, HpsaRecord>;
    countyMap: Map<string, HpsaRecord>;
  }> {
    const zipMap = new Map<string, HpsaRecord>();
    const countyMap = new Map<string, HpsaRecord>();

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(csvPath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }),
      );

      stream.on('data', (row: Record<string, string>) => {
        // Only process designated dental HPSA records
        if (row['HPSA_Status'] !== 'Designated') return;
        if (row['Designation_Type'] !== 'Dental Health') return;

        const score = parseInt(row['HPSA_Score'], 10);
        const rawType = row['HPSA_Type'];
        const type = HPSA_TYPE_MAP[rawType];

        if (!type || isNaN(score)) return;

        const record: HpsaRecord = {
          designated: true,
          score,
          type,
        };

        // ZIP-level mapping
        const postalCode = row['HPSA_Postal_Code']?.trim();
        if (postalCode) {
          // A single record can have multiple ZIPs separated by commas or semicolons
          const zips = postalCode.split(/[,;]\s*/);
          for (const rawZip of zips) {
            const zip5 = rawZip.trim().substring(0, 5);
            if (zip5 && /^\d{5}$/.test(zip5)) {
              // Keep the highest score for any given ZIP
              const existing = zipMap.get(zip5);
              if (!existing || existing.score < score) {
                zipMap.set(zip5, record);
              }
            }
          }
        }

        // County-level mapping: stateFIPS + countyFIPS
        const stateFips = row['Common_State_FIPS_Code']?.trim();
        const countyFips = row['Common_County_FIPS_Code']?.trim();
        const stateName = row['Common_State_Name']?.trim();

        if (stateFips && countyFips) {
          // Use state abbreviation from a separate lookup or embed state name
          // Key format: stateFIPS|countyFIPS|stateAbbrev (stateAbbrev added for fallback matching)
          const stateAbbrev = this.stateNameToAbbrev(stateName);
          const countyKey = `${stateFips}|${countyFips}|${stateAbbrev}`;
          const existing = countyMap.get(countyKey);
          if (!existing || existing.score < score) {
            countyMap.set(countyKey, record);
          }
        }
      });

      stream.on('end', () => resolve({ zipMap, countyMap }));
      stream.on('error', reject);
    });
  }

  private stateNameToAbbrev(stateName: string): string {
    const map: Record<string, string> = {
      Alabama: 'AL',
      Alaska: 'AK',
      Arizona: 'AZ',
      Arkansas: 'AR',
      California: 'CA',
      Colorado: 'CO',
      Connecticut: 'CT',
      Delaware: 'DE',
      'District of Columbia': 'DC',
      Florida: 'FL',
      Georgia: 'GA',
      Hawaii: 'HI',
      Idaho: 'ID',
      Illinois: 'IL',
      Indiana: 'IN',
      Iowa: 'IA',
      Kansas: 'KS',
      Kentucky: 'KY',
      Louisiana: 'LA',
      Maine: 'ME',
      Maryland: 'MD',
      Massachusetts: 'MA',
      Michigan: 'MI',
      Minnesota: 'MN',
      Mississippi: 'MS',
      Missouri: 'MO',
      Montana: 'MT',
      Nebraska: 'NE',
      Nevada: 'NV',
      'New Hampshire': 'NH',
      'New Jersey': 'NJ',
      'New Mexico': 'NM',
      'New York': 'NY',
      'North Carolina': 'NC',
      'North Dakota': 'ND',
      Ohio: 'OH',
      Oklahoma: 'OK',
      Oregon: 'OR',
      Pennsylvania: 'PA',
      'Rhode Island': 'RI',
      'South Carolina': 'SC',
      'South Dakota': 'SD',
      Tennessee: 'TN',
      Texas: 'TX',
      Utah: 'UT',
      Vermont: 'VT',
      Virginia: 'VA',
      Washington: 'WA',
      'West Virginia': 'WV',
      Wisconsin: 'WI',
      Wyoming: 'WY',
      'Puerto Rico': 'PR',
      'Virgin Islands': 'VI',
      Guam: 'GU',
      'American Samoa': 'AS',
      'Northern Mariana Islands': 'MP',
    };
    return map[stateName] ?? '';
  }
}
