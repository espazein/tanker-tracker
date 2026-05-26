#!/bin/bash
# One-time setup for a fresh Ubuntu 22.04 / 24.04 AWS Lightsail instance.
# Run as the default user (ubuntu) with sudo privileges.
#
#   bash setup.sh

set -euo pipefail

APP_DIR="/opt/tanker-tracker"
REPO="https://github.com/espazein/tanker-tracker.git"

echo "==> [1/7] Installing Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> [2/7] Installing PM2 & pm2-logrotate"
sudo npm install -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

echo "==> [3/7] Installing Nginx"
sudo apt-get install -y nginx

echo "==> [4/7] Cloning repository to $APP_DIR"
sudo git clone "$REPO" "$APP_DIR"
sudo chown -R ubuntu:ubuntu "$APP_DIR"
cd "$APP_DIR"

echo "==> [5/7] Installing Node dependencies"
npm install --omit=dev

echo "     Creating uploads directory"
mkdir -p uploads

echo "     Creating .env — EDIT THIS BEFORE STARTING"
cp .env.example .env
sed -i 's/PORT=.*/PORT=3000/' .env
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  ⚠️  Edit /opt/tanker-tracker/.env before continuing:               │"
echo "│     ADMIN_PIN=your_secure_pin                                       │"
echo "│     SOCIETY_NAME=Your Society Name                                  │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
read -rp "Press Enter once you have saved .env to continue..."

echo "==> [6/7] Configuring Nginx"
sudo cp nginx.conf /etc/nginx/sites-available/tanker-tracker
sudo ln -sf /etc/nginx/sites-available/tanker-tracker /etc/nginx/sites-enabled/tanker-tracker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> [7/7] Starting app with PM2"
pm2 start ecosystem.config.js --env production
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash
pm2 save

echo ""
echo "✅  Setup complete!"
echo "    App running at:  http://$(curl -s ifconfig.me)"
echo ""
echo "    Guard portal:  http://$(curl -s ifconfig.me)/guard"
echo "    Admin panel:   http://$(curl -s ifconfig.me)/admin"
echo "    Dashboard:     http://$(curl -s ifconfig.me)/"
echo ""
echo "    Useful commands:"
echo "      pm2 status                  — process status"
echo "      pm2 logs tanker-tracker     — live logs"
echo "      pm2 restart tanker-tracker  — restart app"
echo "      bash /opt/tanker-tracker/scripts/deploy.sh  — pull latest & reload"
