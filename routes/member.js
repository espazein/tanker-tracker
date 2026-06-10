// Member-facing auth endpoints (no admin PIN required):
//   POST /api/member/login       { name, pin }      → { token, must_change, name }
//   POST /api/member/change-pin  { token, new_pin } → { success }
//
// Members are created and reset by the admin (see routes/admin.js). On first
// login (and after an admin reset) must_change is set, and the member must set
// a new PIN before the session can be used for anything else.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPin, hashPin, createSession, lookupSession, deleteMemberSessions } = require('../auth');

const PIN_MIN = 4;
const PIN_MAX = 12;

router.post('/login', (req, res) => {
  const name = (req.body?.name || '').trim();
  const pin  = (req.body?.pin || '').trim();
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN are required' });

  const member = db.prepare('SELECT * FROM members WHERE name = ? COLLATE NOCASE AND is_active = 1').get(name);
  // Same generic error whether the name is unknown or the PIN is wrong.
  if (!member || !verifyPin(pin, member.pin_hash)) {
    return res.status(401).json({ error: 'Invalid name or PIN' });
  }

  db.prepare('UPDATE members SET last_login = ? WHERE id = ?').run(Date.now(), member.id);
  const token = createSession(member.id);
  res.json({ token, must_change: !!member.must_change, name: member.name });
});

router.post('/change-pin', (req, res) => {
  const token  = (req.body?.token || '').trim();
  const newPin = (req.body?.new_pin || '').trim();

  const member = lookupSession(token);
  if (!member) return res.status(401).json({ error: 'Session expired. Please log in again.' });

  if (newPin.length < PIN_MIN || newPin.length > PIN_MAX) {
    return res.status(400).json({ error: `PIN must be ${PIN_MIN}–${PIN_MAX} characters` });
  }

  // Keep the current session valid so the member stays logged in.
  db.prepare('UPDATE members SET pin_hash = ?, must_change = 0 WHERE id = ?')
    .run(hashPin(newPin), member.id);

  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  const member = lookupSession((req.body?.token || '').trim());
  if (member) deleteMemberSessions(member.id);
  res.json({ success: true });
});

module.exports = router;
