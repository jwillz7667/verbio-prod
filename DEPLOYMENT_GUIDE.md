# Backend Deployment to Google Cloud Run - Complete Guide

## Prerequisites
- Docker installed and running
- Google Cloud CLI (`gcloud`) installed and authenticated
- Docker configured to push to Google Container Registry (GCR)

## Step-by-Step Deployment Process

### 1. Navigate to Backend Directory
```bash
cd backend
```
**Important**: Always run deployment commands from the `backend` directory, NOT from the root directory.

### 2. Build Docker Image for AMD64 Architecture
```bash
docker buildx build --platform linux/amd64 -t gcr.io/neural-aquifer-467003-m0/verbio-backend --push .
```

**Critical Notes:**
- **MUST use `docker buildx build`** instead of regular `docker build`
- **MUST specify `--platform linux/amd64`** - Cloud Run requires AMD64/Linux architecture
- **MUST include `--push`** flag to push directly after building
- The image tag format is: `gcr.io/[PROJECT_ID]/[IMAGE_NAME]`
- Project ID: `neural-aquifer-467003-m0`
- Image name: `verbio-backend`

### 3. Deploy to Cloud Run
```bash
gcloud run deploy verbio-backend \
  --image gcr.io/neural-aquifer-467003-m0/verbio-backend \
  --region us-central1 \
  --project neural-aquifer-467003-m0
```

**Deployment Parameters:**
- Service name: `verbio-backend`
- Region: `us-central1`
- Project: `neural-aquifer-467003-m0`

## Common Issues and Solutions

### Issue 1: Architecture Mismatch
**Error**: "Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux"
**Solution**: Always use `docker buildx build --platform linux/amd64` instead of regular `docker build`

### Issue 2: TypeScript Compilation Errors
**Before deploying**, ensure the backend compiles locally:
```bash
cd backend
npm run dev
```
Fix any TypeScript errors before attempting deployment.

### Issue 3: Docker Push Timeout
If `docker push` times out separately, the combined build+push command above handles this better.

## Alternative Method (Build and Push Separately)
If the combined command fails, you can try:

```bash
# 1. Build for AMD64
docker buildx build --platform linux/amd64 -t gcr.io/neural-aquifer-467003-m0/verbio-backend .

# 2. Push to GCR
docker push gcr.io/neural-aquifer-467003-m0/verbio-backend

# 3. Deploy to Cloud Run
gcloud run deploy verbio-backend \
  --image gcr.io/neural-aquifer-467003-m0/verbio-backend \
  --region us-central1 \
  --project neural-aquifer-467003-m0
```

## Complete One-Line Command
For quick deployment after code changes:
```bash
cd backend && docker buildx build --platform linux/amd64 -t gcr.io/neural-aquifer-467003-m0/verbio-backend --push . && gcloud run deploy verbio-backend --image gcr.io/neural-aquifer-467003-m0/verbio-backend --region us-central1 --project neural-aquifer-467003-m0
```

## Verifying Deployment

1. Check deployment status:
```bash
gcloud run services describe verbio-backend --region us-central1 --project neural-aquifer-467003-m0
```

2. View logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verbio-backend" --limit 50 --project neural-aquifer-467003-m0
```

3. Test the endpoint:
```bash
curl https://verbio-backend-995705962018.us-central1.run.app/healthz
```

## Service URLs
- Production Backend: `https://verbio-backend-995705962018.us-central1.run.app`
- WebSocket Endpoint: `wss://verbio-backend-995705962018.us-central1.run.app/ws/realtime`

## Environment Variables
Environment variables are managed through Cloud Run service configuration and Google Secret Manager. Do not include `.env` files in the Docker image.

## Important Reminders
1. **ALWAYS use AMD64 architecture** (`--platform linux/amd64`)
2. **ALWAYS use docker buildx** for cross-platform builds
3. **ALWAYS test TypeScript compilation** before deploying
4. **NEVER use regular `docker build`** for Cloud Run deployments
5. **NEVER deploy from root directory** - always `cd backend` first

## Rollback Process
If deployment fails or causes issues:
```bash
# List recent revisions
gcloud run revisions list --service verbio-backend --region us-central1 --project neural-aquifer-467003-m0

# Route traffic to previous revision
gcloud run services update-traffic verbio-backend \
  --to-revisions=[PREVIOUS_REVISION_NAME]=100 \
  --region us-central1 \
  --project neural-aquifer-467003-m0
```

---
Last successful deployment: September 20, 2025