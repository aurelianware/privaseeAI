# Domain Setup for privaseeai.net

## DNS Configuration Required

Please add the following DNS records to your domain registrar (where you bought privaseeai.net):

### 1. A Record (Required)
- **Name**: `@` (or leave blank for root domain)
- **Type**: `A`
- **Value**: `20.119.128.21`
- **TTL**: `3600` (or default)

### 2. Domain Verification TXT Record (Required)
- **Name**: `asuid`
- **Type**: `TXT`
- **Value**: `160080722F0D17A3A4FFF02F5256670F0B0EDE8B8F8BC2931E7CFAF19E543B3A`
- **TTL**: `3600` (or default)

### 3. CNAME Record for www (Optional but recommended)
- **Name**: `www`
- **Type**: `CNAME`
- **Value**: `websecurityapp.azurewebsites.net`
- **TTL**: `3600` (or default)

## After DNS Configuration

1. **Wait for DNS Propagation**: 5-30 minutes (check at https://dnschecker.org)

2. **Run the Domain Configuration Script**:
   ```bash
   chmod +x configure-domain.sh
   ./configure-domain.sh
   ```

3. **Update OAuth Applications**:

### Google OAuth Console
- Go to: https://console.developers.google.com/
- Select your project with Client ID: `941625259851-65fphqqgc8k448pmom3vm8dlhadij9k2.apps.googleusercontent.com`
- Navigate to: APIs & Services → Credentials
- Edit your OAuth 2.0 Client ID
- Update **Authorized redirect URIs**:
  - Remove: `https://websecurityapp.azurewebsites.net/api/auth/callback/google`
  - Add: `https://privaseeai.net/api/auth/callback/google`
  - Add: `https://www.privaseeai.net/api/auth/callback/google` (if using www)

### GitHub OAuth App
- Go to: https://github.com/settings/applications
- Find your OAuth App with Client ID: `Ov23li6EzRjNaNkUJte9`
- Click **Update application**
- Update **Authorization callback URL**:
  - Change from: `https://websecurityapp.azurewebsites.net/api/auth/callback/github`
  - To: `https://privaseeai.net/api/auth/callback/github`

## Environment Variables Update

Update the following Azure App Service configuration:

```bash
# Update NextAuth URL
az webapp config appsettings set \
  --name websecurityapp \
  --resource-group rg-websecurityapp-prod \
  --settings NEXTAUTH_URL=https://privaseeai.net

# Update any other domain-specific variables if needed
az webapp config appsettings set \
  --name websecurityapp \
  --resource-group rg-websecurityapp-prod \
  --settings SITE_URL=https://privaseeai.net
```

## Verification Steps

After completing all steps:

1. **Test Domain Access**: Visit https://privaseeai.net
2. **Test SSL Certificate**: Verify the green lock icon in browser
3. **Test OAuth Login**: Try signing in with Google and GitHub
4. **Test Camera Access**: Ensure HTTPS is working for camera permissions

## Troubleshooting

- **Domain not resolving**: Check DNS propagation at dnschecker.org
- **SSL certificate issues**: Wait 10-15 minutes after domain binding
- **OAuth errors**: Verify redirect URIs exactly match the new domain
- **Camera not working**: Ensure site is accessed via HTTPS (required for camera)

## SSL Certificate

The script will automatically provision a free Azure-managed SSL certificate. If you prefer to use your own certificate, you can upload it through the Azure portal.