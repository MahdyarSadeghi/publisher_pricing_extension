'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allData        = null;   // full publisher_data.json
let foundPub       = null;   // { appId, publisher_name, positions } | null
let searchQuery    = '';
let addedPositions = [];     // [{ type }] user-added new positions

// ── DOM ───────────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const stepSearch    = $('step-search');
const stepPositions = $('step-positions');
const stepLoading   = $('step-loading');
const stepResults   = $('step-results');

function showStep(name) {
  const map = { search: stepSearch, positions: stepPositions, loading: stepLoading, results: stepResults };
  [stepSearch, stepPositions, stepLoading, stepResults].forEach(el => el.classList.remove('active'));
  if (map[name]) map[name].classList.add('active');
}

function setLoading(msg) {
  $('loading-msg').textContent = msg || 'در حال پردازش...';
  showStep('loading');
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function loadData() {
  if (allData) return;
  const url = chrome.runtime.getURL('data/publisher_data.json');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('خطا در بارگذاری فایل داده‌ها');
  allData = await resp.json();
  buildTypeDropdown();
}

function buildTypeDropdown() {
  const types = new Set();
  for (const pub of Object.values(allData))
    for (const pos of Object.values(pub.positions))
      if (pos.type) types.add(pos.type);

  const sel = $('new-pos-type');
  sel.innerHTML = '<option value="">نوع پوزیشن را انتخاب کنید...</option>';
  [...types].sort().forEach(t => {
    const o = document.createElement('option');
    o.value = o.textContent = t;
    sel.appendChild(o);
  });
}

// ── Publisher search ──────────────────────────────────────────────────────────
function searchPublisher(q) {
  q = q.trim().toLowerCase();
  for (const [appId, pub] of Object.entries(allData)) {
    if (appId.toLowerCase() === q) return { appId, ...pub };
    if (pub.publisher_name && pub.publisher_name.toLowerCase().includes(q)) return { appId, ...pub };
  }
  return null;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// rows: [[date, cost, pv, device], ...]  → daily RPM array
function rowsToRPMs(rows) {
  const by = {};
  for (const [date, cost, pv] of rows) {
    if (!by[date]) by[date] = { c: 0, p: 0 };
    by[date].c += Number(cost);
    by[date].p += Number(pv);
  }
  return Object.values(by).filter(d => d.p > 0).map(d => (d.c / d.p) * 1000);
}

function pricing(rpms) {
  return {
    floor:  Math.round(pct(rpms, 25)),
    target: Math.round(pct(rpms, 50)),
    ceil:   Math.round(pct(rpms, 75)),
    n:      rpms.length,
  };
}

// Average daily PV for a publisher (uses first position as proxy)
function avgDailyPV(pub) {
  const rows = Object.values(pub.positions)[0]?.rows;
  if (!rows?.length) return 0;
  const by = {};
  for (const [date,, pv] of rows) { by[date] = (by[date] || 0) + Number(pv); }
  const vals = Object.values(by);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Find publishers with similar daily PV that have a given position type
function similarPubRPMs(targetPV, excludeAppId, posType) {
  const rpms = [];
  let pubCount = 0;
  for (const [appId, pub] of Object.entries(allData)) {
    if (appId === excludeAppId) continue;
    const pv = avgDailyPV(pub);
    if (!pv) continue;
    const ratio = targetPV / pv;
    if (ratio < 0.25 || ratio > 4) continue;                   // within 4x range
    const matching = Object.values(pub.positions).filter(p => p.type === posType);
    if (!matching.length) continue;
    pubCount++;
    for (const pos of matching) rpms.push(...rowsToRPMs(pos.rows));
  }
  return { rpms, pubCount };
}

// ── Jalali calendar ───────────────────────────────────────────────────────────
function gToJ(gy, gm, gd) {
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const gDays = [31, leap(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gDNo = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400);
  for (let i = 0; i < gm - 1; i++) gDNo += gDays[i];
  gDNo += gd;
  let jDNo = gDNo - 79;
  const jNp = Math.floor(jDNo / 12053); jDNo %= 12053;
  let jy = 979 + 33 * jNp + 4 * Math.floor(jDNo / 1461); jDNo %= 1461;
  if (jDNo >= 366) { jy += Math.floor((jDNo - 1) / 365); jDNo = (jDNo - 1) % 365; }
  const jMDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let jm = 0;
  for (let i = 0; i < 11 && jDNo >= jMDays[i]; i++) { jDNo -= jMDays[i]; jm++; }
  return [jy, jm + 1, jDNo + 1];
}

const J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

// ── Seasonal analysis ─────────────────────────────────────────────────────────
function seasonalData(rows) {
  const byDate = {};
  for (const [date, cost, pv] of rows) {
    if (!byDate[date]) byDate[date] = { c: 0, p: 0, jm: null };
    byDate[date].c += Number(cost);
    byDate[date].p += Number(pv);
    if (!byDate[date].jm) {
      const [y, m, d] = date.split('-').map(Number);
      byDate[date].jm = gToJ(y, m, d)[1];
    }
  }
  const byMonth = {};
  for (const { c, p, jm } of Object.values(byDate)) {
    if (!p) continue;
    if (!byMonth[jm]) byMonth[jm] = [];
    byMonth[jm].push((c / p) * 1000);
  }
  const avgs = {};
  for (const [m, rpms] of Object.entries(byMonth))
    avgs[Number(m)] = rpms.reduce((a, b) => a + b, 0) / rpms.length;
  return avgs;
}

function buildSeasonalInsight(avgs) {
  const entries = Object.entries(avgs).map(([m, v]) => [Number(m), v]);
  if (entries.length < 3) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const mean = entries.reduce((s, [, v]) => s + v, 0) / entries.length;
  const top  = entries.slice(0, 2);
  const bot  = entries.slice(-2);
  const topPct = Math.round((top[0][1] / mean - 1) * 100);
  const botPct = Math.round((1 - bot[bot.length - 1][1] / mean) * 100);
  return {
    avgs: Object.fromEntries(entries),
    topNames: top.map(([m]) => J_MONTHS[m - 1]),
    botNames: bot.map(([m]) => J_MONTHS[m - 1]),
    topPct,
    botPct,
  };
}

// ── Format ────────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fa-IR');
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(items, seasonal) {
  $('results-pub-chip').textContent = foundPub
    ? (foundPub.publisher_name || foundPub.appId)
    : `جدید: ${searchQuery}`;

  let html = '';

  for (const item of items) {
    const { label, posId, type, p, source, pubCount } = item;
    const note = source === 'own'
      ? `${p.n} روز داده تاریخی`
      : source === 'similar'
        ? `${p.n} روز داده — ${pubCount} ناشر مشابه`
        : null;

    html += `
      <div class="pricing-card">
        <div class="pricing-card-head">
          <h3>${label}</h3>
          ${posId ? `<span class="pos-type-badge">#${posId}</span>` : ''}
          ${type  ? `<span class="pos-type-badge">${type}</span>`   : ''}
          ${note  ? `<span class="pricing-source-note">${note}</span>` : ''}
        </div>
        ${p.n >= 5 ? `
        <div class="pricing-grid">
          <div class="pricing-cell floor">
            <div class="lbl">کف</div>
            <div class="val">${fmt(p.floor)}</div>
            <div class="unit">RPM</div>
          </div>
          <div class="pricing-cell target">
            <div class="lbl">هدف</div>
            <div class="val">${fmt(p.target)}</div>
            <div class="unit">RPM</div>
          </div>
          <div class="pricing-cell ceil">
            <div class="lbl">سقف</div>
            <div class="val">${fmt(p.ceil)}</div>
            <div class="unit">RPM</div>
          </div>
        </div>` : `
        <div class="no-data-note">⚠️ داده کافی برای این پوزیشن یافت نشد</div>`}
      </div>
    `;
  }

  // Seasonal chart
  if (seasonal) {
    const ins = buildSeasonalInsight(seasonal);
    if (ins) {
      const maxV = Math.max(...Object.values(ins.avgs));
      let bars = '';
      for (let m = 1; m <= 12; m++) {
        const v = ins.avgs[m] || 0;
        const h = v ? Math.max(5, Math.round((v / maxV) * 64)) : 3;
        const cls = ins.topNames.includes(J_MONTHS[m - 1]) ? 'peak'
                  : ins.botNames.includes(J_MONTHS[m - 1]) ? 'low' : '';
        bars += `<div class="month-col">
          <div class="month-bar ${cls}" style="height:${h}px;"></div>
          <div class="month-lbl">${J_MONTHS[m - 1].slice(0, 3)}</div>
        </div>`;
      }
      html += `
        <div class="seasonal-card">
          <h3>📈 الگوی فصلی RPM</h3>
          <div class="month-chart">${bars}</div>
          <div class="insight-text">
            اوج: <strong>${ins.topNames.join(' و ')}</strong> (تا ${ins.topPct}٪ بالاتر از میانگین)<br>
            کمترین: <strong>${ins.botNames.join(' و ')}</strong> (تا ${ins.botPct}٪ پایین‌تر از میانگین)
          </div>
        </div>
      `;
    }
  }

  $('results-body').innerHTML = html;
  showStep('results');
}

// ── Calculate ─────────────────────────────────────────────────────────────────
function calculate() {
  const items = [];
  let allRows = [];

  if (foundPub) {
    const targetPV = avgDailyPV(foundPub);
    // Checked existing positions
    $('pos-list').querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      const posId = cb.dataset.posid;
      const pos   = foundPub.positions[posId];
      if (!pos) return;
      const rpms = rowsToRPMs(pos.rows);
      allRows = allRows.concat(pos.rows);
      items.push({ label: pos.desc || `پوزیشن ${posId}`, posId, type: pos.type, p: pricing(rpms), source: 'own' });
    });
    // User-added new positions
    for (const np of addedPositions) {
      const { rpms, pubCount } = similarPubRPMs(targetPV, foundPub.appId, np.type);
      items.push({ label: 'پوزیشن جدید', posId: null, type: np.type, p: pricing(rpms), source: 'similar', pubCount });
    }
  } else {
    const targetPV = Number($('pv-input').value) || 0;
    for (const np of addedPositions) {
      const { rpms, pubCount } = similarPubRPMs(targetPV, null, np.type);
      items.push({ label: 'پوزیشن جدید', posId: null, type: np.type, p: pricing(rpms), source: 'similar', pubCount });
    }
  }

  // Seasonal — use all rows from found pub's positions if available
  if (!allRows.length && foundPub) {
    for (const pos of Object.values(foundPub.positions)) allRows = allRows.concat(pos.rows);
  }
  const seasonal = allRows.length ? seasonalData(allRows) : null;

  renderResults(items, seasonal);
}

// ── Build step 2 UI ───────────────────────────────────────────────────────────
function buildPositionsStep() {
  addedPositions = [];

  const banner = $('pub-banner');
  const posList = $('pos-list');
  posList.innerHTML = '';
  $('add-pos-form').style.display = 'none';

  if (foundPub) {
    banner.innerHTML = `
      <div class="pub-banner found">
        <div class="pub-banner-icon">✅</div>
        <div>
          <div class="pub-banner-name">${foundPub.publisher_name || foundPub.appId}</div>
          <div class="pub-banner-id">${foundPub.appId}</div>
        </div>
      </div>`;
    $('pos-section-label').textContent = 'پوزیشن‌های موجود را انتخاب کنید';
    $('pv-section').style.display = 'none';

    for (const [posId, pos] of Object.entries(foundPub.positions)) {
      const rpms = rowsToRPMs(pos.rows);
      const med  = rpms.length ? Math.round(pct(rpms, 50)) : null;
      const label = document.createElement('label');
      label.className = 'pos-item selected';
      label.innerHTML = `
        <input type="checkbox" checked data-posid="${posId}">
        <div class="pos-item-info">
          <div class="pos-item-desc">${pos.desc || 'بدون توضیح'}</div>
          <div class="pos-item-meta">
            <span class="pos-item-id">#${posId}</span>
            ${pos.type ? `<span class="pos-type-badge">${pos.type}</span>` : ''}
          </div>
        </div>
        ${med ? `<span class="pos-rpm-hint">میانه: ${med.toLocaleString('fa-IR')}</span>` : ''}
      `;
      label.querySelector('input').addEventListener('change', e => {
        label.classList.toggle('selected', e.target.checked);
      });
      posList.appendChild(label);
    }
  } else {
    banner.innerHTML = `
      <div class="pub-banner not-found">
        <div class="pub-banner-icon">⚠️</div>
        <div>
          <div class="pub-banner-name">ناشر «${searchQuery}» در داده‌ها یافت نشد</div>
          <div class="pub-banner-sub">پوزیشن‌های مورد نظر و بازدید روزانه را وارد کنید</div>
        </div>
      </div>`;
    $('pos-section-label').textContent = 'پوزیشن‌های مورد نظر را اضافه کنید';
    $('pv-section').style.display = '';
  }

  showStep('positions');
}

function renderAddedPositions() {
  // remove old added items
  $('pos-list').querySelectorAll('.added-pos-item').forEach(el => el.remove());
  addedPositions.forEach((np, i) => {
    const div = document.createElement('div');
    div.className = 'add-pos-new-item added-pos-item';
    div.innerHTML = `
      <div class="pos-item-info">
        <div class="pos-item-desc">پوزیشن جدید</div>
        <div class="pos-item-meta"><span class="pos-type-badge">${np.type}</span></div>
      </div>
      <button class="remove-btn" data-i="${i}" title="حذف">✕</button>
    `;
    div.querySelector('.remove-btn').addEventListener('click', e => {
      addedPositions.splice(Number(e.currentTarget.dataset.i), 1);
      renderAddedPositions();
    });
    $('pos-list').appendChild(div);
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────
$('search-btn').addEventListener('click', handleSearch);
$('pub-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });

async function handleSearch() {
  const q = $('pub-input').value.trim();
  if (!q) return;
  searchQuery = q;
  $('search-err').style.display = 'none';
  setLoading('در حال جستجو...');
  try {
    await loadData();
  } catch (e) {
    $('search-err').textContent = e.message;
    $('search-err').style.display = '';
    showStep('search');
    return;
  }
  foundPub = searchPublisher(q);
  buildPositionsStep();
}

$('add-pos-toggle').addEventListener('click', () => {
  const f = $('add-pos-form');
  f.style.display = f.style.display === 'none' ? '' : 'none';
});

$('confirm-add-pos').addEventListener('click', () => {
  const t = $('new-pos-type').value;
  if (!t) return;
  addedPositions.push({ type: t });
  renderAddedPositions();
  $('add-pos-form').style.display = 'none';
  $('new-pos-type').value = '';
});

$('calc-btn').addEventListener('click', () => {
  const err = $('pos-err');
  err.style.display = 'none';

  if (foundPub) {
    const checked = $('pos-list').querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0 && addedPositions.length === 0) {
      err.textContent = 'حداقل یک پوزیشن را انتخاب کنید';
      err.style.display = '';
      return;
    }
  } else {
    if (addedPositions.length === 0) {
      err.textContent = 'حداقل یک پوزیشن اضافه کنید';
      err.style.display = '';
      return;
    }
    const pv = Number($('pv-input').value);
    if (!pv || pv <= 0) {
      err.textContent = 'بازدید روزانه صفحات را وارد کنید';
      err.style.display = '';
      return;
    }
  }

  calculate();
});

$('back-btn').addEventListener('click', () => {
  foundPub = null;
  addedPositions = [];
  showStep('search');
});

$('new-search-btn').addEventListener('click', () => {
  foundPub = null;
  addedPositions = [];
  $('pub-input').value = '';
  showStep('search');
});
