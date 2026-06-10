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

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role        TEXT NOT NULL,
    actor       TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

  -- General Body members: per-person login managed by the admin.
  CREATE TABLE IF NOT EXISTS members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash    TEXT NOT NULL,
    must_change INTEGER DEFAULT 1,
    is_active   INTEGER DEFAULT 1,
    created_at  INTEGER NOT NULL,
    last_login  INTEGER
  );

  CREATE TABLE IF NOT EXISTS member_sessions (
    token      TEXT PRIMARY KEY,
    member_id  INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_member ON member_sessions(member_id);
`);

module.exports = db;
