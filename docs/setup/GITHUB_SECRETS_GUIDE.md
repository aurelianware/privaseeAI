# GitHub Secrets Configuration

This document provides a quick reference for all GitHub secrets required for the production CI/CD pipeline.

## Required Secrets

### Azure Authentication (Managed Identity)
```
AZURE_CLIENT_ID
  Description: Managed Identity client ID for Azure authentication
  How to get: az identity show --name <identity-name> --resource-group <rg> --query clientId -o tsv
  Example: 12345678-1234-1234-1234-123456789012

AZURE_TENANT_ID
  Description: Azure AD tenant ID
  How to get: az account show --query tenantId -o tsv
  Example: 87654321-4321-4321-4321-210987654321

AZURE_SUBSCRIPTION_ID
  Description: Azure subscription ID
  How to get: az account show --query id -o tsv
  Example: abcdef01-2345-6789-abcd-ef0123456789
```

### Azure Container Registry
```
ACR_NAME
  Description: Azure Container Registry name (without .azurecr.io)
  Example: privaseeaiacr
  Note: Must be globally unique and lowercase
```

### Azure Resources
```
AZURE_RESOURCE_GROUP
  Description: Azure resource group name containing all resources
  Example: rg-privaseeai-prod

ACA_ENVIRONMENT
  Description: Azure Container Apps environment name
  Example: privaseeai-env
```

### Database
```
DATABASE_URL
  Description: PostgreSQL connection string
  Format: postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
  Example: postgresql://privaseeai:securepass123@privaseeai-db.postgres.database.azure.com:5432/privaseeai?sslmode=require
  Security: Mark as secret, never log or display
```

### Authentication
```
NEXTAUTH_SECRET
  Description: Secret key for NextAuth.js session encryption
  How to generate: openssl rand -base64 32
  Example: abc123def456ghi789jkl012mno345pqr678stu901vwx234yz=
  Security: Must be kept secret, rotate periodically

NEXTAUTH_URL
  Description: Your production application URL
  Example: https://privaseeai.net
  Note: Must include https:// and match your actual domain
```

### OAuth Providers (if using)
```
GOOGLE_CLIENT_ID
  Description: Google OAuth client ID
  How to get: Google Cloud Console → APIs & Services → Credentials
  Example: 123456789012-abc123def456ghi789jkl012mno345pq.apps.googleusercontent.com

GOOGLE_CLIENT_SECRET
  Description: Google OAuth client secret
  How to get: Google Cloud Console → APIs & Services → Credentials
  Security: Mark as secret

GH_CLIENT_ID
  Description: GitHub OAuth client ID
  How to get: GitHub Settings → Developer settings → OAuth Apps
  Example: Iv1.1234567890abcdef

GH_CLIENT_SECRET
  Description: GitHub OAuth client secret
  How to get: GitHub Settings → Developer settings → OAuth Apps
  Security: Mark as secret
```

### Azure Storage
```
AZURE_STORAGE_CONNECTION_STRING
  Description: Azure Storage account connection string
  How to get: az storage account show-connection-string --name <account> --resource-group <rg> -o tsv
  Format: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
  Security: Mark as secret, contains storage account key
```

### Monitoring (Optional)
```
APPINSIGHTS_INSTRUMENTATIONKEY
  Description: Application Insights instrumentation key
  How to get: az monitor app-insights component show --app <name> --resource-group <rg> --query instrumentationKey -o tsv
  Example: 12345678-1234-1234-1234-123456789012
  Optional: Only needed if using Application Insights
```

## How to Add Secrets to GitHub

### Via GitHub Web Interface
1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the secret name (exactly as shown above)
5. Paste the secret value
6. Click **Add secret**

### Via GitHub CLI
```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Authenticate
gh auth login

# Add a secret
gh secret set AZURE_CLIENT_ID -b "your-client-id-here"
gh secret set AZURE_TENANT_ID -b "your-tenant-id-here"
# ... repeat for all secrets
```

