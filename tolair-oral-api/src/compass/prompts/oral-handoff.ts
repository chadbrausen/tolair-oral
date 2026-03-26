export function buildHandoffPrompt(providerName: string, topSignalDomain: string | null): string {
  const domainSpecific = topSignalDomain
    ? `Based on the governance signals detected for ${providerName}, the ${formatDomain(topSignalDomain)} domain shows the most actionable findings.`
    : `${providerName}'s governance profile has been assessed using public data sources.`;

  return `The user is asking about next steps, deeper analysis, or connecting their practice data.

${domainSpecific}

INSTRUCTIONS:
1. Acknowledge that Reveal Oral Health provides governance intelligence from PUBLIC data sources only (NPPES, ADA Survey, HRSA, CMS).
2. Explain that the Tolair DSO Governance Platform connects directly to practice management systems (Dentrix, Eaglesoft, Open Dental, etc.) for:
   - Real-time production and collections benchmarking
   - Actual supply spend analysis against GPO contracts
   - CDT code-level revenue cycle optimization
   - Provider productivity dashboards
   - Multi-location DSO governance rollups
3. The platform transforms the estimated ranges shown in Reveal into exact, actionable numbers.
4. Provide contact information:
   - Email: chadbrausen@tolair.org
   - Subject line suggestion: "Tolair Platform Demo — {practice name}"
   - Website: tolair.org
5. Emphasize: "No commitment required — we'll show you what your practice looks like with real data connected."`;
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
