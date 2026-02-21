# OAuth Setup for Production Deployment

## 🚀 Your Azure Resources Are Live!

**App URL**: https://websecurityapp.azurewebsites.net  
**Storage Account**: websecurityappstorage  
**Application Insights**: 85dbc9f7-f6df-49cc-81a7-7a2dccbeb9ac

## Next: Configure OAuth Providers

### 1. Google OAuth Configuration

1. **Go to**: [Google Cloud Console](https://console.cloud.google.com/)
2. **Create/Select Project**: "WebSecurityApp Production"
3. **Enable APIs**: Google+ API, Google Identity API
4. **Create OAuth 2.0 Client**:
   - Application type: Web application
   - Name: WebSecurityApp Production
   - Authorized redirect URIs: 
     ```
     https://websecurityapp.azurewebsites.net/api/auth/callback/google
     ```
5. **Copy**: Client ID and Client Secret

### 2. GitHub OAuth Configuration

1. **Go to**: [GitHub Developer Settings](https://github.com/settings/developers)
2. **New OAuth App**:
   - Application name: WebSecurityApp Production
   - Homepage URL: `https://websecurityapp.azurewebsites.net`
   - Authorization callback URL: 
     ```
     https://websecurityapp.azurewebsites.net/api/auth/callback/github
     ```
3. **Copy**: Client ID and Client Secret

### 3. Generate NextAuth Secret

```bash
openssl rand -base64 32
```

### 4. Quick GitHub Secrets Setup

Run these commands to set up GitHub Actions secrets:

```bash
# Install GitHub CLI if needed: brew install gh
gh auth login

# Set up core secrets
gh secret set NEXTAUTH_SECRET --body "$(openssl rand -base64 32)"
gh secret set NEXTAUTH_URL --body "https://websecurityapp.azurewebsites.net"
gh secret set AZURE_WEBAPP_NAME --body "websecurityapp"

# OAuth secrets (replace with actual values)
gh secret set GOOGLE_CLIENT_ID --body "your-google-client-id"
gh secret set GOOGLE_CLIENT_SECRET --body "your-google-client-secret"
gh secret set GITHUB_ID --body "your-github-oauth-client-id"
gh secret set GITHUB_SECRET --body "your-github-oauth-client-secret"

# Storage and monitoring
gh secret set AZURE_STORAGE_CONNECTION_STRING --body "your-azure-storage-connection-string-from-deployment"
gh secret set APPLICATIONINSIGHTS_CONNECTION_STRING --body "InstrumentationKey=85dbc9f7-f6df-49cc-81a7-7a2dccbeb9ac"
```

### 5. Azure Service Principal for GitHub Actions

```bash
# Create service principal for GitHub Actions
az ad sp create-for-rbac \
  --name "github-actions-websecurityapp" \
  --role contributor \
  --scopes /subscriptions/caf68aff-3bee-40e3-bf26-c4166efa952b/resourceGroups/rg-websecurityapp-prod \
  --sdk-auth

# Copy the JSON output and add as GitHub secret:
gh secret set AZURE_CREDENTIALS --body "$(cat azure-credentials.json)"
```

### 6. Deploy to Production

Once secrets are configured:

```bash
git add .
git commit -m "Add production deployment configuration"
git push origin main
```

The GitHub Actions workflow will automatically deploy your app!

## 🎯 Ready for Production Testing

After deployment, test these features:
- ✅ App loads at https://websecurityapp.azurewebsites.net
- ✅ OAuth login with Google/GitHub  
- ✅ Camera permissions and object detection
- ✅ Cloud sync to Azure Storage
- ✅ Health check at `/api/health`

Your security monitoring app will be live in production! 🚀