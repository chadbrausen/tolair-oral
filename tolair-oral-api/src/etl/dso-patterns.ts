export interface DsoPattern {
  canonicalName: string;
  aliases: string[];
  ownershipType: 'PE_BACKED' | 'PHYSICIAN_OWNED' | 'PUBLIC' | 'PRIVATE';
  parentCompany?: string;
  peSponsors?: string[];
  estimatedLocations?: number;
}

export const DSO_PATTERNS: DsoPattern[] = [
  {
    canonicalName: 'Heartland Dental',
    aliases: ['Heartland Dental', 'Heartland'],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Heartland Dental LLC',
    peSponsors: ['KKR'],
    estimatedLocations: 1700,
  },
  {
    canonicalName: 'Aspen Dental',
    aliases: ['Aspen Dental', 'Aspen Dental Management'],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Aspen Dental Management Inc.',
    peSponsors: ['Leonard Green & Partners', 'Ares Management'],
    estimatedLocations: 1000,
  },
  {
    canonicalName: 'Pacific Dental Services',
    aliases: ['Pacific Dental Services', 'Pacific Dental', 'PDS'],
    ownershipType: 'PRIVATE',
    parentCompany: 'Pacific Dental Services LLC',
    estimatedLocations: 900,
  },
  {
    canonicalName: 'Smile Brands',
    aliases: [
      'Smile Brands',
      'Bright Now! Dental',
      'Bright Now Dental',
      'Monarch Dental',
      'Castle Dental',
      'Dental Works',
      'DentalWorks',
    ],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Smile Brands Inc.',
    peSponsors: ['Gryphon Investors'],
    estimatedLocations: 700,
  },
  {
    canonicalName: 'Dental Care Alliance',
    aliases: ['Dental Care Alliance', 'DCA'],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Dental Care Alliance LLC',
    peSponsors: ['Harvest Partners'],
    estimatedLocations: 400,
  },
  {
    canonicalName: 'dentalcorp',
    aliases: ['dentalcorp', 'Dental Corp'],
    ownershipType: 'PUBLIC',
    parentCompany: 'dentalcorp Holdings Ltd.',
    estimatedLocations: 600,
  },
  {
    canonicalName: 'Western Dental',
    aliases: [
      'Western Dental',
      'Brident Dental',
      'Western Dental & Orthodontics',
    ],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Western Dental Services Inc.',
    peSponsors: ['New Mountain Capital'],
    estimatedLocations: 350,
  },
  {
    canonicalName: 'Great Expressions Dental',
    aliases: [
      'Great Expressions Dental',
      'Great Expressions Dental Centers',
    ],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Great Expressions Dental Centers',
    peSponsors: ['Roark Capital Group'],
    estimatedLocations: 300,
  },
  {
    canonicalName: 'Affordable Care',
    aliases: [
      'Affordable Care',
      'Affordable Dentures',
      'Affordable Dentures & Implants',
    ],
    ownershipType: 'PE_BACKED',
    parentCompany: 'Affordable Care Inc.',
    peSponsors: ['Ares Management'],
    estimatedLocations: 450,
  },
  {
    canonicalName: 'ClearChoice',
    aliases: [
      'ClearChoice',
      'Clear Choice Dental Implants',
      'ClearChoice Dental Implant Centers',
    ],
    ownershipType: 'PE_BACKED',
    parentCompany: 'ClearChoice Holdings',
    peSponsors: ['Ares Management'],
    estimatedLocations: 100,
  },
  {
    canonicalName: 'Guardian Dental Partners',
    aliases: ['Guardian Dental Partners'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Jacobs Holding'],
    estimatedLocations: 50,
  },
  {
    canonicalName: 'Dental365',
    aliases: ['Dental365', 'Dental 365'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Harvest Partners'],
    estimatedLocations: 100,
  },
  {
    canonicalName: 'Altus Dental',
    aliases: ['Altus Dental', 'Altus Healthcare'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Alpine Investors'],
    estimatedLocations: 60,
  },
  {
    canonicalName: 'MB2 Dental',
    aliases: ['MB2 Dental'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Charlesbank Capital Partners'],
    estimatedLocations: 600,
  },
  {
    canonicalName: 'InterDent',
    aliases: ['InterDent', 'Gentle Dental', 'SmileCare'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['KKR'],
    estimatedLocations: 170,
  },
  {
    canonicalName: 'North American Dental Group',
    aliases: ['North American Dental Group', 'NADG'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Jacobs Holding'],
    estimatedLocations: 250,
  },
  {
    canonicalName: 'Benevis',
    aliases: ['Benevis', 'Kool Smiles'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['FFL Partners'],
    estimatedLocations: 130,
  },
  {
    canonicalName: 'Mortenson Dental Partners',
    aliases: [
      'Mortenson Dental Partners',
      'Mortenson Dental',
      'Mortenson Family Dental',
    ],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Parthenon Capital Partners'],
    estimatedLocations: 150,
  },
  {
    canonicalName: 'Midwest Dental',
    aliases: ['Midwest Dental', 'Mountain Dental', 'Midwest Dental Holdings'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Peloton Equity'],
    estimatedLocations: 180,
  },
  {
    canonicalName: 'Sage Dental',
    aliases: ['Sage Dental', 'Sage Dental Management'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Harvest Partners'],
    estimatedLocations: 85,
  },
  {
    canonicalName: 'Tend',
    aliases: ['Tend', 'Tend Dental'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['GV (Google Ventures)'],
    estimatedLocations: 40,
  },
  {
    canonicalName: 'Risas Dental',
    aliases: ['Risas Dental', 'Risas Dental and Braces'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Prospect Hill Growth Partners'],
    estimatedLocations: 40,
  },
  {
    canonicalName: 'Familia Dental',
    aliases: ['Familia Dental'],
    ownershipType: 'PRIVATE',
    estimatedLocations: 60,
  },
  {
    canonicalName: '42 North Dental',
    aliases: ['42 North Dental'],
    ownershipType: 'PE_BACKED',
    peSponsors: ['Primus Capital'],
    estimatedLocations: 70,
  },
  {
    canonicalName: 'Premier Dental Partners',
    aliases: ['Premier Dental Partners'],
    ownershipType: 'PE_BACKED',
    estimatedLocations: 40,
  },
];

/**
 * Build a compiled lookup map for fast matching.
 * Keys are lowercased alias strings, values are the parent DsoPattern.
 */
export function buildDsoMatcherMap(): Map<string, DsoPattern> {
  const map = new Map<string, DsoPattern>();
  for (const pattern of DSO_PATTERNS) {
    for (const alias of pattern.aliases) {
      map.set(alias.toLowerCase(), pattern);
    }
  }
  return map;
}

/**
 * Match a practice name against DSO patterns.
 * Returns the DsoPattern and a confidence score if a match is found, null otherwise.
 */
export function matchDsoByName(
  practiceName: string,
  matcherMap: Map<string, DsoPattern>,
): { pattern: DsoPattern; confidence: number } | null {
  const normalized = practiceName.toLowerCase().trim();

  // Exact match first (highest confidence)
  for (const [alias, pattern] of matcherMap.entries()) {
    if (normalized === alias) {
      return { pattern, confidence: 0.95 };
    }
  }

  // Contains match (only for aliases with 5+ chars to avoid false positives)
  for (const [alias, pattern] of matcherMap.entries()) {
    if (alias.length >= 5 && normalized.includes(alias)) {
      return { pattern, confidence: 0.9 };
    }
  }

  return null;
}
