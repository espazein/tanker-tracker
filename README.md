# 🚛 Tanker Tracker

A lightweight web app for residential societies to log and monitor water tanker deliveries. Security guards photograph each tanker as it enters; managers and residents view a live dashboard.

---

## Features

- **Guard portal** — camera-only photo capture, vendor + plate entry, duplicate suppression
- **Device auth** — only admin-registered phones can submit entries
- **Geofencing** — submissions blocked if the guard is outside a configurable radius of the gate
- **Live dashboard** — today / week / month / all-time stats, vendor breakdown, 7-day trend chart, photo lightbox
- **Admin panel** — manage devices, configure geofence, wipe data
- **Rate limiting** — 20 submissions per 15 minutes per device
- **Duplicate guard** — same vendor or plate blocked for 45 minutes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | SQLite (better-sqlite3) |
| File uploads | Multer |
| EXIF parsing | exifr |
| Process manager | PM2 |
| Reverse proxy | Nginx |
| Frontend | Vanilla JS — no framework |

---

## Project Structure

```
tanker-tracker/
├── server.js               # Express entry point
├── db.js                   # SQLite schema + connection
├── ecosystem.config.js     # PM2 config
├── nginx.conf              # Nginx reverse proxy config
├── routes/
│   ├── submit.js           # POST /api/submit — photo upload, device auth, geofence
│   ├── dashboard.js        # GET  /api/dashboard/stats & /entries
│   └── admin.js            # Device management, settings, data wipe
├── public/
│   ├── guard.html          # Guard portal
│   ├── dashboard.html      # Public dashboard
│   ├── admin.html          # Admin panel
│   ├── js/
│   │   ├── guard.js
│   │   ├── dashboard.js
│   │   └── admin.js
│   └── css/
│       ├── style.css
│       ├── guard.css
│       ├── dashboard.css
│       └── admin.css
├── scripts/
│   ├── setup.sh            # One-time server setup (Node, PM2, Nginx, HTTPS)
│   └── deploy.sh           # Pull latest + reload + ensure HTTPS
└── uploads/                # Stored tanker photos (gitignored)
```

---

## Local Development

**Prerequisites:** Node.js 18+

```bash
# Clone
git clone https://github.com/espazein/tanker-tracker.git
cd tanker-tracker

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — set ADMIN_PIN and SOCIETY_NAME

# Start (with auto-reload)
npm run dev

# Or start normally
npm start
```

Open:
- Dashboard → http://localhost:3000
- Guard portal → http://localhost:3000/guard
- Admin panel → http://localhost:3000/admin

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: `3000`) |
| `ADMIN_PIN` | Yes | PIN to access the admin panel |
| `SOCIETY_NAME` | No | Displayed on the dashboard header |

---

## API Reference

### Submit entry
```
POST /api/submit
Headers: X-Device-Id: <device-token>
Body (multipart/form-data):
  photo          — image file (required, max 15 MB)
  vendor_name    — string (required)
  plate_number   — string (required)
  notes          — string (optional)
  submitted_lat  — float (required when geofence is active)
  submitted_lng  — float (required when geofence is active)
```

### Dashboard stats
```
GET /api/dashboard/stats
GET /api/dashboard/entries?page=1
```

### Admin (all require X-Admin-Pin header)
```
GET    /api/admin/devices
POST   /api/admin/devices          { label, device_id? }
PATCH  /api/admin/devices/:id      { is_active, label? }
DELETE /api/admin/devices/:id

GET    /api/admin/settings
POST   /api/admin/settings         { geofence_lat, geofence_lng, geofence_radius_m }
DELETE /api/admin/settings/geofence

POST   /api/admin/truncate
```

---

## Deploying to AWS Lightsail

### 1. Create the instance
- Blueprint: **Ubuntu 22.04 LTS**
- Plan: **$5/month** (1 GB RAM)
- Attach a **static IP** and open **ports 80 and 443** in the Lightsail firewall

### 2. Point your domain (required for geolocation)
The browser Geolocation API only works over HTTPS, so geofencing needs a domain.
Add a DNS **A record** pointing your domain (e.g. `society.example.com`) at the
Lightsail static IP, and confirm it resolves: `dig +short society.example.com`.

> Skipping the domain runs the app on plain HTTP — everything works except
> geolocation/geofencing.

### 3. SSH in and run the setup script
```bash
curl -fsSL https://raw.githubusercontent.com/espazein/tanker-tracker/main/scripts/setup.sh -o setup.sh
bash setup.sh
```
The script installs Node.js 20, PM2, Nginx, and Certbot, clones the repo, and
starts the app. It pauses once for you to fill in `.env` — set `ADMIN_PIN`,
`SOCIETY_NAME`, and (for HTTPS) `DOMAIN` + `SSL_EMAIL`. If a valid domain is set,
it automatically obtains a Let's Encrypt certificate and forces HTTPS.

### 4. Deploy future updates
```bash
bash /opt/tanker-tracker/scripts/deploy.sh
```
Pulls the latest code, reloads the app with zero downtime, and — if `DOMAIN` is
set but no certificate exists yet — obtains one (e.g. after DNS finishes
propagating). Let's Encrypt renewal is automatic thereafter.

---

## Guard Workflow

1. Admin goes to `/admin`, creates a **device token** (labelled per guard/phone)
2. Admin shares the token with the guard
3. Guard opens `/guard` on their phone — enters the token once to activate
4. For each tanker: tap **Take Photo** → fill vendor + plate → **Submit Entry**
5. Submission is rejected if the device is not registered, or if the guard is outside the geofenced radius

> **Note:** Location is read from the browser (`navigator.geolocation`). iOS Safari strips GPS from uploaded photos, so browser location is used for geofencing. EXIF GPS is still stored as an audit field when available (Android).

---

## Roadmap

- [ ] Phase 2 — Plate number OCR via Plate Recognizer API
- [ ] HTTPS via Let's Encrypt (Certbot)
- [ ] S3 storage for uploaded photos
- [ ] CSV / Excel export of delivery records
