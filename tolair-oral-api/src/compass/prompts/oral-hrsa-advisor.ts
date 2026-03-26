export function buildHrsaAdvisorPrompt(provider: {
  displayName: string;
  hrsaHpsaDesignated: boolean;
  hrsaHpsaScore: number | null;
  hrsaShortageType: string | null;
  city: string;
  state: string;
}): string {
  if (!provider.hrsaHpsaDesignated) {
    return `The user is asking about HRSA shortage area status. ${provider.displayName} in ${provider.city}, ${provider.state} is NOT currently in a designated dental Health Professional Shortage Area (HPSA).

INSTRUCTIONS:
1. Explain what dental HPSAs are and how they are designated by HRSA.
2. Note that designation status is updated quarterly by HRSA.
3. Explain that being outside a HPSA generally indicates adequate dental provider coverage in the area.
4. Mention that nearby areas may still be designated — the Tolair platform can show a full geographic view.
5. Cite source: HRSA Bureau of Health Workforce, HPSA database.`;
  }

  const scoreInterpretation = (provider.hrsaHpsaScore ?? 0) >= 20
    ? 'Extremely high shortage severity — one of the most underserved areas in the country.'
    : (provider.hrsaHpsaScore ?? 0) >= 15
    ? 'Severe shortage — significant unmet dental care needs in this area.'
    : (provider.hrsaHpsaScore ?? 0) >= 10
    ? 'Moderate shortage — notable gaps in dental provider access.'
    : 'Mild shortage designation — some gaps in dental coverage exist.';

  return `The user is asking about HRSA designation status.

HRSA HPSA DETAILS FOR ${provider.displayName}:
- Designated: Yes
- HPSA Score: ${provider.hrsaHpsaScore ?? 'Not scored'}/25
- Shortage Type: ${provider.hrsaShortageType || 'Unknown'}
- Location: ${provider.city}, ${provider.state}
- Interpretation: ${scoreInterpretation}

INSTRUCTIONS:
1. Explain the HPSA designation and what the score means (0-25 scale, higher = more underserved).
2. Explain the shortage type: GEOGRAPHIC (entire area), POPULATION (specific population group), FACILITY (specific facility).
3. Describe governance implications: NHSC loan repayment eligibility, Medicaid enhanced rates, regulatory considerations.
4. Note any operational implications for practice governance (patient volume, payer mix, staffing challenges).
5. Recommend the Tolair platform for connecting HRSA data with practice operations data.
6. Cite source: HRSA Bureau of Health Workforce, HPSA Dental Designation database.`;
}
