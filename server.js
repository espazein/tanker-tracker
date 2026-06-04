require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // required when running behind nginx
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many submissions. Please wait before trying again.' }
});

// Admin: throttle PIN brute-force. Only failed (>=400) requests count toward
// the limit, so an authenticated admin doing many ops is not impacted.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many failed attempts. Try again in 15 minutes.' }
});

// Dashboard: 60 req/min per IP (well above legitimate dashboard refresh rate)
const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Please slow down.' }
});

// Device check: 30 req/min per IP
const deviceCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' }
});

// Active vendor list — used to populate dropdowns in guard & admin forms.
app.get('/api/vendors', dashboardLimiter, (req, res) => {
  const vendors = db.prepare(
    'SELECT id, name FROM vendors WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC'
  ).all();
  res.json({ vendors });
});

// Lightweight device validation for the guard page
app.get('/api/device/check', deviceCheckLimiter, (req, res) => {
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) return res.json({ valid: false });
  const device = db.prepare('SELECT 1 FROM devices WHERE device_id = ? AND is_active = 1').get(deviceId);
  res.json({ valid: !!device });
});

app.use('/api/submit',    submitLimiter,    require('./routes/submit'));
app.use('/api/dashboard', dashboardLimiter, require('./routes/dashboard'));
app.use('/api/admin',     adminLimiter,     require('./routes/admin'));

app.get('/guard', (req, res) => res.sendFile(path.join(__dirname, 'public/guard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));

app.listen(PORT, () => {
  console.log(`Tanker Tracker running at http://localhost:${PORT}`);
  console.log(`  Guard interface:  http://localhost:${PORT}/guard`);
  console.log(`  Admin panel:      http://localhost:${PORT}/admin`);
  console.log(`  Public dashboard: http://localhost:${PORT}/`);
  if (!process.env.ADMIN_PIN) {
    console.warn('  [WARN] ADMIN_PIN not set — admin panel is disabled');
  }
});
