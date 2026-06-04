#!/usr/bin/env node
// One-shot: populate the vendors table with the distinct vendor names found
// in existing entries. Case-insensitive — picks the most-used capitalisation
// as the canonical form (e.g. if "Kaveri" appears 12 times and "kaveri" once,
// "Kaveri" is inserted).
//
//   node scripts/seed-vendors.js          # dry-run
//   node scripts/seed-vendors.js --apply  # commit

// Use the shared db module so the vendors table is guaranteed to exist
const db = require('../db');
const apply = process.argv.includes('--apply');

// Group by lowercase name; for each group pick the variant with the highest count
const groups = db.prepare(`
  SELECT vendor_name AS variant,
         LOWER(TRIM(vendor_name)) AS key,
         COUNT(*) AS cnt
  FROM entries
  WHERE vendor_name IS NOT NULL AND TRIM(vendor_name) != ''
  GROUP BY vendor_name, LOWER(TRIM(vendor_name))
`).all();

const canonical = new Map(); // key -> { variant, cnt }
for (const g of groups) {
  const prior = canonical.get(g.key);
  if (!prior || g.cnt > prior.cnt) canonical.set(g.key, { variant: g.variant.trim(), cnt: g.cnt });
}

if (!canonical.size) {
  console.log('No vendor names in entries — nothing to seed.');
  process.exit(0);
}

console.log(`${apply ? 'Inserting' : 'DRY RUN — would insert'} ${canonical.size} canonical vendor(s):\n`);

const insert = db.prepare(
  'INSERT OR IGNORE INTO vendors (name, created_at) VALUES (?, ?)'
);

let inserted = 0;
const tx = db.transaction(() => {
  const now = Date.now();
  for (const { variant, cnt } of canonical.values()) {
    console.log(`  ${variant.padEnd(30)} (${cnt} entries)`);
    if (apply) {
      const r = insert.run(variant, now);
      if (r.changes) inserted++;
    }
  }
});
tx();

console.log(apply
  ? `\n✅  ${inserted} vendor(s) inserted (skipped any that already existed).`
  : `\nDry run only. Re-run with --apply to commit:\n   node scripts/seed-vendors.js --apply\n`);
