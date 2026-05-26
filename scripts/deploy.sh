#!/bin/bash
# Pull latest code and reload the app with zero downtime.
# Run from any directory:  bash /opt/tanker-tracker/scripts/deploy.sh

set -euo pipefail

APP_DIR="/opt/tanker-tracker"

echo "==> Pulling latest code"
cd "$APP_DIR"
git pull origin main

echo "==> Installing / updating dependencies"
npm install --omit=dev

echo "==> Reloading app (zero-downtime)"
pm2 reload tanker-tracker --update-env

echo ""
echo "✅  Deployed successfully"
pm2 status tanker-tracker
