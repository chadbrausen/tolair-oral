import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OralPracticeType, OralSpecialty } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';
import {
  buildDsoMatcherMap,
  matchDsoByName,
  DSO_PATTERNS,
  DsoPattern,
} from './dso-patterns';

// ─── Constants ───────────────────────────────────────────────────────────────

const NPPES_DOWNLOAD_PAGE_URL = 'https://download.cms.gov/nppes/NPI_Files.html';

const DATA_DIR = path.resolve('./data/nppes');

const DENTAL_TAXONOMY_CODES = new Set([
  '1223G0001X', // General Practice
  '1223X0400X', // Orthodontics
  '1223S0112X', // Oral & Maxillofacial Surgery
  '1223P0221X', // Pediatric Dentistry
  '1223P0300X', // Periodontics
  '1223E0200X', // Endodontics
  '1223P0700X', // Prosthodontics
  '1223D0001X', // Dental Public Health
  '1223X0008X', // Oral & Maxillofacial Pathology
  '1223X0001X', // Dental Anesthesiology
  '122300000X', // Dentist (general)
]);

const TAXONOMY_TO_SPECIALTY: Record<string, OralSpecialty> = {
  '1223G0001X': OralSpecialty.GENERAL_DENTISTRY,
  '1223X0400X': OralSpecialty.ORTHODONTICS,
  '1223S0112X': OralSpecialty.ORAL_MAXILLOFACIAL_SURGERY,
  '1223P0221X': OralSpecialty.PEDIATRIC_DENTISTRY,
  '1223P0300X': OralSpecialty.PERIODONTICS,
  '1223E0200X': OralSpecialty.ENDODONTICS,
  '1223P0700X': OralSpecialty.PROSTHODONTICS,
  '1223D0001X': OralSpecialty.DENTAL_PUBLIC_HEALTH,
  '1223X0008X': OralSpecialty.ORAL_PATHOLOGY,
  '1223X0001X': OralSpecialty.GENERAL_DENTISTRY, // Dental Anesthesiology -> General
  '122300000X': OralSpecialty.GENERAL_DENTISTRY,
};

const TAXONOMY_DESCRIPTIONS: Record<string, string> = {
  '1223G0001X': 'General Practice',
  '1223X0400X': 'Orthodontics and Dentofacial Orthopedics',
  '1223S0112X': 'Oral and Maxillofacial Surgery',
  '1223P0221X': 'Pediatric Dentistry',
  '1223P0300X': 'Periodontics',
  '1223E0200X': 'Endodontics',
  '1223P0700X': 'Prosthodontics (Dental)',
  '1223D0001X': 'Dental Public Health',
  '1223X0008X': 'Oral and Maxillofacial Pathology',
  '1223X0001X': 'Dental Anesthesiology',
  '122300000X': 'Dentist',
};

const UPSERT_BATCH_SIZE = 500;
const SEARCH_INDEX_BATCH_SIZE = 1000;
const LOG_INTERVAL = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface NppesRow {
  NPI: string;
  'Entity Type Code': string;
  'Provider Organization Name (Legal Business Name)': string;
  'Provider Last Name (Legal Name)': string;
  'Provider First Name': string;
  'Provider Business Practice Location Address First Line': string;
  'Provider Business Practice Location Address City Name': string;
  'Provider Business Practice Location Address State Name': string;
  'Provider Business Practice Location Address Postal Code': string;
  'Healthcare Provider Taxonomy Code_1': string;
  'Healthcare Provider Taxonomy Code_2': string;
  'Healthcare Provider Taxonomy Code_3': string;
  'Provider License Number_1': string;
  'Provider License Number State Code_1': string;
  'NPI Deactivation Date': string;
  'NPI Reactivation Date': string;
  'Provider Enumeration Date': string;
}

