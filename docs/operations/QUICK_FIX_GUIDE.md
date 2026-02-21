# Quick Fix for Azure Blob Storage

## Option 1: Container-level SAS Token (Recommended)

1. **Go to Azure Portal** → `aurelianwarestorage` → **Containers** → `security-events`
2. **Click "Generate SAS"** (on the container, not the account)
3. **Set permissions**: ✅ Read ✅ Write ✅ Delete ✅ List
4. **Set expiry**: Future date (e.g., 3 months)
5. **Click "Generate SAS token and URL"**
6. **Copy the SAS token** (the part after `?`)

## Option 2: Fix CORS for Account-level SAS

1. **Storage Account** → **Settings** → **Resource sharing (CORS)**
2. **Blob service tab** → **Add rule**:
   ```
   Allowed origins: *
   Allowed methods: GET,PUT,POST,DELETE,HEAD,OPTIONS
   Allowed headers: *
   Exposed headers: *
   Max age: 3600
   ```
3. **Click Save** and wait 2 minutes

## Option 3: Access Keys (Less Secure, but Simple)

If you want to try access keys:
1. **Storage Account** → **Security + networking** → **Access keys**
2. **Copy key1** or **key2**
3. Use this in the app instead of SAS token

**Warning**: Access keys give full account access and should only be used for development.

## Test Order:
1. Try Option 1 (container SAS) first
2. If that fails, try Option 2 (fix CORS)
3. Option 3 only for development testing

Which option would you like to try first?