### Bulk Import from .env file
```bash
# Create a .env.production file (DO NOT COMMIT)
cat > .env.production << 'EOF'
AZURE_CLIENT_ID=your-value
AZURE_TENANT_ID=your-value
AZURE_SUBSCRIPTION_ID=your-value
# ... etc
EOF

# Import all secrets
while IFS='=' read -r key value; do
  [[ $key =~ ^#.*$ ]] && continue  # Skip comments
  [[ -z $key ]] && continue        # Skip empty lines
  gh secret set "$key" -b "$value"
done < .env.production

# Delete the file immediately
rm .env.production
```

## Verification

After adding secrets, verify they're set correctly:

```bash
# List all secrets (values are hidden)
gh secret list

# Test the workflow
# Push a commit or manually trigger the workflow
gh workflow run build-and-push.yml
```

## Security Best Practices

1. **Never Commit Secrets** - Use .gitignore for any files containing secrets
2. **Rotate Regularly** - Update secrets every 90 days
3. **Use Managed Identity** - Prefer managed identity over service principal passwords
4. **Limit Scope** - Give each secret the minimum required permissions
5. **Audit Access** - Review who has access to repository secrets
6. **Monitor Usage** - Check workflow logs for secret-related issues
7. **Delete Unused** - Remove old secrets that are no longer needed

## Troubleshooting

### Secret Not Found Error
- Verify secret name matches exactly (case-sensitive)
- Check that secret is added to the repository (not organization)
- Ensure workflow has permission to access secrets

### Authentication Failed
- Verify Azure credentials are correct
- Check that Managed Identity has proper permissions
- Ensure subscription ID is correct

### Database Connection Failed
- Verify DATABASE_URL format is correct
- Check PostgreSQL firewall rules
- Ensure SSL mode is set to 'require'

### OAuth Not Working
- Verify redirect URIs match exactly
- Check that client IDs and secrets are correct
- Ensure OAuth apps are enabled

## Quick Setup Script

```bash
#!/bin/bash
# GitHub Secrets Setup Script
# Run this after manually collecting all values

echo "Setting up GitHub secrets..."

# Azure
gh secret set AZURE_CLIENT_ID -b "$AZURE_CLIENT_ID"
gh secret set AZURE_TENANT_ID -b "$AZURE_TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID -b "$AZURE_SUBSCRIPTION_ID"
gh secret set ACR_NAME -b "$ACR_NAME"
gh secret set AZURE_RESOURCE_GROUP -b "$AZURE_RESOURCE_GROUP"
gh secret set ACA_ENVIRONMENT -b "$ACA_ENVIRONMENT"

# Database
gh secret set DATABASE_URL -b "$DATABASE_URL"

# Auth
gh secret set NEXTAUTH_SECRET -b "$NEXTAUTH_SECRET"
gh secret set NEXTAUTH_URL -b "$NEXTAUTH_URL"

# Storage
gh secret set AZURE_STORAGE_CONNECTION_STRING -b "$AZURE_STORAGE_CONNECTION_STRING"

# Optional: Monitoring
if [ -n "$APPINSIGHTS_INSTRUMENTATIONKEY" ]; then
  gh secret set APPINSIGHTS_INSTRUMENTATIONKEY -b "$APPINSIGHTS_INSTRUMENTATIONKEY"
fi

echo "✅ All secrets configured!"
gh secret list
```

## Minimal Setup (for testing)

If you just want to test the Docker build and push workflow:

```bash
# Required for build-and-push.yml
gh secret set AZURE_CLIENT_ID -b "your-client-id"
gh secret set AZURE_TENANT_ID -b "your-tenant-id"
gh secret set AZURE_SUBSCRIPTION_ID -b "your-subscription-id"
gh secret set ACR_NAME -b "your-acr-name"

# That's it! Build workflow will run
```

For full deployment, you'll need all secrets listed above.
