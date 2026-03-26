# Reveal Oral Health — Post-Deploy Checklist

## Pre-Deploy
- [ ] All secrets set in Azure Key Vault (tolair-vault)
  - DATABASE_URL_ORAL
  - ANTHROPIC_API_KEY_ORAL
  - SMTP_PASS_ORAL
  - ORAL_JWT_SECRET
  - ORAL_SESSION_SECRET
- [ ] DNS CNAME added: oral.tolair.org → tolair-oral-app.azurewebsites.net
- [ ] SSL certificate provisioned for oral.tolair.org
- [ ] ACR credentials stored as GitHub secrets: ACR_USERNAME, ACR_PASSWORD
- [ ] AZURE_CREDENTIALS stored as GitHub secret

## Deploy
- [ ] Push to main branch triggers GitHub Actions
- [ ] Docker builds succeed for both repos
- [ ] Images pushed to tolairregistry.azurecr.io
- [ ] App Services updated and healthy

## Post-Deploy Verification
- [ ] oral.tolair.org loads landing page
- [ ] Search "Heartland" returns results
- [ ] Provider briefing shows OGS score
- [ ] Email gate creates session token
- [ ] HubSpot contact created with reveal_oral_ properties
- [ ] Compass AI responds within 4 seconds
- [ ] No 500 errors in Azure App Service logs

## Isolation Verification
- [ ] curl https://reveal.tolair.org → GIH response (UNCHANGED)
- [ ] curl https://gaming.tolair.org → Gaming response (UNCHANGED)
- [ ] curl https://app.tolair.org → Platform login (UNCHANGED)
- [ ] curl https://oral.tolair.org → Reveal Oral Health ✓
- [ ] SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'oral_%' → 10 tables
- [ ] SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'gih_%' → UNCHANGED
- [ ] SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'gaming_%' → UNCHANGED

## ETL Initial Load
- [ ] Run: npx prisma migrate deploy
- [ ] Run: npm run etl:full
- [ ] Verify: SELECT COUNT(*) FROM oral_provider → 150,000+
- [ ] Verify: SELECT COUNT(*) FROM oral_dso → 100+
- [ ] Verify: SELECT COUNT(*) FROM oral_cohort_benchmark → 200+
- [ ] Verify: SELECT COUNT(*) FROM oral_search_index → 150,000+

## Performance
- [ ] Search response < 300ms
- [ ] Briefing generation < 2s
- [ ] Compass AI < 4s
- [ ] Landing page Lighthouse >= 90
