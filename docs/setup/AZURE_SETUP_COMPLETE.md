# Azure Blob Storage Setup Guide

## Step 1: Create Container

1. Go to Azure Portal → `aurelianwarestorage` → **Containers**
2. Click **"+ Container"**
3. **Name**: `security-events`
4. **Public access level**: Private (container)
5. Click **"Create"**

## Step 2: Configure CORS (Required for Browser Access)

1. Go to `aurelianwarestorage` → **Settings** → **Resource sharing (CORS)**
2. Click **"Blob service"** tab
3. **Add new rule**:
   - **Allowed origins**: `http://localhost:3000,https://localhost:3000,http://192.168.50.133:3000`
   - **Allowed methods**: `GET,PUT,POST,DELETE,HEAD,OPTIONS`
   - **Allowed headers**: `*`
   - **Exposed headers**: `*`
   - **Max age**: `3600`
4. Click **"Save"**

## Step 3: Generate New SAS Token (if needed)

1. Go to `aurelianwarestorage` → **Security + networking** → **Shared access signature**
2. **Configure settings**:
   - ✅ **Allowed services**: Blob
   - ✅ **Allowed resource types**: Container ☑️ + Object ☑️
   - ✅ **Allowed permissions**: Read ☑️ + Write ☑️ + Delete ☑️ + List ☑️ + Add ☑️ + Create ☑️
   - ✅ **Start date/time**: Now
   - ✅ **End date/time**: Set to future date (e.g., 3 months)
   - ✅ **Allowed protocols**: HTTPS only
3. Click **"Generate SAS and connection string"**
4. **Copy the SAS token** (the part after `?`)

## Step 4: Test Connection

Open the test file in your browser:
http://localhost:3000/test-connection.html

## Your Current Settings:
- **Storage Account**: `aurelianwarestorage`
- **Container**: `security-events`
- **SAS Token**: `sp=racwdl&st=2025-10-11T06:08:53Z&se=2026-01-02T14:23:53Z&spr=https&sv=2024-11-04&sr=c&sig=BCl1ObQ4J24d7zppHXnYCDr044Egra50fYHknnHB1io%3D`

## Common Issues & Solutions:

### CORS Error
```
Access to fetch at 'https://...' has been blocked by CORS policy
```
**Solution**: Follow Step 2 above to configure CORS

### Container Not Found (404)
```
Status: 404 - The specified container does not exist
```
**Solution**: Follow Step 1 above to create the container

### Access Denied (403)
```
Status: 403 - This request is not authorized
```
**Solution**: Generate new SAS token with correct permissions (Step 3)

### Network Error
```
Failed to fetch
```
**Solution**: Usually CORS issue, follow Step 2