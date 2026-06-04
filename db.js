const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'tanker.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_name TEXT NOT NULL,
    plate_number TEXT,
    plate_auto_detected INTEGER DEFAULT 0,
    photo_path TEXT NOT NULL,
    exif_timestamp TEXT,
    gps_lat REAL,
    gps_lng REAL,
    submitted_at INTEGER NOT NULL,
    is_duplicate INTEGER DEFAULT 0,
    duplicate_of INTEGER,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_submitted_at ON entries(submitted_at);
  CREATE INDEX IF NOT EXISTS idx_vendor ON entries(vendor_name);
  CREATE INDEX IF NOT EXISTS idx_plate ON entries(plate_number);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS devices (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT UNIQUE NOT NULL,
    label     TEXT,
    created_at INTEGER NOT NULL,
    is_active  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_active  INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );
`);

module.exports = db;
