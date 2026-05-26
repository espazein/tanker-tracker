#!/bin/bash
# Pull latest code, reload the app, and ensure HTTPS is in place.
# Run from the app directory:  bash scripts/deploy.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_CONF="/etc/nginx/sites-available/tanker-tracker"
cd "$APP_DIR"

read_env() { grep -E "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '"' | xargs || true; }

echo "==> Pulling latest code"
git pull origin main

echo "==> Installing / updating dependencies"
npm install --omit=dev

echo "==> Reloading app (zero-downtime)"
pm2 reload tanker-tracker --update-env

# Ensure HTTPS if a domain is configured but no certificate exists yet.
DOMAIN="$(read_env DOMAIN .env)"
SSL_EMAIL="$(read_env SSL_EMAIL .env)"
if [[ -n "$DOMAIN" && -n "$SSL_EMAIL" ]]; then
  if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    echo "==> No certificate for $DOMAIN yet — attempting to obtain one"
    RESOLVED="$(dig +short "$DOMAIN" | tail -1)"
    THIS_IP="$(curl -4 -s ifconfig.me)"
    if [[ "$RESOLVED" == "$THIS_IP" ]]; then
      if ! command -v certbot >/dev/null 2>&1; then
        echo "==> Installing Certbot"
        sudo apt-get update -y
        sudo apt-get install -y certbot python3-certbot-nginx
      fi
      sudo sed -i "s/server_name .*/server_name $DOMAIN;/" "$NGINX_CONF"
      sudo nginx -t && sudo systemctl reload nginx
      sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect
      echo "✅  HTTPS enabled."
    else
      echo "⚠️  $DOMAIN resolves to '${RESOLVED:-nothing}', not $THIS_IP — skipping cert."
    fi
  fi
fi

echo ""
echo "✅  Deployed successfully"
pm2 status tanker-tracker
