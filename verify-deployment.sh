#!/bin/bash

echo "🔍 Verifying Verbio Deployment"
echo "=============================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check latest Cloud Build
echo -e "${YELLOW}Checking latest Cloud Build...${NC}"
BUILD_STATUS=$(gcloud builds list --limit=1 --format="value(status)" 2>/dev/null)

if [ -z "$BUILD_STATUS" ]; then
    echo -e "${RED}Could not retrieve build status. Please check gcloud authentication.${NC}"
else
    echo "Latest build status: $BUILD_STATUS"

    if [ "$BUILD_STATUS" == "SUCCESS" ]; then
        echo -e "${GREEN}✓ Last build was successful${NC}"
    elif [ "$BUILD_STATUS" == "WORKING" ] || [ "$BUILD_STATUS" == "QUEUED" ]; then
        echo -e "${YELLOW}⏳ Build is currently in progress${NC}"
        echo "Run this command to watch the build: gcloud builds log --stream \$(gcloud builds list --limit=1 --format='value(id)')"
    else
        echo -e "${RED}✗ Last build status: $BUILD_STATUS${NC}"
        echo "Check logs with: gcloud builds log \$(gcloud builds list --limit=1 --format='value(id)')"
    fi
fi

# Check Cloud Run service
echo ""
echo -e "${YELLOW}Checking Cloud Run service...${NC}"
SERVICE_URL=$(gcloud run services describe verbio-backend --region us-central1 --format="value(status.url)" 2>/dev/null)

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}Cloud Run service not found or not accessible${NC}"
else
    echo -e "${GREEN}✓ Cloud Run service is deployed${NC}"
    echo "Service URL: $SERVICE_URL"

    # Test the health endpoint
    echo ""
    echo -e "${YELLOW}Testing health endpoint...${NC}"
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/healthz")

    if [ "$HEALTH_STATUS" == "200" ]; then
        echo -e "${GREEN}✓ Backend is healthy and responding${NC}"
    else
        echo -e "${RED}✗ Backend health check failed (HTTP $HEALTH_STATUS)${NC}"
    fi
fi

# Check frontend on Vercel
echo ""
echo -e "${YELLOW}Checking Vercel deployment...${NC}"
echo "Latest deployment: https://frontend-mtihyoeoy-jwillz7667s-projects.vercel.app"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://frontend-mtihyoeoy-jwillz7667s-projects.vercel.app")

if [ "$FRONTEND_STATUS" == "200" ]; then
    echo -e "${GREEN}✓ Frontend is live and responding${NC}"
else
    echo -e "${YELLOW}⚠ Frontend returned HTTP $FRONTEND_STATUS${NC}"
fi

echo ""
echo "📋 Summary:"
echo "----------"
echo "• GitHub Repo: https://github.com/jwillz7667/verbio-prod"
echo "• Backend: $SERVICE_URL"
echo "• Frontend: https://frontend-mtihyoeoy-jwillz7667s-projects.vercel.app"
echo "• Voice Playground: https://frontend-mtihyoeoy-jwillz7667s-projects.vercel.app/dashboard/voice-playground"
echo ""
echo "To trigger a new deployment:"
echo "1. Push to GitHub: git push origin main"
echo "2. Or manually: gcloud builds submit --config cloudbuild.yaml"