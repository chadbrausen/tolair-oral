#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Reveal Oral Health — Azure Infrastructure Setup
# Run these commands manually in Azure Cloud Shell or az CLI
# IMPORTANT: Do NOT modify any existing Tolair resources
# ═══════════════════════════════════════════════════════════

set -e

RESOURCE_GROUP="tolair-rg"
LOCATION="centralus"
ACR_NAME="tolairregistry"
KEYVAULT_NAME="tolair-vault"

echo "═══ Reveal Oral Health — Azure Setup ═══"

# ── 1. App Service Plan (reuse existing or create new) ────
# Check if existing plan has capacity first:
# az appservice plan show --name tolair-plan --resource-group $RESOURCE_GROUP
# If at capacity, create a new plan:
az appservice plan create \
  --name tolair-oral-plan \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku B2 \
  --is-linux

# ── 2. Backend App Service ───────────────────────────────
az webapp create \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP \
  --plan tolair-oral-plan \
  --deployment-container-image-name "${ACR_NAME}.azurecr.io/tolair-oral-api:latest"

# Configure backend settings
az webapp config appsettings set \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP \
  --settings \
    PORT=3004 \
    WEBSITES_PORT=3004 \
    NODE_ENV=production \
    CORS_ORIGIN=https://oral.tolair.org \
    SMTP_HOST=smtp.sendgrid.net \
    SMTP_PORT=587 \
    SMTP_USER=apikey \
    SMTP_FROM=noreply@tolair.org

# Key Vault references for secrets
az webapp config appsettings set \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP \
  --settings \
    "DATABASE_URL=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=DATABASE-URL-ORAL)" \
    "ANTHROPIC_API_KEY=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=ANTHROPIC-API-KEY-ORAL)" \
    "HUBSPOT_API_KEY=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=HUBSPOT-API-KEY)" \
    "SMTP_PASS=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=SMTP-PASS-ORAL)"

# Enable managed identity for Key Vault access
az webapp identity assign \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP

# Grant Key Vault access (run after identity is assigned)
API_PRINCIPAL_ID=$(az webapp identity show --name tolair-oral-api --resource-group $RESOURCE_GROUP --query principalId -o tsv)
az keyvault set-policy \
  --name $KEYVAULT_NAME \
  --object-id $API_PRINCIPAL_ID \
  --secret-permissions get list

# Enable ACR pull
az webapp config container set \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP \
  --docker-registry-server-url "https://${ACR_NAME}.azurecr.io" \
  --docker-registry-server-user $(az acr credential show --name $ACR_NAME --query username -o tsv) \
  --docker-registry-server-password $(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Health check
az webapp config set \
  --name tolair-oral-api \
  --resource-group $RESOURCE_GROUP \
  --generic-configurations '{"healthCheckPath": "/oral/search?q=health"}'

echo "✅ Backend App Service created: tolair-oral-api.azurewebsites.net"

# ── 3. Frontend App Service ──────────────────────────────
az webapp create \
  --name tolair-oral-app \
  --resource-group $RESOURCE_GROUP \
  --plan tolair-oral-plan \
  --deployment-container-image-name "${ACR_NAME}.azurecr.io/tolair-oral-app:latest"

# Configure frontend settings
az webapp config appsettings set \
  --name tolair-oral-app \
  --resource-group $RESOURCE_GROUP \
  --settings \
    PORT=3000 \
    WEBSITES_PORT=3000 \
    NODE_ENV=production \
    NEXT_PUBLIC_API_URL=https://tolair-oral-api.azurewebsites.net \
    NEXT_PUBLIC_SITE_URL=https://oral.tolair.org

# Enable managed identity
az webapp identity assign \
  --name tolair-oral-app \
  --resource-group $RESOURCE_GROUP

# Enable ACR pull
az webapp config container set \
  --name tolair-oral-app \
  --resource-group $RESOURCE_GROUP \
  --docker-registry-server-url "https://${ACR_NAME}.azurecr.io" \
  --docker-registry-server-user $(az acr credential show --name $ACR_NAME --query username -o tsv) \
  --docker-registry-server-password $(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Health check
az webapp config set \
  --name tolair-oral-app \
  --resource-group $RESOURCE_GROUP \
  --generic-configurations '{"healthCheckPath": "/"}'

echo "✅ Frontend App Service created: tolair-oral-app.azurewebsites.net"

# ── 4. Key Vault Secrets ─────────────────────────────────
# Add NEW secrets only — do NOT modify existing secrets

echo "Adding Key Vault secrets (set actual values manually)..."

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name "DATABASE-URL-ORAL" \
  --value "postgresql://oral_user:CHANGEME@tolair-db.postgres.database.azure.com:5432/tolair?schema=public"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name "ANTHROPIC-API-KEY-ORAL" \
  --value "sk-ant-CHANGEME"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name "SMTP-PASS-ORAL" \
  --value "SG.CHANGEME"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name "ORAL-JWT-SECRET" \
  --value "$(openssl rand -hex 32)"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name "ORAL-SESSION-SECRET" \
  --value "$(openssl rand -hex 32)"

echo "✅ Key Vault secrets added (update values in Azure Portal)"

# ── 5. Custom Domain + SSL ───────────────────────────────
# DNS: Add CNAME record: oral.tolair.org → tolair-oral-app.azurewebsites.net
# Then:

# az webapp config hostname add \
#   --webapp-name tolair-oral-app \
#   --resource-group $RESOURCE_GROUP \
#   --hostname oral.tolair.org

# az webapp config ssl bind \
#   --name tolair-oral-app \
#   --resource-group $RESOURCE_GROUP \
#   --ssl-type SNI \
#   --certificate-thumbprint $(az webapp config ssl upload ...)

# For now, use Azure-managed certificate:
# az webapp config ssl create \
#   --name tolair-oral-app \
#   --resource-group $RESOURCE_GROUP \
#   --hostname oral.tolair.org

echo "⚠️  DNS: Add CNAME record manually:"
echo "   oral.tolair.org → tolair-oral-app.azurewebsites.net"
echo "   Then bind custom domain + SSL in Azure Portal"

# ── 6. Database Migration ────────────────────────────────
echo ""
echo "═══ Post-Deploy Steps ═══"
echo "1. Set real values for Key Vault secrets in Azure Portal"
echo "2. Add DNS CNAME: oral.tolair.org → tolair-oral-app.azurewebsites.net"
echo "3. Run: npx prisma migrate deploy (with production DATABASE_URL)"
echo "4. Run: npm run etl:full (initial data load)"
echo "5. Verify: curl https://oral.tolair.org"
echo "6. Verify: curl https://tolair-oral-api.azurewebsites.net/oral/search?q=test"
echo ""
echo "═══ Isolation Verification ═══"
echo "7. curl https://reveal.tolair.org → should return GIH (unchanged)"
echo "8. curl https://gaming.tolair.org → should return Gaming (unchanged)"
echo "9. curl https://app.tolair.org → should return Platform (unchanged)"

echo ""
echo "✅ Azure setup complete!"
