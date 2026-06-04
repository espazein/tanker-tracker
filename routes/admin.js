const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const exifr = require('exifr');
const db = require('../db');

const UPLOAD_DIR = path.join(__dirname, '../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => cb(null, `tanker_${Date.now()}${path.extname(file.originalname) || '.jpg'}`)
  }),
  limits:     { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files allowed'))
});

function requirePin(req, res, next) {
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return res.status(500).json({ error: 'ADMIN_PIN not configured' });
  const pin = req.headers['x-admin-pin'] || req.body?.pin;
  if (!pin) return res.status(401).json({ error: 'Authentication required' });
  if (pin !== adminPin) return res.status(403).json({ error: 'Invalid PIN' });
  next();
}

// --- Entries ---
router.get('/entries', requirePin, (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 20;
  const offset = (page - 1) * limit;

  const entries = db.prepare(`
    SELECT id, vendor_name, plate_number, plate_auto_detected, exif_timestamp,
           gps_lat, gps_lng, submitted_at, notes, photo_path, is_duplicate
    FROM entries ORDER BY submitted_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM entries').get().count;
  res.json({ entries, total, page, limit });
});

router.delete('/entries/:id', requirePin, (req, res) => {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  // Delete photo file (ignore if already missing)
  if (entry.photo_path) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, entry.photo_path)); }
    catch (e) { if (e.code !== 'ENOENT') console.error('photo delete failed:', e.message); }
  }
  db.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin-created entry. Bypasses device-token + geofence checks (admin is
// already PIN-authenticated). Photo can be from camera or gallery.
router.post('/entries', requirePin, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo is required' });

  const { vendor_name, plate_number, notes, capture_time } = req.body;
  if (!vendor_name?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Vendor name is required' });
  }

  // EXIF (best-effort) — may be missing on iOS gallery picks
  let exifTimestamp = null, gpsLat = null, gpsLng = null;
  try {
    const exif = await exifr.parse(req.file.path, {
      tiff: true, exif: true, gps: true,
      pick: ['DateTimeOriginal', 'latitude', 'longitude']
    });
    if (exif) {
      if (exif.DateTimeOriginal) exifTimestamp = new Date(exif.DateTimeOriginal).toISOString();
      if (exif.latitude)  gpsLat = exif.latitude;
      if (exif.longitude) gpsLng = exif.longitude;
    }
  } catch (e) { console.error('EXIF parse error (admin):', e.message); }

  // Admin's explicit capture-time always wins (datetime-local → ISO)
  if (capture_time) {
    const d = new Date(capture_time);
    if (!isNaN(d.getTime())) exifTimestamp = d.toISOString();
  }

  const result = db.prepare(`
    INSERT INTO entries
      (vendor_name, plate_number, plate_auto_detected, photo_path,
       exif_timestamp, gps_lat, gps_lng, submitted_at, notes)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
  `).run(
    vendor_name.trim(),
    plate_number?.trim().toUpperCase() || null,
    req.file.filename,
    exifTimestamp,
    gpsLat, gpsLng,
    Date.now(),
    notes?.trim() || null
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

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

// --- Vendors ---
router.get('/vendors', requirePin, (req, res) => {
  const vendors = db.prepare(
    'SELECT * FROM vendors ORDER BY is_active DESC, name COLLATE NOCASE ASC'
  ).all();
  res.json({ vendors });
});

router.post('/vendors', requirePin, (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Vendor name is required' });
  try {
    const result = db.prepare(
      'INSERT INTO vendors (name, created_at) VALUES (?, ?)'
    ).run(name, Date.now());
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, vendor });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Vendor already exists' });
    throw e;
  }
});

router.patch('/vendors/:id', requirePin, (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const newActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : vendor.is_active;
  const newName   = req.body.name !== undefined ? (req.body.name?.trim() || vendor.name) : vendor.name;

  try {
    db.prepare('UPDATE vendors SET is_active = ?, name = ? WHERE id = ?')
      .run(newActive, newName, req.params.id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A vendor with this name already exists' });
    throw e;
  }
});

router.delete('/vendors/:id', requirePin, (req, res) => {
  const r = db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Vendor not found' });
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
