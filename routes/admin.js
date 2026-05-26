const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

function requirePin(req, res, next) {
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return res.status(500).json({ error: 'ADMIN_PIN not configured' });
  const pin = req.headers['x-admin-pin'] || req.body?.pin;
  if (!pin) return res.status(401).json({ error: 'Authentication required' });
  if (pin !== adminPin) return res.status(403).json({ error: 'Invalid PIN' });
  next();
}

// --- Entries ---
router.post('/truncate', requirePin, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM entries').get().count;
  db.exec('DELETE FROM entries');
  res.json({ success: true, message: `Deleted ${count} entries` });
});

// --- Devices ---
router.get('/devices', requirePin, (req, res) => {
  const devices = db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
  res.json({ devices });
});

router.post('/devices', requirePin, (req, res) => {
  const { label, device_id } = req.body;
  const id = device_id?.trim() || crypto.randomUUID();
  try {
    const result = db.prepare(
      'INSERT INTO devices (device_id, label, created_at) VALUES (?, ?, ?)'
    ).run(id, label?.trim() || null, Date.now());
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, device });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Device ID already registered' });
    throw e;
  }
});

router.patch('/devices/:id', requirePin, (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const newActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : device.is_active;
  const newLabel  = req.body.label !== undefined ? (req.body.label?.trim() || null) : device.label;

  db.prepare('UPDATE devices SET is_active = ?, label = ? WHERE id = ?').run(newActive, newLabel, req.params.id);
  res.json({ success: true });
});

router.delete('/devices/:id', requirePin, (req, res) => {
  const r = db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Device not found' });
  res.json({ success: true });
});

// --- Settings ---
router.get('/settings', requirePin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

router.post('/settings', requirePin, (req, res) => {
  const allowed = ['geofence_lat', 'geofence_lng', 'geofence_radius_m'];
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) upsert.run(key, String(value));
  }
  res.json({ success: true });
});

router.delete('/settings/geofence', requirePin, (req, res) => {
  db.exec("DELETE FROM settings WHERE key IN ('geofence_lat','geofence_lng','geofence_radius_m')");
  res.json({ success: true });
});

module.exports = router;
