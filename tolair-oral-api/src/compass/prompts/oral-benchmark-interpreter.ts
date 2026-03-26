export function buildBenchmarkInterpreterPrompt(benchmarks: Array<{
  metricName: string;
  metricLabel: string;
  p25: number | null;
  median: number | null;
  p75: number | null;
  unit: string;
  dataSource: string;
  dataYear: string | null;
}>, cohortKey: string, practiceType: string): string {
  const benchmarkList = benchmarks.map(b =>
    `- ${b.metricLabel}: P25=${b.p25 ?? 'N/A'}, Median=${b.median ?? 'N/A'}, P75=${b.p75 ?? 'N/A'} (${b.unit}) [${b.dataSource}, ${b.dataYear || 'latest'}]`
  ).join('\n');

  return `The user is asking about benchmark comparisons. Interpret the benchmarks below for a ${practiceType} practice in the ${cohortKey} cohort.

BENCHMARK DATA:
${benchmarkList}

INSTRUCTIONS:
1. Explain what each benchmark measures and why it matters for practice governance.
2. Describe what it means to be at P25, Median, or P75 for each metric.
3. For dollar-denominated metrics, explain the real-world impact of being at each percentile.
4. DO NOT estimate the practice's position within these benchmarks — we don't have their actual data. Instead, explain what the benchmarks tell us about the competitive landscape.
5. Always note that connecting to the Tolair platform would allow benchmarking against their actual practice data.
6. Cite each benchmark with its source and year.`;
}
