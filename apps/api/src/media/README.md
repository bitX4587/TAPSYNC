# Media Module

## Overview

The Media module handles avatar uploads for user profiles. It validates file types and sizes, resizes images to consistent dimensions, and uploads them to S3-compatible storage.

## Features

### Implemented (Task 5.4)

1. **File Validation**
   - Accepts JPEG, PNG, and WebP formats only
   - Enforces 5MB maximum file size
   - Rejects invalid files with clear error messages

2. **Image Processing**
   - Resizes all images to 512x512 pixels
   - Uses `sharp` for efficient, high-quality resizing
   - Converts all formats to JPEG for consistency
   - Crops to cover (centered) to maintain aspect ratio

3. **Storage**
   - Uploads to S3-compatible storage using `@aws-sdk/client-s3`
   - Generates unique filenames: `{userId}-{timestamp}-{hash}.jpg`
   - Stores in `avatars/` prefix for organization
   - Supports CDN URL configuration for faster delivery

4. **API Endpoint**
   - `POST /user/me/avatar` with multipart/form-data
   - Field name: `avatar`
   - Requires authentication (JWT)
   - Updates `User.avatarUrl` field automatically

## Configuration

Required environment variables:

```env
STORAGE_BUCKET=your-bucket-name
STORAGE_KEY_ID=your-access-key-id
STORAGE_SECRET=your-secret-access-key
STORAGE_REGION=us-east-1
STORAGE_CDN_URL=https://cdn.example.com  # Optional
```

## Usage

### From Mobile/Web Client

```typescript
const formData = new FormData();
formData.append('avatar', file);

const response = await fetch('/user/me/avatar', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  body: formData,
});

const profile = await response.json();
console.log('New avatar URL:', profile.avatarUrl);
```

### Testing

Unit tests cover:
- MIME type validation
- File size validation
- JPEG, PNG, and WebP acceptance
- CDN URL vs S3 URL fallback
- Unique filename generation

Run tests:
```bash
pnpm test media --filter @tapsync/api
```

## Requirements

Implements Requirement 2.5:
- ✓ Avatar upload (type/size validation, resize, storage, CDN URL)
