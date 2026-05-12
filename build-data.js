#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-data.js
// Converts data/daily_position_details.xlsx → data/publisher_data.json
//
// DATA SOURCE NOTE:
//   Currently reads from the xlsx file bundled in data/.
//   When switching to a database, replace the "Read xlsx" section below
//   with an API fetch and map each record to the same row format.
//
// Run:  node build-data.js
// ─────────────────────────────────────────────────────────────────────────────

const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SRC      = path.join(DATA_DIR, 'daily_position_details.xlsx');
const OUTPUT   = path.join(DATA_DIR, 'publisher_data.json');
const APP_MAP  = path.join(DATA_DIR, 'app_id_map.json');   // publisher_name → app_id fallback

if (!fs.existsSync(SRC)) {
  console.error('ERROR: data/daily_position_details.xlsx not found.');
  process.exit(1);
}

// ── app_id lookup (fallback when xlsx lacks the column) ───────────────────────
const nameToAppId = fs.existsSync(APP_MAP) ? JSON.parse(fs.readFileSync(APP_MAP, 'utf8')) : {};

// ── Read xlsx ─────────────────────────────────────────────────────────────────
console.log('Reading:', SRC);
const wb    = xlsx.readFile(SRC);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows  = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });

const header = rows[0].map(h => (h == null ? '' : String(h).trim().toLowerCase()));
const col    = name => { const i = header.indexOf(name); return i === -1 ? null : i; };

const iDate    = col('date');
const iCost    = col('total_adv_cost');
const iPv      = col('page_views');
const iDevice  = col('device');
const iPosId   = col('position_id');
const iDesc    = col('description');
const iType    = col('position_type');
const iPubName = col('publisher_name');
const iAppId   = col('app_id');   // may be null in older exports

console.log('Columns:', { date: iDate, total_adv_cost: iCost, page_views: iPv,
  device: iDevice ?? '(missing)', app_id: iAppId ?? '(fallback via name)' });

for (const [name, idx] of Object.entries({ date: iDate, total_adv_cost: iCost, page_views: iPv, position_id: iPosId, publisher_name: iPubName })) {
  if (idx === null) { console.error('Missing required column:', name); process.exit(1); }
}

// ── Build output structure ────────────────────────────────────────────────────
// { [appId]: { publisher_name, positions: { [posId]: { desc, type, rows: [[date, cost, pv, device]] } } } }
const out = {};
let skipped = 0, noAppId = 0;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r.length) continue;

  const date    = r[iDate]    != null ? String(r[iDate]).trim()    : null;
  const posId   = r[iPosId]   != null ? String(r[iPosId]).trim()   : null;
  const pubName = r[iPubName] != null ? String(r[iPubName]).trim() : '';
  const cost    = Number(r[iCost]) || 0;
  const pv      = Number(r[iPv])   || 0;
  const device  = iDevice !== null && r[iDevice] != null ? String(r[iDevice]).trim().toLowerCase() : null;

  // Resolve app_id: prefer xlsx column, fall back to name map
  const appId = (iAppId !== null && r[iAppId] != null ? String(r[iAppId]).trim() : null)
    || nameToAppId[pubName]
    || null;

  if (!date || !posId) { skipped++; continue; }
  if (!appId) { noAppId++; continue; }

  if (!out[appId]) out[appId] = { publisher_name: pubName, positions: {} };
  if (!out[appId].positions[posId]) {
    out[appId].positions[posId] = {
      desc: r[iDesc]  != null ? String(r[iDesc]).trim()  : '',
      type: r[iType]  != null ? String(r[iType]).trim()  : '',
      rows: [],
    };
  }

  // Row format: [date, total_adv_cost, page_views, device]
  out[appId].positions[posId].rows.push([date, cost, pv, device]);
}

// ── Report ────────────────────────────────────────────────────────────────────
let totalPos = 0, totalRows = 0;
for (const pub of Object.values(out)) {
  totalPos += Object.keys(pub.positions).length;
  for (const pos of Object.values(pub.positions)) totalRows += pos.rows.length;
}
console.log(`Publishers: ${Object.keys(out).length} | Positions: ${totalPos} | Rows: ${totalRows}`);
if (skipped)  console.warn(`Skipped (missing date/posId): ${skipped}`);
if (noAppId)  console.warn(`Skipped (no app_id resolved): ${noAppId} — add to data/app_id_map.json`);

// ── Write JSON ────────────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, JSON.stringify(out));
console.log(`Written: ${OUTPUT} (${(fs.statSync(OUTPUT).size/1024).toFixed(1)} KB)`);
