#!/bin/bash
# Enable HTTPS via Let's Encrypt for tanker-tracker.
#
# PREREQUISITES (do these first):
#   1. Buy a domain (e.g. tanker.yoursociety.com)
#   2. In your DNS provider, add an A record pointing the domain
#      at this instance's Lightsail STATIC IP
#   3. Wait for DNS to propagate (check: dig +short YOUR_DOMAIN)
#   4. Open port 443 (HTTPS) in the Lightsail Networking firewall
#
# USAGE:
#   bash enable-https.sh tanker.yoursociety.com you@email.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
NGINX_CONF="/etc/nginx/sites-available/tanker-tracker"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: bash enable-https.sh <domain> <email>"
  echo "   e.g: bash enable-https.sh tanker.yoursociety.com admin@yoursociety.com"
  exit 1
fi

echo "==> Verifying DNS for $DOMAIN"
RESOLVED=$(dig +short "$DOMAIN" | tail -1)
THIS_IP=$(curl -s ifconfig.me)
if [[ "$RESOLVED" != "$THIS_IP" ]]; then
  echo "⚠️  $DOMAIN resolves to '${RESOLVED:-nothing}' but this server is $THIS_IP"
  echo "    Fix the A record and wait for DNS to propagate before continuing."
  read -rp "    Continue anyway? [y/N] " yn
  [[ "$yn" == "y" || "$yn" == "Y" ]] || exit 1
fi

echo "==> Setting server_name in Nginx config"
sudo sed -i "s/server_name .*/server_name $DOMAIN;/" "$NGINX_CONF"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Installing Certbot"
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

echo "==> Requesting certificate and enabling HTTPS redirect"
sudo certbot --nginx -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --redirect

echo ""
echo "✅  HTTPS enabled. Auto-renewal is handled by the certbot systemd timer."
echo "    Test renewal with:  sudo certbot renew --dry-run"
echo ""
echo "    Your app is now live at:"
echo "      Guard portal:  https://$DOMAIN/guard"
echo "      Admin panel:   https://$DOMAIN/admin"
echo "      Dashboard:     https://$DOMAIN/"