interface SyncSummary {
  totalRowsScanned: number;
  dentalProvidersFound: number;
  providersUpserted: number;
  dsoAffiliationsDetected: number;
  dsoEntitiesUpserted: number;
  searchIndexEntries: number;
  durationMs: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NppesService {
  private readonly logger = new Logger(NppesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full NPPES ETL pipeline:
   *  1. Download latest NPPES bulk file
   *  2. Stream-parse CSV, filter for dental taxonomy codes
   *  3. Upsert providers into oral_provider
   *  4. Detect DSO affiliations
   *  5. Upsert DSO entities
   *  6. Build search index
   */
  async syncNppes(): Promise<SyncSummary> {
    const startTime = Date.now();
    this.logger.log('Starting NPPES sync pipeline');

    // Ensure data directory exists
    await fs.promises.mkdir(DATA_DIR, { recursive: true });

    // Step 1: Download
    const csvPath = await this.downloadAndExtract();

    // Step 2 & 3: Parse and upsert providers
    const { totalRowsScanned, dentalProvidersFound, providersUpserted } =
      await this.parseAndUpsertProviders(csvPath);

    // Step 4: Detect DSO affiliations
    const dsoAffiliationsDetected = await this.detectDsoAffiliations();

    // Step 5: Upsert DSO entities
    const dsoEntitiesUpserted = await this.upsertDsoEntities();

    // Step 6: Build search index
    const searchIndexEntries = await this.buildSearchIndex();

    const durationMs = Date.now() - startTime;

    const summary: SyncSummary = {
      totalRowsScanned,
      dentalProvidersFound,
      providersUpserted,
      dsoAffiliationsDetected,
      dsoEntitiesUpserted,
      searchIndexEntries,
      durationMs,
    };

    this.logger.log(
      `NPPES sync complete in ${(durationMs / 1000).toFixed(1)}s: ${JSON.stringify(summary)}`,
    );

    return summary;
  }

  // ─── Download & Extract ──────────────────────────────────────────────────

  /**
   * Fetch the NPPES download page, find the latest full monthly file URL,
   * download the ZIP, and extract the CSV.
   */
  async findLatestNppesUrl(): Promise<string> {
    this.logger.log('Fetching NPPES download page to find latest file URL');

    try {
      const { data: html } = await axios.get<string>(NPPES_DOWNLOAD_PAGE_URL, {
        timeout: 30_000,
      });

      // Look for the "Full Replacement Monthly NPI File" download link
      // Pattern: NPPES_Data_Dissemination_<Month>_<Year>.zip
      const regex =
        /href="([^"]*NPPES_Data_Dissemination_[A-Za-z]+_\d{4}\.zip)"/gi;
      const matches: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = regex.exec(html)) !== null) {
        matches.push(match[1]);
      }

      if (matches.length === 0) {
        throw new Error(
          'Could not find any NPPES_Data_Dissemination ZIP links on the download page',
        );
      }

      // Take the last match (most recent on the page)
      let url = matches[matches.length - 1];

      // If relative URL, make absolute
      if (!url.startsWith('http')) {
        url = `https://download.cms.gov/nppes/${url}`;
      }

      this.logger.log(`Found latest NPPES file URL: ${url}`);
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to find latest NPPES URL: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Download the NPPES ZIP file and extract the main CSV.
   * Returns the path to the extracted CSV file.
   */
  async downloadAndExtract(): Promise<string> {
    const url = await this.findLatestNppesUrl();
    const zipFileName = path.basename(url);
    const zipPath = path.join(DATA_DIR, zipFileName);

    // Download if not already cached
    if (!fs.existsSync(zipPath)) {
      this.logger.log(`Downloading NPPES file: ${url}`);

      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 600_000, // 10 minutes for this large file
      });

      const writer = createWriteStream(zipPath);
      await pipeline(response.data, writer);

