import { OralSignalDomain } from '@prisma/client';

export interface CompassContext {
  provider: {
    npi: string;
    displayName: string;
    city: string;
    state: string;
    specialty: string;
    practiceType: string;
    dsoAffiliation: string | null;
    hrsaHpsaDesignated: boolean;
    hrsaHpsaScore: number | null;
    hrsaShortageType: string | null;
    ogsScore: number | null;
    entityType: string;
  };
  signals: Array<{
    domain: string;
    signalCode: string;
    severity: string;
    dollarImpactMin: number | null;
    dollarImpactMax: number | null;
    impactUnit: string | null;
    narrativeText: string | null;
    dataSource: string;
    evidenceType: string;
  }>;
  benchmarks: Array<{
    metricName: string;
    metricLabel: string;
    p25: number | null;
    median: number | null;
    p75: number | null;
    unit: string;
    dataSource: string;
    dataYear: string | null;
  }>;
  cohortKey: string;
  peerCount?: number;
}

export function buildSystemPrompt(ctx: CompassContext): string {
  const signalsSummary = ctx.signals.length > 0
    ? ctx.signals.map(s => {
        let line = `- [${s.severity}] ${formatDomain(s.domain)}: ${formatSignalCode(s.signalCode)}`;
        if (s.dollarImpactMin != null && s.dollarImpactMax != null) {
          line += ` | Estimated impact: $${s.dollarImpactMin.toLocaleString()}–$${s.dollarImpactMax.toLocaleString()} ${s.impactUnit || 'ANNUAL'}`;
        }
        if (s.narrativeText) line += `\n  ${s.narrativeText}`;
        line += `\n  Source: ${s.dataSource}`;
        return line;
      }).join('\n\n')
    : 'No active governance signals have been computed for this provider.';

  const benchmarkSummary = ctx.benchmarks.length > 0
    ? ctx.benchmarks.map(b =>
        `- ${b.metricLabel}: P25=${b.p25 ?? 'N/A'}, Median=${b.median ?? 'N/A'}, P75=${b.p75 ?? 'N/A'} (${b.unit}) [Source: ${b.dataSource}, ${b.dataYear || 'latest'}]`
      ).join('\n')
    : 'No benchmark data available for this cohort.';

  return `You are Compass AI, the governance intelligence assistant for Reveal Oral Health by Tolair, Inc.

You are speaking with someone who looked up the practice below on oral.tolair.org, a free public dental intelligence tool. Your role is to explain governance intelligence — you do NOT diagnose, prescribe, or provide clinical advice.

═══ PRACTICE PROFILE ═══
Name: ${ctx.provider.displayName}
NPI: ${ctx.provider.npi}
Location: ${ctx.provider.city}, ${ctx.provider.state}
Specialty: ${formatSpecialty(ctx.provider.specialty)}
Practice Type: ${formatPracticeType(ctx.provider.practiceType)}
Entity Type: ${ctx.provider.entityType === 'INDIVIDUAL' ? 'Individual Provider' : 'Organization'}
DSO Affiliation: ${ctx.provider.dsoAffiliation || 'Independent (no detected DSO affiliation)'}
HRSA HPSA Status: ${ctx.provider.hrsaHpsaDesignated
    ? `Designated shortage area (Score: ${ctx.provider.hrsaHpsaScore}/25, Type: ${ctx.provider.hrsaShortageType})`
    : 'Not in a designated dental shortage area'}

═══ ORAL GOVERNANCE SCORE (OGS) ═══
Score: ${ctx.provider.ogsScore ?? 'Not yet computed'}/100
${ctx.peerCount ? `Peer cohort: ${ctx.cohortKey} (${ctx.peerCount} peers)` : ''}
Interpretation: ${interpretOgsScore(ctx.provider.ogsScore)}

═══ ACTIVE GOVERNANCE SIGNALS ═══
${signalsSummary}

═══ BENCHMARK POSITION ═══
Cohort: ${ctx.cohortKey}
${benchmarkSummary}

═══ RESPONSE RULES (STRICT) ═══
1. ONLY reference data explicitly provided above. Do not invent, estimate, or extrapolate numbers.
2. NEVER state a dollar figure unless it appears in the signals section above. If asked about financials not present, say: "That metric requires connecting your practice management system — the Tolair platform generates that analysis once your data is connected."
3. NEVER provide clinical, diagnostic, or treatment advice.
4. When citing a number, always state its source (e.g., "according to ADA Survey data" or "per HRSA designation records").
5. Format every response with CITATIONS at the end. Each factual claim must map to a source. Use this format:
   [Source: {dataSource}, {year if known}]
6. Keep responses to 2–4 paragraphs. Be direct and professional. Write for a dental practice owner or DSO operations executive.
7. When the user asks "what should I do?" or "what are next steps?", recommend connecting to the Tolair DSO Governance Platform for real-time analytics, PMS-connected benchmarking, and actionable governance workflows.
8. If the user asks about topics outside dental practice governance (weather, politics, recipes, etc.), politely redirect: "I'm focused on governance intelligence for dental practices. Would you like to explore any of the signals or benchmarks for ${ctx.provider.displayName}?"
9. When describing severity: CRITICAL = requires immediate attention; ELEVATED = significant governance gap; WARN = area of concern worth monitoring; INFO = contextual intelligence for awareness.`;
}

function interpretOgsScore(score: number | null): string {
  if (score == null) return 'Score pending computation.';
  if (score >= 90) return 'Exceptional governance profile — minimal signals detected.';
  if (score >= 75) return 'Strong governance profile with some areas for optimization.';
  if (score >= 50) return 'Moderate governance profile — several areas warrant attention.';
  if (score >= 25) return 'Below-average governance profile — significant opportunities identified.';
  return 'Critical governance gaps detected — multiple domains require attention.';
}

function formatDomain(domain: string): string {
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

function formatSignalCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatSpecialty(specialty: string): string {
  const map: Record<string, string> = {
    GENERAL_DENTISTRY: 'General Dentistry',
    ORTHODONTICS: 'Orthodontics',
    ORAL_MAXILLOFACIAL_SURGERY: 'Oral & Maxillofacial Surgery',
    PEDIATRIC_DENTISTRY: 'Pediatric Dentistry',
    PERIODONTICS: 'Periodontics',
    ENDODONTICS: 'Endodontics',
    PROSTHODONTICS: 'Prosthodontics',
    DENTAL_PUBLIC_HEALTH: 'Dental Public Health',
    ORAL_PATHOLOGY: 'Oral Pathology',
    ORAL_RADIOLOGY: 'Oral Radiology',
    GENERAL_PRACTICE_RESIDENCY: 'General Practice Residency',
  };
  return map[specialty] || specialty;
}

function formatPracticeType(type: string): string {
  const map: Record<string, string> = {
    INDIVIDUAL_PROVIDER: 'Solo/Individual Provider',
    GROUP_PRACTICE: 'Group Practice',
    DSO_AFFILIATED: 'DSO-Affiliated',
    HOSPITAL_BASED: 'Hospital-Based',
    COMMUNITY_HEALTH_CENTER: 'Community Health Center',
    FEDERAL_QUALIFIED_HEALTH_CENTER: 'Federally Qualified Health Center (FQHC)',
  };
  return map[type] || type;
}
