#!/bin/bash
# Pull latest code, reload the app, and ensure HTTPS is in place.
# Run from the app directory:  bash scripts/deploy.sh
#
# Do NOT run with sudo — PM2 is per-user, so sudo points PM2 at /root/.pm2
# instead of the ubuntu user's pm2 home where tanker-tracker is registered.
# The script uses sudo internally where needed (nginx, certbot, apt).

set -euo pipefail

if [[ "$EUID" -eq 0 ]]; then
  echo "❌  Don't run deploy.sh with sudo. Run as the ubuntu user:"
  echo "       bash scripts/deploy.sh"
  exit 1
fi

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

# Ensure Nginx rate-limit zones and per-location directives are in place.
# Safe to run repeatedly; only touches Nginx if something is actually missing.
NGINX_RELOAD=0
LIMITS_DST=/etc/nginx/conf.d/tanker-limits.conf
if [[ -f nginx-limits.conf ]]; then
  if ! sudo cmp -s nginx-limits.conf "$LIMITS_DST" 2>/dev/null; then
    echo "==> Installing rate-limit zones"
    sudo cp nginx-limits.conf "$LIMITS_DST"
    NGINX_RELOAD=1
  fi
fi
if [[ -f "$NGINX_CONF" ]] && ! sudo grep -q "tt_req" "$NGINX_CONF"; then
  echo "==> Injecting rate-limit directives into Nginx site config"
  sudo sed -i '/location \/ {/a \        limit_req  zone=tt_req burst=60 nodelay;\n        limit_conn tt_conn 20;' "$NGINX_CONF"
  NGINX_RELOAD=1
fi
if [[ "$NGINX_RELOAD" == 1 ]]; then
  sudo nginx -t && sudo systemctl reload nginx
fi

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
