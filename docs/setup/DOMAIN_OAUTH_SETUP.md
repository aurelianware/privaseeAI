# OAuth Applications Setup Guide

## 🔐 Production OAuth Applications Configuration

### **GitHub OAuth Application**

1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the following details:

```
Application name: AI Security Monitor
Homepage URL: https://aurelianware.com
Application description: AI-powered home security monitoring SaaS platform
Authorization callback URL: https://aurelianware.com/api/auth/callback/github
```

4. After creating, copy the:
   - Client ID
   - Client Secret

### **Google OAuth Application**

1. Go to: https://console.cloud.google.com/
2. Select your project or create a new one
3. Go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client IDs"
5. Configure consent screen if needed
6. Fill in the following details:

```
Application type: Web application
Name: AI Security Monitor
Authorized JavaScript origins: 
  - https://aurelianware.com
  - https://www.aurelianware.com (if using www)
Authorized redirect URIs:
  - https://aurelianware.com/api/auth/callback/google
  - https://www.aurelianware.com/api/auth/callback/google (if using www)
```

7. After creating, copy the:
   - Client ID
   - Client Secret

### **Environment Variables for Azure**

Once you have the OAuth credentials, you'll need to set these in Azure App Service:

```bash
# NextAuth Configuration
NEXTAUTH_URL=https://aurelianware.com
NEXTAUTH_SECRET=[generate new secret with: openssl rand -base64 32]

# GitHub OAuth (Production)
GITHUB_CLIENT_ID=[your github client id]
GITHUB_CLIENT_SECRET=[your github client secret]

# Google OAuth (Production)
GOOGLE_CLIENT_ID=[your google client id]
GOOGLE_CLIENT_SECRET=[your google client secret]

# Database (Production)
DATABASE_URL=[your azure sql connection string]

# Stripe (Production - when ready)
STRIPE_PUBLISHABLE_KEY=[your live stripe publishable key]
STRIPE_SECRET_KEY=[your live stripe secret key]
STRIPE_WEBHOOK_SECRET=[your live stripe webhook secret]
STRIPE_PRO_PRICE_ID=[your live pro price id]
STRIPE_ENTERPRISE_PRICE_ID=[your live enterprise price id]
```

### **Current Status**

- ✅ Azure App Service: Running at ai-security-monitor.azurewebsites.net
- ✅ Domain verification ID: Generated
- ✅ Azure IP address: 20.119.16.34
- ❌ DNS records: Need to be configured
- ❌ OAuth apps: Need to be created with new domain
- ❌ Environment variables: Need to be updated in Azure

### **Next Steps**

1. **Configure DNS records** (see main script output)
2. **Wait for DNS propagation** (5-30 minutes)
3. **Run ./configure-domain.sh again** to add domain to Azure
4. **Create OAuth applications** (using info above)
5. **Update Azure environment variables**
6. **Test authentication**