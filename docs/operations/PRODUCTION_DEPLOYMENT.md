# Production Deployment Guide

## Overview
This guide covers the complete production deployment of PrivaseeAI using the newly implemented production hardening features.

## Prerequisites

### Required Azure Resources
1. **Azure Container Registry (ACR)** - for Docker images
2. **Azure Container Apps Environment** - for hosting
3. **Azure PostgreSQL Database** - for production data
4. **Azure Storage Account** - for blob storage
5. **Azure Application Insights** (optional) - for monitoring

### Required GitHub Secrets
Configure these secrets in your GitHub repository (Settings → Secrets and variables → Actions):

- `AZURE_CLIENT_ID` - Managed Identity client ID
- `AZURE_TENANT_ID` - Azure tenant ID
- `AZURE_SUBSCRIPTION_ID` - Azure subscription ID
- `ACR_NAME` - Azure Container Registry name (e.g., privaseeaiacr)
- `AZURE_RESOURCE_GROUP` - Resource group name
- `ACA_ENVIRONMENT` - Container Apps environment name
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `NEXTAUTH_URL` - Your production URL
- `AZURE_STORAGE_CONNECTION_STRING` - Blob storage connection
- `APPINSIGHTS_INSTRUMENTATIONKEY` - Application Insights key (optional)

## Deployment Steps

### 1. Set Up Azure Infrastructure

```bash
# Set your variables
RESOURCE_GROUP="rg-privaseeai-prod"
LOCATION="eastus"
ACR_NAME="privaseeaiacr"
ACA_ENV="privaseeai-env"
STORAGE_ACCOUNT="privaseeaistorage"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Create Container Apps environment
az containerapp env create \
  --name $ACA_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

# Create blob containers
az storage container create \
  --name events \
  --account-name $STORAGE_ACCOUNT

az storage container create \
  --name media \
  --account-name $STORAGE_ACCOUNT

az storage container create \
  --name recordings \
  --account-name $STORAGE_ACCOUNT

# Apply blob lifecycle policy
az storage account management-policy create \
  --account-name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --policy @infra/blob-lifecycle.json
```

### 2. Set Up Database

```bash
# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name privaseeai-db \
  --location $LOCATION \
  --admin-user privaseeai \
  --admin-password <secure-password> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --public-access 0.0.0.0 \
  --storage-size 32 \
  --version 14

# Create database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name privaseeai-db \
  --database-name privaseeai

# Get connection string
DATABASE_URL="postgresql://privaseeai:<password>@privaseeai-db.postgres.database.azure.com:5432/privaseeai?sslmode=require"
```

### 3. Configure Managed Identity

```bash
# Create user-assigned managed identity
az identity create \
  --name privaseeai-identity \
  --resource-group $RESOURCE_GROUP

# Get identity details
IDENTITY_ID=$(az identity show \
  --name privaseeai-identity \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)

CLIENT_ID=$(az identity show \
  --name privaseeai-identity \
  --resource-group $RESOURCE_GROUP \
  --query clientId -o tsv)

# Assign ACR pull permission to managed identity
az role assignment create \
  --assignee $CLIENT_ID \
  --scope $(az acr show --name $ACR_NAME --query id -o tsv) \
  --role AcrPull
```

### 4. Run Database Migrations

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://privaseeai:<password>@privaseeai-db.postgres.database.azure.com:5432/privaseeai?sslmode=require"

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed initial data
# npx prisma db seed
```

### 5. Configure GitHub Secrets

Add all the required secrets listed above to your GitHub repository.

### 6. Deploy Application

```bash
# Push to main branch to trigger CI/CD
git push origin main

# Or manually trigger workflows in GitHub Actions
```

The CI/CD pipeline will:
1. Build the application
2. Create Docker image
3. Push to ACR
4. Deploy to Azure Container Apps
5. Run health checks

### 7. Verify Deployment

```bash
# Get the Container App URL
APP_URL=$(az containerapp show \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

# Test health endpoint
curl https://$APP_URL/healthz

# Test security headers
curl -I https://$APP_URL/
```

## Post-Deployment Configuration

### Configure Custom Domain (Optional)

```bash
# Add custom domain to Container App
az containerapp hostname add \
  --hostname privaseeai.net \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP

# Configure DNS records
# Add CNAME record: privaseeai.net → <container-app-fqdn>
```

### Configure CORS for Storage

```bash
# Configure CORS for blob storage
az storage cors add \
  --services b \
  --methods GET POST PUT DELETE OPTIONS \
  --origins "https://privaseeai.net" "https://www.privaseeai.net" \
  --allowed-headers "*" \
  --exposed-headers "*" \
  --max-age 3600 \
  --account-name $STORAGE_ACCOUNT
```

### Set Up Monitoring

```bash
# Create Application Insights
az monitor app-insights component create \
  --app privaseeai-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP \
  --application-type web

# Get instrumentation key
INSIGHTS_KEY=$(az monitor app-insights component show \
  --app privaseeai-insights \
  --resource-group $RESOURCE_GROUP \
  --query instrumentationKey -o tsv)

# Add to Container App
az containerapp update \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars APPINSIGHTS_INSTRUMENTATIONKEY=$INSIGHTS_KEY
```

## Monitoring and Maintenance

### Health Check Endpoints
- `/healthz` - Primary health check (used by Docker)
- `/health` - Secondary health check
- `/api/health` - Legacy health check

### View Logs
```bash
# Container App logs
az containerapp logs show \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP \
  --follow

# Application Insights (if configured)
# View in Azure Portal under Application Insights
```

### Scaling
```bash
# Update scaling rules
az containerapp update \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP \
  --min-replicas 1 \
  --max-replicas 5
```

### Update Application
Simply push to the main branch. The CI/CD pipeline will:
1. Build new Docker image
2. Tag with commit SHA
3. Deploy to Container Apps
4. Run health checks

## Rollback Procedure

```bash
# List available image tags
az acr repository show-tags \
  --name $ACR_NAME \
  --repository privaseeai \
  --orderby time_desc

# Deploy specific version
az containerapp update \
  --name privaseeai-app \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/privaseeai:<previous-sha>
```

## Security Best Practices

1. **Rotate Secrets Regularly** - Update NEXTAUTH_SECRET and database passwords
2. **Monitor Logs** - Check Application Insights for anomalies
3. **Update Dependencies** - Run `npm audit` regularly
4. **Review Access** - Audit IAM roles and permissions
5. **Backup Database** - Configure automated backups for PostgreSQL
6. **Test Disaster Recovery** - Verify backup restore procedures

## Troubleshooting

### Container Won't Start
- Check logs: `az containerapp logs show`
- Verify environment variables are set
- Check DATABASE_URL connection

### Database Connection Issues
- Verify firewall rules allow Container App IP
- Check connection string format
- Ensure SSL mode is `require`

### Blob Storage Access Issues
- Verify CORS settings
- Check SAS token expiration
- Ensure storage account is accessible

### Health Check Failures
- Check if port 8080 is exposed
- Verify `/healthz` endpoint is accessible
- Check container startup time

## Cost Optimization

1. **Use lifecycle policies** - Already configured (30-day retention)
2. **Right-size resources** - Monitor CPU/memory usage
3. **Scale to zero** - Configure min-replicas to 0 for dev
4. **Use Cool/Archive tiers** - For old blob data
5. **Enable CDN** - For static assets

## Support

For issues or questions:
- Review logs in Application Insights
- Check GitHub Actions workflow runs
- Review Azure Container Apps metrics
- Contact support@privaseeai.net
