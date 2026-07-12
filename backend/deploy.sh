#!/usr/bin/env bash
# Deploys the SkillPilot FastAPI backend to Cloud Run.
#
# NOT run automatically by anything — this is a documented reference script.
# Review the env vars and project id below, then run it yourself when ready:
#   ./deploy.sh
#
# These flags are also mirrored in the Cloud Build trigger (03833d33-...).
# If you change memory/timeout here, update the trigger too, or run this
# script manually instead of relying on CD.
#
# Secrets (GROQ_API_KEY, CURRENTS_API_KEY, JSEARCH_API_KEY, PREWARM_SECRET)
# are intentionally NOT hardcoded here. Prefer Secret Manager (--set-secrets)
# over --set-env-vars for these in a real deploy — see the README for both
# forms. GNEWS_API_KEY was retired here (code/config only, see cleanup pass
# post-Stage-4) now that the Currents API news migration has been live and
# confirmed working since well before Stage 1 of the AI Interview Panel
# shipped — the Secret Manager secret itself is left alone, not deleted.

set -euo pipefail

PROJECT_ID="myproject-a48d7"
REGION="asia-south1"
SERVICE_NAME="skillpilot-api"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=120s \
  --set-env-vars="FIREBASE_PROJECT_ID=${PROJECT_ID},DEBUG=false" \
  --set-secrets="GROQ_API_KEY=GROQ_API_KEY:latest,CURRENTS_API_KEY=CURRENTS_API_KEY:latest,JSEARCH_API_KEY=JSEARCH_API_KEY:latest,PREWARM_SECRET=PREWARM_SECRET:latest"

echo "Deployed. Fetch the service URL with:"
echo "  gcloud run services describe ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID} --format='value(status.url)'"
