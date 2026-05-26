const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const db = require('../db');

const DUPLICATE_WINDOW_MS = 45 * 60 * 1000;

const UPLOAD_DIR = path.join(__dirname, '../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // ensure it exists on startup

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `tanker_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function checkDuplicate(vendorName, plateNumber, now) {
  const windowStart = now - DUPLICATE_WINDOW_MS;

  if (plateNumber) {
    const byPlate = db.prepare(`
      SELECT * FROM entries
      WHERE plate_number = ? AND submitted_at > ? AND is_duplicate = 0
      ORDER BY submitted_at DESC LIMIT 1
    `).get(plateNumber, windowStart);
    if (byPlate) return byPlate;
  }

  const byVendor = db.prepare(`
    SELECT * FROM entries
    WHERE vendor_name = ? AND submitted_at > ? AND is_duplicate = 0
    ORDER BY submitted_at DESC LIMIT 1
  `).get(vendorName, windowStart);
  return byVendor || null;
}

router.post('/', upload.single('photo'), async (req, res) => {
  // Device auth
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: 'device_unregistered', message: 'No device token. Activate this device first.' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE device_id = ? AND is_active = 1').get(deviceId);
  if (!device) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'device_unauthorized', message: 'Device not authorised. Contact your administrator.' });
  }

  if (!req.file) return res.status(400).json({ error: 'Photo is required' });

  const { vendor_name, plate_number, notes, submitted_lat, submitted_lng } = req.body;
  if (!vendor_name?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Vendor name is required' });
  }

  // Geofence check via browser geolocation (iOS Safari strips EXIF GPS from uploads)
  const fenceLat    = parseFloat(getSetting('geofence_lat'));
  const fenceLng    = parseFloat(getSetting('geofence_lng'));
  const fenceRadius = parseFloat(getSetting('geofence_radius_m'));

  if (!isNaN(fenceLat) && !isNaN(fenceLng) && !isNaN(fenceRadius)) {
    const subLat = parseFloat(submitted_lat);
    const subLng = parseFloat(submitted_lng);
    if (isNaN(subLat) || isNaN(subLng)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'location_required',
        message: 'Location access is required to submit entries. Allow location in your browser and try again.'
      });
    }
    const dist = haversineM(fenceLat, fenceLng, subLat, subLng);
    if (dist > fenceRadius) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        error: 'outside_geofence',
        message: `You must be within ${Math.round(fenceRadius)}m of the gate. You are currently ${Math.round(dist)}m away.`
      });
    }
  }

  const now = Date.now();

  // Extract EXIF — stored as audit data when available (Android embeds GPS; iOS strips it)
  let exifTimestamp = null;
  let gpsLat = null;
  let gpsLng = null;

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
  } catch (e) {
    console.error('EXIF parse error:', e.message);
  }

  const finalPlate = plate_number?.trim().toUpperCase() || null;

  const duplicate = checkDuplicate(vendor_name.trim(), finalPlate, now);
  if (duplicate) {
    const minutesAgo = Math.round((now - duplicate.submitted_at) / 60000);
    fs.unlinkSync(req.file.path);
    return res.status(409).json({
      error: 'duplicate',
      message: `A tanker from ${duplicate.vendor_name} was already logged ${minutesAgo} minute(s) ago. Submissions are blocked for 45 minutes.`,
      duplicate_entry: {
        id: duplicate.id,
        vendor_name: duplicate.vendor_name,
        plate_number: duplicate.plate_number,
        submitted_at: duplicate.submitted_at,
        minutes_ago: minutesAgo
      }
    });
  }

  const result = db.prepare(`
    INSERT INTO entries
      (vendor_name, plate_number, plate_auto_detected, photo_path, exif_timestamp, gps_lat, gps_lng, submitted_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vendor_name.trim(),
    finalPlate,
    0,
    req.file.filename,
    exifTimestamp,
    gpsLat,
    gpsLng,
    now,
    notes?.trim() || null
  );

  return res.json({
    success: true,
    id: result.lastInsertRowid,
    plate_number: finalPlate,
    exif_timestamp: exifTimestamp,
    gps: gpsLat ? { lat: gpsLat, lng: gpsLng } : null,
    message: 'Tanker entry logged successfully'
  });
});

module.exports = router;
