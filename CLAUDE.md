# Reveal Oral Health — CLAUDE.md Quick Reference

## What This Is
Reveal Oral Health is a FREE public dental/DSO intelligence tool at oral.tolair.org.
It is COMPLETELY SEPARATE from all other Tolair services.

## Repos
- tolair-oral-api: NestJS backend, port 3004
- tolair-oral-app: Next.js 14 frontend, oral.tolair.org

## Absolute Rules
- NEVER call any endpoint on port 3001 (platform), 3002 (GIH), or 3003 (Gaming)
- NEVER use gih_, gaming_, or platform Prisma models — oral_ prefix ONLY
- AI engine: Anthropic Claude (claude-sonnet-4-5) — NOT OpenAI
- No HIPAA data — all data is public (NPPES, ADA, HRSA, CMS public)

## Entity Spine
NPI number from NPPES. 200,000+ dental/oral health providers.

## Database
tolair-db PostgreSQL (Central US). All tables: oral_ prefix.
Schema file: tolair-oral-api/prisma/schema.prisma

## Signal Domains (8)
DSO_CONTRACT | SUPPLY_SPEND | REVENUE_CYCLE | WORKFORCE |
MARKET_POSITION | COMPLIANCE_LICENSING | HRSA_DESIGNATION | BENCHMARK_POSITION

## OGS Score
Oral Governance Score — 0 to 100. Equivalent to GVS in Reveal Health.
Higher = more governance opportunity.

## Key Data Sources
1. NPPES (CMS): https://download.cms.gov/nppes/NPI_Files.html — monthly bulk file
2. ADA Survey of Dental Practice: ADA.org public tables
3. HRSA HPSA: https://data.hrsa.gov/tools/shortage-area/hpsa-find
4. CMS Medicaid State Drug Utilization Data (dental codes only)
5. State dental board license lookup APIs (where available)
6. FTC/DOJ DSO merger filings (public record)

## Contact
Chad Brausen — chadbrausen@tolair.org — tolair.org