      this.logger.log(`Downloaded NPPES file to ${zipPath}`);
    } else {
      this.logger.log(`Using cached NPPES file: ${zipPath}`);
    }

    // Extract CSV from ZIP
    const csvPath = await this.extractCsvFromZip(zipPath);
    return csvPath;
  }

  /**
   * Extract the npidata_pfile_*.csv from the ZIP archive.
   */
  private async extractCsvFromZip(zipPath: string): Promise<string> {
    this.logger.log(`Extracting CSV from ZIP: ${zipPath}`);

    const directory = await unzipper.Open.file(zipPath);
    const csvEntry = directory.files.find((f) =>
      /^npidata_pfile_.*\.csv$/i.test(f.path),
    );

    if (!csvEntry) {
      throw new Error(
        `No npidata_pfile_*.csv found in ZIP: ${zipPath}. Files: ${directory.files.map((f) => f.path).join(', ')}`,
      );
    }

    const csvPath = path.join(DATA_DIR, csvEntry.path);

    // Skip extraction if already exists with same name
    if (!fs.existsSync(csvPath)) {
      const writer = createWriteStream(csvPath);
      await pipeline(csvEntry.stream(), writer);
      this.logger.log(`Extracted CSV to: ${csvPath}`);
    } else {
      this.logger.log(`Using cached extracted CSV: ${csvPath}`);
    }

    return csvPath;
  }

  // ─── CSV Parse & Provider Upsert ─────────────────────────────────────────

  /**
   * Stream-parse the NPPES CSV, filter for dental taxonomy codes,
   * and upsert matching rows into oral_provider in batches.
   */
  private async parseAndUpsertProviders(csvPath: string): Promise<{
    totalRowsScanned: number;
    dentalProvidersFound: number;
    providersUpserted: number;
  }> {
    this.logger.log(`Parsing NPPES CSV: ${csvPath}`);

    let totalRowsScanned = 0;
    let dentalProvidersFound = 0;
    let providersUpserted = 0;

    const batch: Parameters<typeof this.upsertProviderBatch>[0] = [];

    return new Promise((resolve, reject) => {
      const parser = createReadStream(csvPath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
        }),
      );

      parser.on('data', async (row: NppesRow) => {
        totalRowsScanned++;

        if (totalRowsScanned % LOG_INTERVAL === 0) {
          this.logger.log(
            `Scanned ${totalRowsScanned.toLocaleString()} rows, found ${dentalProvidersFound.toLocaleString()} dental providers`,
          );
        }

        // Check taxonomy codes 1-3 for dental match
        const dentalTaxonomy = this.findDentalTaxonomy(row);
        if (!dentalTaxonomy) return;

        // Skip deactivated providers without reactivation
        if (row['NPI Deactivation Date'] && !row['NPI Reactivation Date']) {
          return;
        }

        dentalProvidersFound++;

        const providerData = this.mapRowToProvider(row, dentalTaxonomy);
        if (providerData) {
          batch.push(providerData);
        }

        // Flush batch when full
        if (batch.length >= UPSERT_BATCH_SIZE) {
          parser.pause();
          try {
            const count = await this.upsertProviderBatch([...batch]);
            providersUpserted += count;
            batch.length = 0;
          } catch (err) {
            this.logger.error(`Batch upsert error: ${err.message}`, err.stack);
          }
          parser.resume();
        }
      });

      parser.on('end', async () => {
        try {
          // Flush remaining batch
          if (batch.length > 0) {
            const count = await this.upsertProviderBatch([...batch]);
            providersUpserted += count;
          }
          this.logger.log(
            `CSV parse complete: ${totalRowsScanned.toLocaleString()} rows scanned, ${dentalProvidersFound.toLocaleString()} dental, ${providersUpserted.toLocaleString()} upserted`,
          );
          resolve({ totalRowsScanned, dentalProvidersFound, providersUpserted });
        } catch (err) {
          reject(err);
        }
      });

      parser.on('error', (err) => {
        this.logger.error(`CSV parse error: ${err.message}`, err.stack);
        reject(err);
      });
    });
  }

  /**
   * Check taxonomy code columns 1-3 and return the first dental match.
   */
  private findDentalTaxonomy(row: NppesRow): string | null {
    const codes = [
      row['Healthcare Provider Taxonomy Code_1'],
      row['Healthcare Provider Taxonomy Code_2'],
      row['Healthcare Provider Taxonomy Code_3'],
    ];

    for (const code of codes) {
      if (code && DENTAL_TAXONOMY_CODES.has(code.trim())) {
        return code.trim();
      }
    }

    return null;
  }

  /**
   * Map a raw NPPES CSV row to the provider data shape for upsert.
   */
  private mapRowToProvider(
    row: NppesRow,
    taxonomyCode: string,
  ): {
    npi: string;
    entityType: string;
    practiceType: OralPracticeType;
    displayName: string;
    rawName: string;
    addressLine1: string | null;
    city: string;
    state: string;
    zip: string;
    zipCluster: string;
    taxonomyCode: string;
    taxonomyDesc: string;
    specialty: OralSpecialty;
    licenseState: string | null;
    licenseNumber: string | null;
    enumerationDate: Date | null;
    deactivationDate: Date | null;
    isActive: boolean;
    nppesSyncedAt: Date;
  } | null {
    const npi = row['NPI']?.trim();
    if (!npi) return null;

    const entityType = row['Entity Type Code']?.trim();
    const isOrg = entityType === '2';

    const orgName =
      row['Provider Organization Name (Legal Business Name)']?.trim() || '';
    const lastName = row['Provider Last Name (Legal Name)']?.trim() || '';
    const firstName = row['Provider First Name']?.trim() || '';

    const displayName = isOrg
      ? orgName
      : `${firstName} ${lastName}`.trim();
    const rawName = isOrg ? orgName : `${lastName}, ${firstName}`.trim();

    if (!displayName) return null;

    const city =
      row[
        'Provider Business Practice Location Address City Name'
      ]?.trim() || '';
    const state =
      row[
        'Provider Business Practice Location Address State Name'
      ]?.trim() || '';
    const zip =
      row[
        'Provider Business Practice Location Address Postal Code'
      ]?.trim() || '';
    const addressLine1 =
      row[
        'Provider Business Practice Location Address First Line'
      ]?.trim() || null;

    if (!city || !state || !zip) return null;

    const zipCluster = zip.substring(0, 3);

    const practiceType: OralPracticeType = isOrg
      ? OralPracticeType.GROUP_PRACTICE
      : OralPracticeType.INDIVIDUAL_PROVIDER;

    const specialty =
      TAXONOMY_TO_SPECIALTY[taxonomyCode] || OralSpecialty.GENERAL_DENTISTRY;
    const taxonomyDesc =
      TAXONOMY_DESCRIPTIONS[taxonomyCode] || 'Dentist';

    const licenseState =
      row['Provider License Number State Code_1']?.trim() || null;
    const licenseNumber =
      row['Provider License Number_1']?.trim() || null;

    const enumerationDate = this.parseDate(row['Provider Enumeration Date']);
    const deactivationDate = this.parseDate(row['NPI Deactivation Date']);

    const isActive = !deactivationDate || !!row['NPI Reactivation Date'];

    return {
      npi,
      entityType: isOrg ? 'ORGANIZATION' : 'INDIVIDUAL',
      practiceType,
      displayName,
      rawName,
      addressLine1,
      city,
      state,
      zip,
      zipCluster,
      taxonomyCode,
      taxonomyDesc,
      specialty,
      licenseState,
      licenseNumber,
      enumerationDate,
      deactivationDate,
      isActive,
      nppesSyncedAt: new Date(),
    };
  }

  /**
   * Upsert a batch of providers using a Prisma transaction.
   */
  private async upsertProviderBatch(
    batch: NonNullable<ReturnType<typeof this.mapRowToProvider>>[],
  ): Promise<number> {
    let upserted = 0;

    await this.prisma.$transaction(
      async (tx) => {
        for (const data of batch) {
          await tx.oralProvider.upsert({
            where: { npi: data.npi },
            create: {
              ...data,
              aliases: [data.rawName],
            },
            update: {
              entityType: data.entityType,
              practiceType: data.practiceType,
              displayName: data.displayName,
              rawName: data.rawName,
              addressLine1: data.addressLine1,
              city: data.city,
              state: data.state,
              zip: data.zip,
              zipCluster: data.zipCluster,
              taxonomyCode: data.taxonomyCode,
              taxonomyDesc: data.taxonomyDesc,
              specialty: data.specialty,
              licenseState: data.licenseState,
              licenseNumber: data.licenseNumber,
              enumerationDate: data.enumerationDate,
              deactivationDate: data.deactivationDate,
              isActive: data.isActive,
              nppesSyncedAt: data.nppesSyncedAt,
            },
          });
          upserted++;
        }
      },
      { timeout: 60_000 },
    );

    return upserted;
  }

  // ─── DSO Detection ───────────────────────────────────────────────────────

  /**
   * Detect DSO affiliations using three strategies:
   *  1. Name matching against known DSO patterns
   *  2. Organizational NPI cross-references (Entity Type 2)
   *  3. Address clustering (3+ distinct NPIs at same address)
   */
  async detectDsoAffiliations(): Promise<number> {
    this.logger.log('Starting DSO affiliation detection');

    const matcherMap = buildDsoMatcherMap();
    let affiliationsDetected = 0;

    // Strategy 1: Name-based matching
    const nameMatches = await this.detectDsoByName(matcherMap);
    affiliationsDetected += nameMatches;

    // Strategy 2: Organizational NPI cross-references
    const orgMatches = await this.detectDsoByOrgNpi();
    affiliationsDetected += orgMatches;

    // Strategy 3: Address clustering
    const addressMatches = await this.detectDsoByAddressClustering();
    affiliationsDetected += addressMatches;

    this.logger.log(
      `DSO detection complete: ${affiliationsDetected} affiliations (name: ${nameMatches}, org-npi: ${orgMatches}, address: ${addressMatches})`,
    );

    return affiliationsDetected;
  }

  /**
   * Strategy 1: Match provider names against known DSO patterns.
   */
  private async detectDsoByName(
    matcherMap: Map<string, DsoPattern>,
  ): Promise<number> {
    this.logger.log('DSO detection: name-based matching');

    // Process in batches to avoid loading all providers into memory at once
    const batchSize = 5000;
    let cursor: string | undefined;
    let detected = 0;

    while (true) {
      const providers = await this.prisma.oralProvider.findMany({
        select: {
          id: true,
          npi: true,
          displayName: true,
          rawName: true,
          dsoAffiliation: true,
        },
        take: batchSize,
        ...(cursor
          ? { skip: 1, cursor: { id: cursor } }
          : {}),
        orderBy: { id: 'asc' },
      });

      if (providers.length === 0) break;

      const updates: { id: string; dso: string; confidence: number }[] = [];

      for (const provider of providers) {
        // Skip if already has a high-confidence DSO affiliation
        if (provider.dsoAffiliation) continue;

        // Check displayName and rawName
        const result =
          matchDsoByName(provider.displayName, matcherMap) ??
          matchDsoByName(provider.rawName, matcherMap);

        if (result) {
          updates.push({
            id: provider.id,
            dso: result.pattern.canonicalName,
            confidence: result.confidence,
          });
        }
      }

      // Apply updates in a transaction
      if (updates.length > 0) {
        await this.prisma.$transaction(
          updates.map((u) =>
            this.prisma.oralProvider.update({
              where: { id: u.id },
              data: {
                dsoAffiliation: u.dso,
                dsoConfidence: u.confidence,
                affiliationSource: 'NAME_MATCH',
                practiceType: OralPracticeType.DSO_AFFILIATED,
              },
            }),
          ),
        );
        detected += updates.length;
      }

      cursor = providers[providers.length - 1].id;

      if (providers.length < batchSize) break;
    }

    this.logger.log(`DSO name matching: ${detected} affiliations detected`);
    return detected;
  }

  /**
   * Strategy 2: Cross-reference organizational NPIs (Entity Type 2).
   * If an org NPI matches a DSO pattern, affiliate all individual providers
   * that share the same address.
   */
  private async detectDsoByOrgNpi(): Promise<number> {
    this.logger.log('DSO detection: organizational NPI cross-reference');

    const matcherMap = buildDsoMatcherMap();
    let detected = 0;

    // Find organization-type providers that match DSO patterns
    const orgs = await this.prisma.oralProvider.findMany({
      where: {
        entityType: 'ORGANIZATION',
        dsoAffiliation: { not: null },
      },
      select: {
        npi: true,
        dsoAffiliation: true,
        dsoConfidence: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
      },
    });

    for (const org of orgs) {
      if (!org.addressLine1 || !org.dsoAffiliation) continue;

      // Find individual providers at the same address without DSO affiliation
      const result = await this.prisma.oralProvider.updateMany({
        where: {
          entityType: 'INDIVIDUAL',
          addressLine1: org.addressLine1,
          city: org.city,
          state: org.state,
          zip: org.zip,
          dsoAffiliation: null,
        },
        data: {
          dsoAffiliation: org.dsoAffiliation,
          dsoNpi: org.npi,
          dsoConfidence: Math.min((org.dsoConfidence ?? 0.9) - 0.05, 0.85),
          affiliationSource: 'ORG_NPI_XREF',
          practiceType: OralPracticeType.DSO_AFFILIATED,
        },
      });

      detected += result.count;
    }

    this.logger.log(
      `DSO org-NPI cross-reference: ${detected} affiliations detected`,
    );
    return detected;
  }

  /**
   * Strategy 3: Address clustering.
   * Group providers by exact addressLine1; if 3+ distinct NPIs share
   * the same address, flag them as potential DSO-affiliated.
   */
  private async detectDsoByAddressClustering(): Promise<number> {
    this.logger.log('DSO detection: address clustering');

    let detected = 0;

    // Find addresses with 3+ providers that don't already have DSO affiliation
    const clusters = await this.prisma.oralProvider.groupBy({
      by: ['addressLine1', 'city', 'state'],
      where: {
        addressLine1: { not: null },
        dsoAffiliation: null,
      },
      _count: { npi: true },
      having: {
        npi: { _count: { gte: 3 } },
      },
    });

    for (const cluster of clusters) {
      if (!cluster.addressLine1) continue;

      const result = await this.prisma.oralProvider.updateMany({
        where: {
          addressLine1: cluster.addressLine1,
          city: cluster.city,
          state: cluster.state,
          dsoAffiliation: null,
        },
        data: {
          dsoAffiliation: 'UNKNOWN_CLUSTER',
          dsoConfidence: 0.7,
          affiliationSource: 'ADDRESS_CLUSTER',
        },
      });

      detected += result.count;
    }

    this.logger.log(
      `DSO address clustering: ${detected} affiliations detected`,
    );
    return detected;
  }

  // ─── DSO Entity Upsert ───────────────────────────────────────────────────

  /**
   * For each known DSO pattern, create or update the oral_dso record.
   * Counts affiliated providers and collects states.
   */
  async upsertDsoEntities(): Promise<number> {
    this.logger.log('Upserting DSO entities');
    let upserted = 0;

    for (const pattern of DSO_PATTERNS) {
      try {
        // Count affiliated providers
        const affiliatedCount = await this.prisma.oralProvider.count({
          where: { dsoAffiliation: pattern.canonicalName },
        });

        // Collect unique states from affiliated providers
        const stateGroups = await this.prisma.oralProvider.groupBy({
          by: ['state'],
          where: { dsoAffiliation: pattern.canonicalName },
        });
        const statesPresent = stateGroups.map((g) => g.state).sort();

        await this.prisma.oralDso.upsert({
          where: { dsoName: pattern.canonicalName },
          create: {
            dsoName: pattern.canonicalName,
            aliases: pattern.aliases,
            ownershipType: pattern.ownershipType,
            parentCompany: pattern.parentCompany ?? null,
            peSponsors: pattern.peSponsors ?? [],
            estimatedLocations: pattern.estimatedLocations ?? null,
            estimatedDentists: affiliatedCount,
            statesPresent,
          },
          update: {
            aliases: pattern.aliases,
            ownershipType: pattern.ownershipType,
            parentCompany: pattern.parentCompany ?? null,
            peSponsors: pattern.peSponsors ?? [],
            estimatedLocations: pattern.estimatedLocations ?? null,
            estimatedDentists: affiliatedCount,
            statesPresent,
          },
        });

        upserted++;
      } catch (err) {
        this.logger.error(
          `Failed to upsert DSO entity "${pattern.canonicalName}": ${err.message}`,
          err.stack,
        );
      }
    }

    this.logger.log(`Upserted ${upserted} DSO entities`);
    return upserted;
  }

  // ─── Search Index ─────────────────────────────────────────────────────────

  /**
   * Build the search index by upserting all providers into oral_search_index.
   * The searchVector is a concatenation of displayName + city + state + dsoAffiliation.
   */
  async buildSearchIndex(): Promise<number> {
    this.logger.log('Building search index');

    let indexed = 0;
    let cursor: string | undefined;

    while (true) {
      const providers = await this.prisma.oralProvider.findMany({
        select: {
          id: true,
          npi: true,
          displayName: true,
          city: true,
          state: true,
          specialty: true,
          dsoAffiliation: true,
          ogsScore: true,
        },
        take: SEARCH_INDEX_BATCH_SIZE,
        ...(cursor
          ? { skip: 1, cursor: { id: cursor } }
          : {}),
        orderBy: { id: 'asc' },
      });

      if (providers.length === 0) break;

      const upserts = providers.map((p) => {
        const searchVector = [
          p.displayName,
          p.city,
          p.state,
          p.dsoAffiliation,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return this.prisma.oralSearchIndex.upsert({
          where: { npi: p.npi },
          create: {
            npi: p.npi,
            displayName: p.displayName,
            city: p.city,
            state: p.state,
            specialty: p.specialty,
            dsoName: p.dsoAffiliation,
            ogsScore: p.ogsScore,
            searchVector,
          },
          update: {
            displayName: p.displayName,
            city: p.city,
            state: p.state,
            specialty: p.specialty,
            dsoName: p.dsoAffiliation,
            ogsScore: p.ogsScore,
            searchVector,
          },
        });
      });

      await this.prisma.$transaction(upserts);
      indexed += providers.length;

      if (indexed % LOG_INTERVAL === 0) {
        this.logger.log(`Search index: ${indexed.toLocaleString()} entries`);
      }

      cursor = providers[providers.length - 1].id;

      if (providers.length < SEARCH_INDEX_BATCH_SIZE) break;
    }

    this.logger.log(`Search index built: ${indexed.toLocaleString()} entries`);
    return indexed;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Parse a date string from NPPES (MM/DD/YYYY format).
   */
  private parseDate(dateStr: string | undefined | null): Date | null {
    if (!dateStr?.trim()) return null;

    const trimmed = dateStr.trim();

    // Try MM/DD/YYYY
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      const date = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
      );
      if (!isNaN(date.getTime())) return date;
    }

    // Fallback: try native parsing
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }
}
