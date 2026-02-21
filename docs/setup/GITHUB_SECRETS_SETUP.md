# GitHub Actions Secrets Setup for Production Deployment

This document outlines the required secrets for automated deployment to Azure App Service.

## Required GitHub Secrets

### Azure Deployment
Add these secrets in your GitHub repository: Settings → Secrets and variables → Actions

```
AZURE_CREDENTIALS
```
**Value**: Service Principal JSON for Azure authentication
**How to get**: Run `az ad sp create-for-rbac --name "github-actions-websecurityapp" --role contributor --scopes /subscriptions/{subscription-id}/resourceGroups/rg-websecurityapp-prod --sdk-auth`

```
AZURE_WEBAPP_NAME
```
**Value**: `websecurityapp`
**Description**: Name of the Azure App Service

```
AZURE_WEBAPP_PUBLISH_PROFILE
```
**Value**: Publishing profile XML
**How to get**: Download from Azure Portal → App Service → Get publish profile

### Application Configuration
```
NEXTAUTH_SECRET
```
**Value**: Generate with `openssl rand -base64 32`
**Description**: NextAuth.js encryption secret

```
NEXTAUTH_URL
```
**Value**: `https://websecurityapp.azurewebsites.net`
**Description**: Production app URL

```
DATABASE_URL
```
**Value**: Your production database connection string
**Description**: PostgreSQL/SQLite connection for Prisma

### OAuth Providers
```
GOOGLE_CLIENT_ID
```
**Value**: Google OAuth client ID for production
**Description**: From Google Cloud Console

```
GOOGLE_CLIENT_SECRET
```
**Value**: Google OAuth client secret for production
**Description**: From Google Cloud Console

```
GITHUB_ID
```
**Value**: GitHub OAuth app client ID for production
**Description**: From GitHub Developer Settings

```
GITHUB_SECRET
```
**Value**: GitHub OAuth app client secret for production
**Description**: From GitHub Developer Settings

### Stripe Payment Processing
```
STRIPE_SECRET_KEY
```
**Value**: Stripe live mode secret key (sk_live_...)
**Description**: For production payment processing

```
STRIPE_PUBLISHABLE_KEY
```
**Value**: Stripe live mode publishable key (pk_live_...)
**Description**: For client-side Stripe integration

```
STRIPE_WEBHOOK_SECRET
```
**Value**: Stripe webhook endpoint secret
**Description**: For webhook signature verification

### Azure Storage
```
AZURE_STORAGE_CONNECTION_STRING
```
**Value**: From deployment script output
**Description**: For cloud sync functionality

```
AZURE_STORAGE_ACCOUNT_NAME
```
**Value**: Storage account name from Bicep deployment
**Description**: For blob storage operations

## Setup Commands

### 1. Create Azure Service Principal
```bash
# Replace {subscription-id} with your Azure subscription ID
az ad sp create-for-rbac \
  --name "github-actions-websecurityapp" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/rg-websecurityapp-prod \
  --sdk-auth
```

### 2. Add Secrets to GitHub
```bash
# Use GitHub CLI (install with: brew install gh)
gh auth login
gh secret set AZURE_CREDENTIALS --body "$(cat azure-credentials.json)"
gh secret set NEXTAUTH_SECRET --body "$(openssl rand -base64 32)"
gh secret set NEXTAUTH_URL --body "https://websecurityapp.azurewebsites.net"
# Continue for all other secrets...
```

### 3. Verify Secrets
```bash
gh secret list
```

## OAuth Application Setup

### Google OAuth (Google Cloud Console)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `https://websecurityapp.azurewebsites.net/api/auth/callback/google`

### GitHub OAuth (GitHub Developer Settings)
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create New OAuth App
3. Set Authorization callback URL:
   - `https://websecurityapp.azurewebsites.net/api/auth/callback/github`

## Security Best Practices

- ✅ Use separate OAuth apps for production vs development
- ✅ Rotate secrets regularly (quarterly recommended)
- ✅ Use GitHub's encrypted secrets (never commit secrets to code)
- ✅ Limit service principal permissions to specific resource group
- ✅ Monitor secret usage in GitHub Actions logs
- ✅ Set up alerts for failed authentications

## Troubleshooting

### Common Issues
1. **Azure authentication fails**: Check service principal permissions
2. **OAuth redirect mismatch**: Verify redirect URIs match exactly
3. **Stripe webhook failures**: Ensure webhook URL is accessible
4. **Database connection fails**: Check connection string format

### Debug Commands
```bash
# Test Azure authentication
az login --service-principal -u $AZURE_CLIENT_ID -p $AZURE_CLIENT_SECRET --tenant $AZURE_TENANT_ID

# Test GitHub secrets
gh secret list

# Check deployment logs
gh run list
gh run view {run-id}
```