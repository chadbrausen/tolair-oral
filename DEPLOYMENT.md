# Reveal Oral Health — Deployment Guide

## Architecture
- **Backend**: tolair-oral-api → Azure App Service (B2 Linux) → tolairregistry.azurecr.io
- **Frontend**: tolair-oral-app → Azure App Service (B2 Linux) → tolairregistry.azurecr.io
- **Database**: Azure PostgreSQL Flexible Server (tolair-db, Central US)
- **Domain**: oral.tolair.org

## Prerequisites
1. Azure Container Registry: tolairregistry.azurecr.io
2. Azure App Service Plan: tolair-app-plan (B2 Linux, Central US) — shared with Gaming
3. Azure Key Vault: tolair-vault
4. PostgreSQL: tolair-db (Central US)

## Environment Variables

### Oral API (tolair-oral-api)
Set these in Azure App Service → Configuration → Application Settings:
| Variable | Source | Description |
|----------|--------|-------------|
| DATABASE_URL | Key Vault: oral-database-url | PostgreSQL connection string |
| ANTHROPIC_API_KEY | Key Vault: oral-anthropic-key | Compass AI API key |
| HUBSPOT_API_KEY | Key Vault: oral-hubspot-key | CRM integration |
| SMTP_PASS | Key Vault: oral-smtp-pass | SendGrid email delivery |
| FRONTEND_URL | Direct: https://oral.tolair.org | CORS + email links |
| CORS_ORIGIN | Direct: https://oral.tolair.org | CORS allowed origin |
| PORT | Direct: 3004 | Server port |
| WEBSITES_PORT | Direct: 3004 | Azure port mapping |
| NODE_ENV | Direct: production | Environment flag |
| SMTP_HOST | Direct: smtp.sendgrid.net | Email host |
| SMTP_PORT | Direct: 587 | Email port |
| SMTP_USER | Direct: apikey | SendGrid user |
| SMTP_FROM | Direct: noreply@tolair.org | From address |

### Oral App (tolair-oral-app)
| Variable | Source | Description |
|----------|--------|-------------|
| NEXT_PUBLIC_API_URL | Direct: https://tolair-oral-api.azurewebsites.net/oral | API base URL |

## Initial Deployment Steps

### 1. Create Azure Resources
```bash
# App Services (reuse existing tolair-app-plan)
az webapp create --name tolair-oral-api --resource-group tolair-prod \
  --plan tolair-app-plan --deployment-container-image-name \
  tolairregistry.azurecr.io/tolair-oral-api:latest

az webapp create --name tolair-oral-app --resource-group tolair-prod \
  --plan tolair-app-plan --deployment-container-image-name \
  tolairregistry.azurecr.io/tolair-oral-app:latest

# Configure ports
az webapp config appsettings set --name tolair-oral-api \
  --resource-group tolair-prod --settings WEBSITES_PORT=3004

# Enable HTTPS only
az webapp update --name tolair-oral-api --resource-group tolair-prod \
  --https-only true
az webapp update --name tolair-oral-app --resource-group tolair-prod \
  --https-only true
```

### 2. Custom Domain
```bash
# Add custom domain
az webapp config hostname add --webapp-name tolair-oral-app \
  --resource-group tolair-prod --hostname oral.tolair.org

# DNS records at Cloudflare:
# CNAME oral → tolair-oral-app.azurewebsites.net (DNS only / gray cloud)

# Create managed SSL certificate
az webapp config ssl create --name tolair-oral-app \
  --resource-group tolair-prod --hostname oral.tolair.org
```

### 3. Database Setup
```bash
# Connect to API container
az webapp ssh --name tolair-oral-api --resource-group tolair-prod

# Inside container:
npx prisma db push
npm run etl:full
```

### 4. Smoke Test
```bash
curl https://tolair-oral-api.azurewebsites.net/oral/search?q=heartland
curl https://oral.tolair.org
```

## CI/CD
- Push to `main` in tolair-oral-api/ triggers deploy-oral-api.yml
- Push to `main` in tolair-oral-app/ triggers deploy-oral-app.yml
- Both require `production` environment approval in GitHub

## GitHub Secrets Required
| Secret | Where to get it |
|--------|----------------|
| ACR_USERNAME | `az acr credential show --name tolairregistry --query username` |
| ACR_PASSWORD | `az acr credential show --name tolairregistry --query "passwords[0].value"` |
| AZURE_CREDENTIALS | Same service principal as Gaming — or create new with `az ad sp create-for-rbac` |
