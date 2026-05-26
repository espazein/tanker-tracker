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

// Lightweight device validation for the guard page (not rate-limited)
app.get('/api/device/check', (req, res) => {
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) return res.json({ valid: false });
  const device = db.prepare('SELECT 1 FROM devices WHERE device_id = ? AND is_active = 1').get(deviceId);
  res.json({ valid: !!device });
});

app.use('/api/submit', submitLimiter, require('./routes/submit'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));

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
