#!/bin/bash

echo "🚀 Verbio Deployment Script"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is authenticated
echo -e "${YELLOW}Checking gcloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}Error: Not authenticated with gcloud${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

# Get the project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No project set${NC}"
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${GREEN}✓ Authenticated with project: $PROJECT_ID${NC}"

# Deploy backend to Cloud Run
echo ""
echo -e "${YELLOW}Deploying backend to Cloud Run...${NC}"
echo "This will:"
echo "  1. Build Docker image"
echo "  2. Push to Google Container Registry"
echo "  3. Deploy to Cloud Run"
echo ""

read -p "Continue with backend deployment? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gcloud builds submit --config cloudbuild.yaml
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Backend deployed successfully!${NC}"
        echo ""
        echo "Backend URL: https://verbio-backend-YOUR_SERVICE_ID-uc.a.run.app"
    else
        echo -e "${RED}✗ Backend deployment failed${NC}"
        exit 1
    fi
fi

# Deploy frontend to Vercel
echo ""
echo -e "${YELLOW}Deploying frontend to Vercel...${NC}"
read -p "Deploy frontend to production? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd frontend
    vercel --prod
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend deployed successfully!${NC}"
    else
        echo -e "${RED}✗ Frontend deployment failed${NC}"
        exit 1
    fi
    cd ..
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Verify backend is running: gcloud run services describe verbio-backend --region us-central1"
echo "2. Check Cloud Build logs: gcloud builds list --limit=1"
echo "3. Update frontend environment variables if backend URL changed"
echo "4. Test the Voice Agents Playground at /dashboard/voice-playground"