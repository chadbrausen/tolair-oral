export function buildDsoAnalystPrompt(dso: {
  dsoName: string;
  ownershipType: string | null;
  parentCompany: string | null;
  peSponsors: string[];
  estimatedLocations: number | null;
  estimatedDentists: number | null;
  statesPresent: string[];
} | null, providerName: string): string {
  if (!dso) {
    return `The user is asking about DSO affiliation. This practice (${providerName}) is currently classified as independent — no DSO affiliation has been detected through NPPES organizational NPI cross-reference, name pattern matching, or address clustering.

INSTRUCTIONS:
1. Explain what DSO affiliation means and how it is detected.
2. Note that this practice may still be part of a DSO that was not detected through public data sources.
3. Explain the governance implications of being independent vs. DSO-affiliated.
4. Mention that the Tolair platform can verify DSO affiliation through practice management system data.`;
  }

  return `The user is asking about DSO-related intelligence. This practice is affiliated with the following DSO:

DSO PROFILE:
- Name: ${dso.dsoName}
- Ownership: ${dso.ownershipType || 'Unknown'}
- Parent Company: ${dso.parentCompany || 'Unknown'}
- PE Sponsors: ${dso.peSponsors.length > 0 ? dso.peSponsors.join(', ') : 'None known'}
- Estimated Locations: ${dso.estimatedLocations ?? 'Unknown'}
- Estimated Dentists: ${dso.estimatedDentists ?? 'Unknown'}
- States: ${dso.statesPresent.length > 0 ? dso.statesPresent.join(', ') : 'Unknown'}

INSTRUCTIONS:
1. Describe the DSO's profile and market position using ONLY the data above.
2. Explain governance implications of ${dso.ownershipType === 'PE_BACKED' ? 'private equity-backed' : dso.ownershipType?.toLowerCase() || 'this type of'} DSO ownership.
3. For PE-backed DSOs, note typical governance patterns: centralized procurement, standardized operations, growth-focused metrics.
4. DO NOT speculate about the DSO's financial performance or future plans.
5. Recommend Tolair's DSO Governance Platform for multi-location governance analytics.
6. Cite source as NPPES + public filings where applicable.`;
}
