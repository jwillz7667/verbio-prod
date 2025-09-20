#!/bin/bash

# Setup script for Google Cloud Secret Manager
# This script creates all necessary secrets for the Verbio backend

set -e

echo "🔐 Setting up Google Cloud Secrets for Verbio Backend"
echo "======================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is configured
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No project set${NC}"
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${GREEN}Using project: $PROJECT_ID${NC}"
echo ""

# Function to create or update a secret
create_or_update_secret() {
    SECRET_NAME=$1
    SECRET_VALUE=$2
    DESCRIPTION=$3

    echo -n "Creating secret '${SECRET_NAME}'... "

    # Check if secret exists
    if gcloud secrets describe ${SECRET_NAME} --project=${PROJECT_ID} >/dev/null 2>&1; then
        # Secret exists, create new version
        echo -n "${SECRET_VALUE}" | gcloud secrets versions add ${SECRET_NAME} \
            --project=${PROJECT_ID} \
            --data-file=- >/dev/null 2>&1
        echo -e "${YELLOW}Updated${NC}"
    else
        # Create new secret
        echo -n "${SECRET_VALUE}" | gcloud secrets create ${SECRET_NAME} \
            --project=${PROJECT_ID} \
            --replication-policy="automatic" \
            --data-file=- \
            --labels="app=verbio,environment=production" >/dev/null 2>&1

        # Add description if provided
        if [ ! -z "$DESCRIPTION" ]; then
            gcloud secrets update ${SECRET_NAME} \
                --project=${PROJECT_ID} \
                --update-labels="description=${DESCRIPTION}" >/dev/null 2>&1
        fi
        echo -e "${GREEN}Created${NC}"
    fi
}

# Function to create secret from file
create_secret_from_file() {
    SECRET_NAME=$1
    FILE_PATH=$2
    DESCRIPTION=$3

    if [ ! -f "$FILE_PATH" ]; then
        echo -e "${RED}Error: File not found: $FILE_PATH${NC}"
        return 1
    fi

    echo -n "Creating secret '${SECRET_NAME}' from file... "

    if gcloud secrets describe ${SECRET_NAME} --project=${PROJECT_ID} >/dev/null 2>&1; then
        gcloud secrets versions add ${SECRET_NAME} \
            --project=${PROJECT_ID} \
            --data-file=${FILE_PATH} >/dev/null 2>&1
        echo -e "${YELLOW}Updated${NC}"
    else
        gcloud secrets create ${SECRET_NAME} \
            --project=${PROJECT_ID} \
            --replication-policy="automatic" \
            --data-file=${FILE_PATH} \
            --labels="app=verbio,environment=production" >/dev/null 2>&1
        echo -e "${GREEN}Created${NC}"
    fi
}

echo "📝 Please provide the following secret values:"
echo ""

# OpenAI API Key
echo -n "Enter OpenAI API Key (sk-...): "
read -s OPENAI_API_KEY
echo ""
create_or_update_secret "openai-api-key" "$OPENAI_API_KEY" "OpenAI API Key for Realtime API"

# Twilio Credentials
echo -n "Enter Twilio Account SID: "
read -s TWILIO_ACCOUNT_SID
echo ""
create_or_update_secret "twilio-account-sid" "$TWILIO_ACCOUNT_SID" "Twilio Account SID"

echo -n "Enter Twilio Auth Token: "
read -s TWILIO_AUTH_TOKEN
echo ""
create_or_update_secret "twilio-auth-token" "$TWILIO_AUTH_TOKEN" "Twilio Auth Token"

echo -n "Enter Twilio Phone Number (e.g., +1234567890): "
read TWILIO_PHONE_NUMBER
echo ""
create_or_update_secret "twilio-phone-number" "$TWILIO_PHONE_NUMBER" "Twilio Phone Number"

# Stripe Credentials
echo -n "Enter Stripe Secret Key (sk_...): "
read -s STRIPE_SECRET_KEY
echo ""
create_or_update_secret "stripe-secret-key" "$STRIPE_SECRET_KEY" "Stripe Secret Key"

echo -n "Enter Stripe Webhook Secret (whsec_...): "
read -s STRIPE_WEBHOOK_SECRET
echo ""
create_or_update_secret "stripe-webhook-secret" "$STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret"

# Supabase Credentials
echo -n "Enter Supabase URL: "
read SUPABASE_URL
echo ""
create_or_update_secret "supabase-url" "$SUPABASE_URL" "Supabase Project URL"

echo -n "Enter Supabase Anon Key: "
read -s SUPABASE_ANON_KEY
echo ""
create_or_update_secret "supabase-anon-key" "$SUPABASE_ANON_KEY" "Supabase Anonymous Key"

echo -n "Enter Supabase Service Key: "
read -s SUPABASE_SERVICE_KEY
echo ""
create_or_update_secret "supabase-service-key" "$SUPABASE_SERVICE_KEY" "Supabase Service Role Key"

# JWT Secret
echo -n "Enter JWT Secret (or press Enter to generate): "
read -s JWT_SECRET
echo ""
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated JWT Secret${NC}"
fi
create_or_update_secret "jwt-secret" "$JWT_SECRET" "JWT Signing Secret"

# Cookie Secret
echo -n "Enter Cookie Secret (or press Enter to generate): "
read -s COOKIE_SECRET
echo ""
if [ -z "$COOKIE_SECRET" ]; then
    COOKIE_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated Cookie Secret${NC}"
fi
create_or_update_secret "cookie-secret" "$COOKIE_SECRET" "Cookie Signing Secret"

# Sentry DSN (Optional)
echo -n "Enter Sentry DSN (optional, press Enter to skip): "
read -s SENTRY_DSN
echo ""
if [ ! -z "$SENTRY_DSN" ]; then
    create_or_update_secret "sentry-dsn" "$SENTRY_DSN" "Sentry Error Tracking DSN"
fi

echo ""
echo "🔑 Setting up service account permissions..."

# Create service account if it doesn't exist
SERVICE_ACCOUNT="verbio-backend@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT} --project=${PROJECT_ID} >/dev/null 2>&1; then
    echo "Creating service account..."
    gcloud iam service-accounts create verbio-backend \
        --display-name="Verbio Backend Service Account" \
        --project=${PROJECT_ID}
fi

# Grant necessary permissions
echo "Granting Secret Manager permissions..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1

# Grant Cloud SQL client permission if needed
echo "Granting Cloud SQL permissions..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client" >/dev/null 2>&1

echo ""
echo -e "${GREEN}✅ Secrets setup completed successfully!${NC}"
echo ""
echo "📋 Created/Updated Secrets:"
echo "  - openai-api-key"
echo "  - twilio-account-sid"
echo "  - twilio-auth-token"
echo "  - twilio-phone-number"
echo "  - stripe-secret-key"
echo "  - stripe-webhook-secret"
echo "  - supabase-url"
echo "  - supabase-anon-key"
echo "  - supabase-service-key"
echo "  - jwt-secret"
echo "  - cookie-secret"
[ ! -z "$SENTRY_DSN" ] && echo "  - sentry-dsn"

echo ""
echo "🚀 Next steps:"
echo "1. Deploy using: gcloud builds submit --config=cloudbuild-production.yaml"
echo "2. Or trigger from GitHub push to main branch"
echo ""