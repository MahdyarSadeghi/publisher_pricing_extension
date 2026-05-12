#!/usr/bin/env node
// Converts daily_position_details.xlsx (or publisher_data.xlsx) → data/publisher_data.json
// Run: node build-data.js

const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, 'data');
const OUTPUT     = path.join(DATA_DIR, 'publisher_data.json');
const CANDIDATES = [
  'daily_position_details.xlsx',
  'publisher_data.xlsx',
];

// ── Find source file ──────────────────────────────────────────────
let srcFile = null;
for (const name of CANDIDATES) {
  const p = path.join(DATA_DIR, name);
  if (fs.existsSync(p)) { srcFile = p; break; }
}
if (!srcFile) {
  console.error('Error: no xlsx found in data/. Place daily_position_details.xlsx there.');
  process.exit(1);
}
console.log('Reading:', srcFile);

// ── Read xlsx ─────────────────────────────────────────────────────
const wb    = xlsx.readFile(srcFile);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows  = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });

// Header row (skip index column if first cell is null/empty)
const header = rows[0].map(h => (h == null ? '' : String(h).trim().toLowerCase()));

function col(name) {
  const i = header.indexOf(name);
  if (i === -1) return null;
  return i;
}

const iDate      = col('date');
const iAdvCost   = col('total_adv_cost');
const iPv        = col('page_views');
const iDevice    = col('device');        // may be null if not present
const iPosId     = col('position_id');
const iDesc      = col('description');
const iPosType   = col('position_type');
const iPubName   = col('publisher_name');
const iAppId     = col('app_id');

const required = { date: iDate, total_adv_cost: iAdvCost, page_views: iPv, position_id: iPosId, app_id: iAppId };
for (const [name, idx] of Object.entries(required)) {
  if (idx === null) { console.error('Missing required column:', name); process.exit(1); }
}

console.log('Columns found:', {
  date: iDate, total_adv_cost: iAdvCost, page_views: iPv,
  device: iDevice !== null ? iDevice : '(not present)',
  position_id: iPosId, app_id: iAppId,
});

// ── Build nested structure ────────────────────────────────────────
// { [appId]: { publisher_name, positions: { [posId]: { desc, type, rows: [[date, cost, pv, device?]] } } } }
const out = {};
let skipped = 0;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length === 0) continue;

  const appId  = r[iAppId]  != null ? String(r[iAppId]).trim()  : null;
  const posId  = r[iPosId]  != null ? String(r[iPosId]).trim()  : null;
  const date   = r[iDate]   != null ? String(r[iDate]).trim()   : null;
  const cost   = Number(r[iAdvCost]) || 0;
  const pv     = Number(r[iPv])      || 0;
  const device = iDevice !== null && r[iDevice] != null ? String(r[iDevice]).trim().toLowerCase() : null;

  if (!appId || !posId || !date) { skipped++; continue; }

  if (!out[appId]) {
    out[appId] = {
      publisher_name: r[iPubName] != null ? String(r[iPubName]).trim() : '',
      positions: {},
    };
  }

  const pub = out[appId];
  if (!pub.positions[posId]) {
    pub.positions[posId] = {
      desc: r[iDesc]    != null ? String(r[iDesc]).trim()    : '',
      type: r[iPosType] != null ? String(r[iPosType]).trim() : '',
      rows: [],
    };
  }

  // Row format: [date, total_adv_cost, page_views, device]
  // device is omitted from the array only if the column doesn't exist
  if (iDevice !== null) {
    pub.positions[posId].rows.push([date, cost, pv, device]);
  } else {
    pub.positions[posId].rows.push([date, cost, pv]);
  }
}

console.log('Publishers:', Object.keys(out).length);
console.log('Skipped rows:', skipped);
let totalPos = 0, totalRows = 0;
for (const pub of Object.values(out)) {
  totalPos  += Object.keys(pub.positions).length;
  for (const pos of Object.values(pub.positions)) totalRows += pos.rows.length;
}
console.log('Total positions:', totalPos, '| Total rows:', totalRows);

// ── Write JSON ────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, JSON.stringify(out));
console.log('Written:', OUTPUT, '(' + (fs.statSync(OUTPUT).size / 1024).toFixed(1) + ' KB)');
