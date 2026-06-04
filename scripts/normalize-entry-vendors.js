#!/usr/bin/env node
// One-shot: rewrite entries.vendor_name to match the canonical form stored in
// the vendors table (case-insensitive). Names not found in the vendors table
// are reported but left untouched.
//
//   node scripts/normalize-entry-vendors.js          # dry-run
//   node scripts/normalize-entry-vendors.js --apply  # commit

const db = require('../db');
const apply = process.argv.includes('--apply');

const entries = db.prepare(
  "SELECT id, vendor_name FROM entries WHERE vendor_name IS NOT NULL AND TRIM(vendor_name) != ''"
).all();

const vendors = db.prepare('SELECT name FROM vendors').all();
const canonicalByLower = new Map(
  vendors.map(v => [v.name.trim().toLowerCase(), v.name])
);

let updates = 0;
const unrecognised = new Map(); // name -> count

const stmt = db.prepare('UPDATE entries SET vendor_name = ? WHERE id = ?');
const tx = db.transaction(() => {
  for (const e of entries) {
    const canon = canonicalByLower.get(e.vendor_name.trim().toLowerCase());
    if (canon && canon !== e.vendor_name) {
      console.log(`  #${e.id}: "${e.vendor_name}" → "${canon}"`);
      if (apply) stmt.run(canon, e.id);
      updates++;
    } else if (!canon) {
      unrecognised.set(e.vendor_name, (unrecognised.get(e.vendor_name) || 0) + 1);
    }
  }
});
tx();

console.log(`\n${apply ? '✅  Applied' : 'Would apply'} ${updates} update(s).`);

if (unrecognised.size) {
  console.log(`\n⚠️  ${unrecognised.size} vendor name(s) in entries are NOT in the vendors table:`);
  for (const [name, count] of unrecognised) console.log(`     "${name}" (${count} entries)`);
  console.log(`\n     These are typos or unknown vendors. To merge them into an existing`);
  console.log(`     vendor, use the admin Vendors tab → Rename — it now updates entries too.`);
}

if (!apply && updates) console.log(`\nDry run only. Re-run with --apply to commit.`);
