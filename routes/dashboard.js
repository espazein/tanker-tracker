const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/stats', (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekTs = weekStart.getTime();

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);
  const monthTs = monthStart.getTime();

  const todayTotal = db.prepare(`SELECT COUNT(*) as count FROM entries WHERE submitted_at >= ? AND is_duplicate = 0`).get(todayTs);
  const weekTotal  = db.prepare(`SELECT COUNT(*) as count FROM entries WHERE submitted_at >= ? AND is_duplicate = 0`).get(weekTs);
  const monthTotal = db.prepare(`SELECT COUNT(*) as count FROM entries WHERE submitted_at >= ? AND is_duplicate = 0`).get(monthTs);
  const allTime    = db.prepare(`SELECT COUNT(*) as count FROM entries WHERE is_duplicate = 0`).get();

  const byVendorToday = db.prepare(`
    SELECT vendor_name, COUNT(*) as count
    FROM entries WHERE submitted_at >= ? AND is_duplicate = 0
    GROUP BY vendor_name ORDER BY count DESC
  `).all(todayTs);

  const last30 = db.prepare(`
    SELECT id, vendor_name, plate_number, plate_auto_detected, exif_timestamp,
           gps_lat, gps_lng, submitted_at, notes, photo_path
    FROM entries WHERE is_duplicate = 0
    ORDER BY submitted_at DESC LIMIT 30
  `).all();

  const dailyTrend = db.prepare(`
    SELECT
      date(submitted_at/1000, 'unixepoch', 'localtime') as day,
      COUNT(*) as count
    FROM entries
    WHERE submitted_at >= ? AND is_duplicate = 0
    GROUP BY day ORDER BY day ASC
  `).all(weekTs);

  res.json({
    today_total: todayTotal.count,
    week_total: weekTotal.count,
    month_total: monthTotal.count,
    all_time_total: allTime.count,
    by_vendor_today: byVendorToday,
    recent_entries: last30,
    daily_trend: dailyTrend
  });
});

// Filtered view: count + vendor breakdown + deliveries for a date range.
// from/to are epoch ms; the range is [from, to).
router.get('/range', (req, res) => {
  const from = parseInt(req.query.from);
  const to   = parseInt(req.query.to);
  if (isNaN(from) || isNaN(to) || to <= from) {
    return res.status(400).json({ error: 'from and to (epoch ms, to > from) are required' });
  }

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM entries WHERE submitted_at >= ? AND submitted_at < ? AND is_duplicate = 0'
  ).get(from, to).count;

  const byVendor = db.prepare(`
    SELECT vendor_name, COUNT(*) as count
    FROM entries WHERE submitted_at >= ? AND submitted_at < ? AND is_duplicate = 0
    GROUP BY vendor_name ORDER BY count DESC
  `).all(from, to);

  // Paginate the deliveries list (total + vendor breakdown cover the whole range).
  const limit  = 10;
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * limit;
  const entries = db.prepare(`
    SELECT id, vendor_name, plate_number, plate_auto_detected, exif_timestamp,
           gps_lat, gps_lng, submitted_at, notes, photo_path
    FROM entries WHERE submitted_at >= ? AND submitted_at < ? AND is_duplicate = 0
    ORDER BY submitted_at DESC LIMIT ? OFFSET ?
  `).all(from, to, limit, offset);

  res.json({ total, by_vendor: byVendor, entries, page, limit, from, to });
});

router.get('/entries', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const entries = db.prepare(`
    SELECT id, vendor_name, plate_number, plate_auto_detected, exif_timestamp,
           gps_lat, gps_lng, submitted_at, notes, photo_path, is_duplicate
    FROM entries ORDER BY submitted_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM entries`).get();

  res.json({ entries, total: total.count, page, limit });
});

module.exports = router;
