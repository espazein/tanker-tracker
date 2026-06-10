// Shared auth helpers for per-member login: scrypt PIN hashing and
// token-based sessions (so the slow hash is verified once at login, not on
// every request). Used by routes/member.js and routes/admin.js.

const crypto = require('crypto');
const db = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- PIN hashing (scrypt, salted) ---
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const test = crypto.scryptSync(String(pin), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// --- Sessions ---
function createSession(memberId, now = Date.now()) {
  // opportunistic cleanup of expired sessions
  db.prepare('DELETE FROM member_sessions WHERE expires_at < ?').run(now);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO member_sessions (token, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, memberId, now, now + SESSION_TTL_MS);
  return token;
}

// Returns the active member row for a valid, unexpired token, else null.
function lookupSession(token, now = Date.now()) {
  if (!token) return null;
  return db.prepare(`
    SELECT m.* FROM member_sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token = ? AND s.expires_at > ? AND m.is_active = 1
  `).get(token, now) || null;
}

function deleteMemberSessions(memberId) {
  db.prepare('DELETE FROM member_sessions WHERE member_id = ?').run(memberId);
}

module.exports = { hashPin, verifyPin, createSession, lookupSession, deleteMemberSessions };
