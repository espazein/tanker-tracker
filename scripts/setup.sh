#!/bin/bash
# One-time setup for a fresh Ubuntu 22.04 / 24.04 AWS Lightsail instance.
# Run as the default user (ubuntu) with sudo privileges.
#
#   bash setup.sh
#
# To enable HTTPS, set DOMAIN and SSL_EMAIL in .env when prompted — the script
# will then point Nginx at the domain and obtain a Let's Encrypt certificate.
# (Requires: an A record pointing the domain at this IP, and port 443 open in
#  the Lightsail firewall.)

set -euo pipefail

APP_DIR="/opt/tanker-tracker"
REPO="https://github.com/espazein/tanker-tracker.git"
NGINX_CONF="/etc/nginx/sites-available/tanker-tracker"

# Read a single key from a .env file (safe for values with spaces)
read_env() { grep -E "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '"' | xargs || true; }

echo "==> [1/8] Installing Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> [2/8] Installing PM2 & pm2-logrotate"
sudo npm install -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

echo "==> [3/8] Installing Nginx & Certbot"
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> [4/8] Cloning repository to $APP_DIR"
sudo git clone "$REPO" "$APP_DIR"
sudo chown -R ubuntu:ubuntu "$APP_DIR"
cd "$APP_DIR"

echo "==> [5/8] Installing Node dependencies"
npm install --omit=dev
mkdir -p uploads

echo "     Creating .env — EDIT THIS BEFORE CONTINUING"
cp .env.example .env
sed -i 's/PORT=.*/PORT=3000/' .env
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  ⚠️  Edit /opt/tanker-tracker/.env now:                             │"
echo "│       ADMIN_PIN=your_secure_pin                                     │"
echo "│       SOCIETY_NAME=Your Society Name                                │"
echo "│       DOMAIN=society.example.com   (blank = HTTP only, no geo)      │"
echo "│       SSL_EMAIL=you@example.com                                     │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
read -rp "Press Enter once you have saved .env to continue..."

DOMAIN="$(read_env DOMAIN .env)"
SSL_EMAIL="$(read_env SSL_EMAIL .env)"

echo "==> [6/8] Configuring Nginx"
sudo cp nginx.conf "$NGINX_CONF"
if [[ -n "$DOMAIN" ]]; then
  sudo sed -i "s/server_name .*/server_name $DOMAIN;/" "$NGINX_CONF"
fi
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tanker-tracker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> [7/8] Starting app with PM2"
pm2 start ecosystem.config.js --env production
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash
pm2 save

echo "==> [8/8] HTTPS"
if [[ -n "$DOMAIN" && -n "$SSL_EMAIL" ]]; then
  RESOLVED="$(dig +short "$DOMAIN" | tail -1)"
  THIS_IP="$(curl -s ifconfig.me)"
  if [[ "$RESOLVED" != "$THIS_IP" ]]; then
    echo "⚠️  $DOMAIN resolves to '${RESOLVED:-nothing}', not this server ($THIS_IP)."
    echo "    Skipping certificate. After fixing DNS, run: bash scripts/deploy.sh"
  else
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect
    echo "✅  HTTPS enabled (auto-renews via certbot timer)."
  fi
else
  echo "    DOMAIN/SSL_EMAIL not set — running HTTP only. Geolocation will not work."
fi

URL="${DOMAIN:-$(curl -s ifconfig.me)}"
SCHEME=$([[ -n "$DOMAIN" ]] && echo https || echo http)
echo ""
echo "✅  Setup complete!"
echo "    Guard portal:  $SCHEME://$URL/guard"
echo "    Admin panel:   $SCHEME://$URL/admin"
echo "    Dashboard:     $SCHEME://$URL/"
echo ""
echo "    pm2 status | pm2 logs tanker-tracker | bash scripts/deploy.sh"
