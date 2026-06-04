#!/usr/bin/env node
// One-shot migration: shift existing exif_timestamp values back by 5h30m to
// correct entries created before the TZ=Asia/Kolkata fix was deployed.
//
// Before the fix, naive EXIF "YYYY:MM:DD HH:MM:SS" strings were parsed on a
// UTC server, which over-shifted every timestamp by the IST offset. Run this
// ONCE on the server, before guards add many more entries.
//
// Usage (from app root):
//   node scripts/fix-tz.js          # dry-run, shows what would change
//   node scripts/fix-tz.js --apply  # actually update the rows

const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'tanker.db'));
const apply = process.argv.includes('--apply');

const OFFSET_MINUTES = 5 * 60 + 30; // IST offset
const rows = db.prepare(`
  SELECT id, vendor_name, exif_timestamp, submitted_at
  FROM entries
  WHERE exif_timestamp IS NOT NULL
  ORDER BY submitted_at ASC
`).all();

if (!rows.length) {
  console.log('No entries with exif_timestamp — nothing to do.');
  process.exit(0);
}

console.log(`${apply ? 'Applying' : 'DRY RUN — would shift'} ${rows.length} entries back by ${OFFSET_MINUTES} minutes:\n`);

const update = db.prepare('UPDATE entries SET exif_timestamp = ? WHERE id = ?');
const tx = db.transaction(rows => {
  for (const r of rows) {
    const before = new Date(r.exif_timestamp);
    const after  = new Date(before.getTime() - OFFSET_MINUTES * 60 * 1000);
    const newIso = after.toISOString();
    console.log(`  #${r.id} ${r.vendor_name.padEnd(28)} ${r.exif_timestamp}  →  ${newIso}`);
    if (apply) update.run(newIso, r.id);
  }
});
tx(rows);

console.log(apply
  ? `\n✅  ${rows.length} rows updated.`
  : `\nDry run only. Re-run with --apply to commit:\n   node scripts/fix-tz.js --apply\n`);
