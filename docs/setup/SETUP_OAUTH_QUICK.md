# Quick OAuth Setup - Final Step Before Deployment

## 🎯 Production URLs for OAuth Apps

**App URL**: `https://websecurityapp.azurewebsites.net`  
**Google Redirect**: `https://websecurityapp.azurewebsites.net/api/auth/callback/google`  
**GitHub Callback**: `https://websecurityapp.azurewebsites.net/api/auth/callback/github`

## 1. Google OAuth (5 minutes)

1. **Go to**: [Google Cloud Console](https://console.cloud.google.com/)
2. **Create Project**: "WebSecurityApp Production"
3. **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **OAuth 2.0 Client IDs**
4. **Application type**: Web application
5. **Name**: WebSecurityApp Production
6. **Authorized redirect URIs**: 
   ```
   https://websecurityapp.azurewebsites.net/api/auth/callback/google
   ```
7. **Copy Client ID and Secret**

**Update GitHub Secret:**
```bash
gh secret set GOOGLE_CLIENT_ID --body "your-actual-google-client-id"
gh secret set GOOGLE_CLIENT_SECRET --body "your-actual-google-client-secret"
```

## 2. GitHub OAuth (3 minutes)

1. **Go to**: [GitHub Developer Settings](https://github.com/settings/developers)
2. **New OAuth App**:
   - **Application name**: WebSecurityApp Production
   - **Homepage URL**: `https://websecurityapp.azurewebsites.net`
   - **Authorization callback URL**: 
     ```
     https://websecurityapp.azurewebsites.net/api/auth/callback/github
     ```
3. **Copy Client ID and Secret**

**Update GitHub Secret:**
```bash
gh secret set GH_CLIENT_ID --body "your-actual-github-client-id"
gh secret set GH_CLIENT_SECRET --body "your-actual-github-client-secret"
```

## 3. Deploy! 🚀

Once OAuth credentials are set:

```bash
git push origin main
```

The GitHub Actions workflow will automatically deploy your app to production!

## 4. Test Your Live App

After deployment (takes ~5 minutes):
- ✅ Visit: https://websecurityapp.azurewebsites.net
- ✅ Test Google login
- ✅ Test GitHub login  
- ✅ Test camera permissions
- ✅ Test object detection
- ✅ Check health: https://websecurityapp.azurewebsites.net/api/health

---

**🎉 You're literally 8 minutes away from having a live production AI security monitoring app!**