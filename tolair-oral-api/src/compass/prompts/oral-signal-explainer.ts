export function buildSignalExplainerPrompt(signal: {
  domain: string;
  signalCode: string;
  severity: string;
  dollarImpactMin: number | null;
  dollarImpactMax: number | null;
  impactUnit: string | null;
  narrativeText: string | null;
  dataSource: string;
  evidencePayload: any;
}): string {
  return `The user is asking about a specific governance signal. Explain it clearly and concisely.

SIGNAL DETAILS:
- Domain: ${signal.domain}
- Code: ${signal.signalCode}
- Severity: ${signal.severity}
- Data Source: ${signal.dataSource}
${signal.dollarImpactMin != null ? `- Estimated Impact: $${signal.dollarImpactMin.toLocaleString()}–$${signal.dollarImpactMax?.toLocaleString()} ${signal.impactUnit || 'annually'}` : '- No dollar impact estimated for this signal'}
${signal.narrativeText ? `- Finding: ${signal.narrativeText}` : ''}
- Evidence: ${JSON.stringify(signal.evidencePayload)}

INSTRUCTIONS:
1. Explain what this signal means in plain English — assume the reader is a practice owner or DSO executive, NOT a data analyst.
2. Explain WHY this matters for their practice governance.
3. If dollar impact is present, reference the EXACT range shown above — do not adjust, round, or estimate differently.
4. Explain the data source and what it means for confidence in this finding.
5. Suggest 1-2 concrete next steps, always mentioning the Tolair platform for deeper analysis.
6. End with a citation: [Source: ${signal.dataSource}]`;
}
