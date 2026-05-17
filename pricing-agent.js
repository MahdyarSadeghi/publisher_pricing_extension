'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allData     = null;
let foundPub    = null;
let searchQuery = '';

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showPage(name) {
  ['search','pv','loading','results'].forEach(p => {
    const el = $('page-' + p);
    if (!el) return;
    el.style.display = p === name ? (p === 'search' || p === 'pv' ? 'flex' : p === 'results' ? 'block' : 'flex') : 'none';
  });
}

function setLoading(msg) {
  $('loading-msg').textContent = msg || 'در حال تحلیل داده‌ها...';
  showPage('loading');
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function loadData() {
  if (allData) return;
  const resp = await fetch(chrome.runtime.getURL('data/publisher_data.json'));
  if (!resp.ok) throw new Error('خطا در بارگذاری فایل داده‌ها');
  allData = await resp.json();
}

function searchPublisher(q) {
  q = q.trim().toLowerCase();
  for (const [appId, pub] of Object.entries(allData)) {
    if (appId.toLowerCase() === q) return { appId, ...pub };
    if (pub.publisher_name?.toLowerCase().includes(q)) return { appId, ...pub };
  }
  return null;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function pct50(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Linear regression slope (y per unit x)
function slope(pairs) {
  const n = pairs.length;
  if (n < 4) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of pairs) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  return d ? (n * sxy - sx * sy) / d : 0;
}

// ── Jalali ────────────────────────────────────────────────────────────────────
function gToJ(gy, gm, gd) {
  const g_dm = [31,28+(gy%4===0&&(gy%100!==0||gy%400===0)?1:0),31,30,31,30,31,31,30,31,30,31];
  let g_d = 365*gy + Math.floor((gy+3)/4) - Math.floor((gy+99)/100) + Math.floor((gy+399)/400);
  for (let i = 0; i < gm - 1; i++) g_d += g_dm[i];
  g_d += gd;
  let j_d = g_d - 79;
  const j_np = Math.floor(j_d / 12053); j_d %= 12053;
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_d / 1461); j_d %= 1461;
  if (j_d >= 366) { jy += Math.floor((j_d - 1) / 365); j_d = (j_d - 1) % 365; }
  const jm_d = [31,31,31,31,31,31,30,30,30,30,30,29];
  let jm = 0;
  for (let i = 0; i < 11 && j_d >= jm_d[i]; i++) { j_d -= jm_d[i]; jm++; }
  return [jy, jm + 1, j_d + 1];
}

const J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

function todayJalali() {
  const n = new Date();
  return gToJ(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

// ── Aggregate rows → daily RPMs ───────────────────────────────────────────────
// rows: [[date, cost, pv, device?], ...]
function toDaily(rows) {
  const by = {};
  for (const [date, cost, pv] of rows) {
    if (!by[date]) by[date] = { c: 0, p: 0 };
    by[date].c += Number(cost);
    by[date].p += Number(pv);
  }
  return Object.entries(by)
    .filter(([, d]) => d.p > 0)
    .map(([date, { c, p }]) => ({ date, rpm: (c / p) * 1000 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Core agent analysis for one position ─────────────────────────────────────
function analyzePosition(posId, pos) {
  const daily = toDaily(pos.rows);
  if (daily.length < 10) return { posId, pos, ok: false, n: daily.length };

  const [, todayJM] = todayJalali();

  // Recent average (last 30 data points)
  const recent = daily.slice(-30);
  const recentAvg = mean(recent.map(d => d.rpm));

  // Trend: linear regression on last 60 data points
  const tWindow = daily.slice(-60);
  const s = slope(tWindow.map((d, i) => [i, d.rpm]));
  const tAvg = mean(tWindow.map(d => d.rpm));
  // % change per 30 days (one month), capped at ±50%
  const trendPct = tAvg > 0 ? Math.max(-50, Math.min(50, (s * 30 / tAvg) * 100)) : 0;

  // Seasonal analysis by Jalali month
  const byJM = {};
  for (const { date, rpm } of daily) {
    const [y, m, d] = date.split('-').map(Number);
    const [, jm] = gToJ(y, m, d);
    if (!byJM[jm]) byJM[jm] = [];
    byJM[jm].push(rpm);
  }
  const mAvg = {};
  for (const [m, rpms] of Object.entries(byJM)) mAvg[Number(m)] = mean(rpms);

  const allMAvgs = Object.values(mAvg);
  const overallAvg = mean(allMAvgs);

  // Next Jalali month
  const nextJM = todayJM === 12 ? 1 : todayJM + 1;
  const curMAvg  = mAvg[todayJM]  ?? overallAvg;
  const nextMAvg = mAvg[nextJM]   ?? overallAvg;

  // Seasonal index: next month vs current month
  const seasAdj = curMAvg > 0 ? nextMAvg / curMAvg : 1;
  // Next month vs year average (for display)
  const nextVsAvgPct = overallAvg > 0 ? Math.round(((nextMAvg / overallAvg) - 1) * 100) : 0;

  // Recommendation: project recent data forward
  const trendFactor   = 1 + Math.max(-0.25, Math.min(0.25, (trendPct / 100) * 0.55));
  const recommended   = Math.round(recentAvg * seasAdj * trendFactor);

  // Historical median for context
  const histMedian = Math.round(pct50(daily.map(d => d.rpm)));
  const diffPct    = histMedian > 0 ? Math.round(((recommended - histMedian) / histMedian) * 100) : 0;

  return {
    posId, pos, ok: true, n: daily.length,
    recommended,
    recentAvg:   Math.round(recentAvg),
    histMedian,
    diffPct,
    trendPct:    Math.round(trendPct * 10) / 10,
    curMonth:    J_MONTHS[todayJM  - 1],
    nextMonth:   J_MONTHS[nextJM   - 1],
    nextVsAvgPct,
    mAvg,
  };
}

// ── Build natural language insights ──────────────────────────────────────────
function buildInsights(a) {
  const lines = [];

  // 1. Recent baseline
  const baseText = `میانگین ۳۰ روز اخیر: <strong>${fmt(a.recentAvg)}</strong> تومان`;
  if (Math.abs(a.trendPct) >= 2.5) {
    const dir   = a.trendPct > 0 ? 'صعودی' : 'نزولی';
    const arrow = a.trendPct > 0 ? '↑' : '↓';
    lines.push({ icon: arrow, text: `${baseText} — ترند ${dir} با نرخ <strong>${Math.abs(a.trendPct)}٪</strong> در ماه` });
  } else {
    lines.push({ icon: '→', text: `${baseText} — ترند تقریباً ثابت` });
  }

  // 2. Seasonal signal
  if (Math.abs(a.nextVsAvgPct) >= 5) {
    const dir  = a.nextVsAvgPct > 0 ? 'بالاتر' : 'پایین‌تر';
    const sign = a.nextVsAvgPct > 0 ? '📈' : '📉';
    lines.push({ icon: sign, text: `${a.nextMonth} تاریخاً <strong>${Math.abs(a.nextVsAvgPct)}٪</strong> ${dir} از میانگین سال` });
  } else {
    lines.push({ icon: '📅', text: `${a.nextMonth} از نظر فصلی تفاوت قابل‌توجهی با میانگین سال ندارد` });
  }

  // 3. Recommendation rationale
  const goodSeason = a.nextVsAvgPct >=  8;
  const badSeason  = a.nextVsAvgPct <= -8;
  const rising     = a.trendPct     >=  3;
  const falling    = a.trendPct     <= -3;

  if (goodSeason && rising)
    lines.push({ icon: '💡', text: `فصل خوب + ترند صعودی — پیشنهاد با حاشیه بالاتر از میانگین تنظیم شده` });
  else if (badSeason && falling)
    lines.push({ icon: '💡', text: `فصل ضعیف + ترند نزولی — پیشنهاد با احتیاط پایین‌تر از میانگین` });
  else if (goodSeason)
    lines.push({ icon: '💡', text: `فصل پیش‌روی مناسب، قیمت‌گذاری بالاتر توجیه دارد` });
  else if (badSeason)
    lines.push({ icon: '💡', text: `فصل پیش‌روی ضعیف‌تر، پیشنهاد محتاطانه‌تر است` });
  else if (rising)
    lines.push({ icon: '💡', text: `ترند رو به رشد — پیشنهاد کمی بالاتر از اخیر تنظیم شده` });
  else if (falling)
    lines.push({ icon: '💡', text: `ترند نزولی — پیشنهاد با در نظر گرفتن افت احتمالی تنظیم شده` });
  else
    lines.push({ icon: '💡', text: `شرایط پایدار — پیشنهاد نزدیک به میانگین تاریخی` });

  return lines;
}

// ── Format number (Persian) ───────────────────────────────────────────────────
function fmt(n) {
  if (!n || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fa-IR');
}

// ── Average daily PV (for similarity matching) ────────────────────────────────
function avgDailyPV(pub) {
  const rows = Object.values(pub.positions)[0]?.rows;
  if (!rows?.length) return 0;
  const by = {};
  for (const [date,, pv] of rows) by[date] = (by[date] || 0) + Number(pv);
  const vals = Object.values(by);
  return vals.length ? mean(vals) : 0;
}

// ── Find similar publishers by daily PV ───────────────────────────────────────
function findSimilar(targetPV, excludeId) {
  const results = [];
  for (const [appId, pub] of Object.entries(allData)) {
    if (appId === excludeId) continue;
    const pv = avgDailyPV(pub);
    if (!pv) continue;
    const ratio = targetPV / pv;
    if (ratio >= 0.2 && ratio <= 5) results.push({ appId, pub, ratio });
  }
  results.sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)));
  return results.slice(0, 15);
}

// ── Render: existing publisher ────────────────────────────────────────────────
function renderExisting(pub) {
  const [, todayJM] = todayJalali();

  $('pub-summary').innerHTML = `
    <span class="pub-name">${pub.publisher_name || pub.appId}</span>
    <span class="pub-appid">${pub.appId}</span>
    <span class="pub-meta">${Object.keys(pub.positions).length} پوزیشن</span>
  `;

  const positions = Object.entries(pub.positions);
  let html = '';

  for (const [posId, pos] of positions) {
    const a = analyzePosition(posId, pos);
    html += renderCard(a);
  }

  $('results-body').innerHTML = html;
}

// ── Render: new publisher (pool from similar) ─────────────────────────────────
function renderNewPublisher(targetPV) {
  const similar = findSimilar(targetPV, null);

  $('pub-summary').innerHTML = `
    <span class="pub-name">ناشر جدید</span>
    <span class="pub-appid" style="color:#888;">بر اساس ${similar.length} ناشر مشابه</span>
    <span class="pub-meta">بازدید روزانه: ${fmt(targetPV)}</span>
  `;

  if (!similar.length) {
    $('results-body').innerHTML = `<div style="color:#aaa;padding:40px 0;text-align:center;font-size:0.9rem;">ناشر مشابهی با این حجم بازدید در داده‌ها یافت نشد.</div>`;
    return;
  }

  // Pool positions by type across similar publishers
  const byType = {};
  for (const { pub } of similar) {
    for (const pos of Object.values(pub.positions)) {
      const t = pos.type || 'unknown';
      if (!byType[t]) byType[t] = [];
      byType[t].push(...pos.rows);
    }
  }

  // Sort types by data volume
  const types = Object.entries(byType)
    .filter(([, rows]) => rows.length >= 10)
    .sort((a, b) => b[1].length - a[1].length);

  let html = `<div class="section-header">پوزیشن‌های رایج در ناشران مشابه</div>`;

  for (const [type, rows] of types) {
    const syntheticPos = { desc: type, type, rows };
    const a = analyzePosition('—', syntheticPos);
    html += renderCard(a);
  }

  $('results-body').innerHTML = html;
}

// ── Render a single position card ─────────────────────────────────────────────
function renderCard(a) {
  if (!a.ok) {
    return `
      <div class="pos-card">
        <div class="pos-card-head">
          <span class="pos-card-name">${a.pos.desc || a.pos.type || 'پوزیشن'}</span>
          ${a.posId && a.posId !== '—' ? `<span class="pos-card-id">#${a.posId}</span>` : ''}
          ${a.pos.type ? `<span class="pos-card-badge">${a.pos.type}</span>` : ''}
        </div>
        <div class="insufficient-note">⚠️ داده کافی موجود نیست (${a.n} روز)</div>
      </div>`;
  }

  const diffCls  = a.diffPct > 8 ? 'up' : a.diffPct < -8 ? 'down' : 'flat';
  const diffText = a.diffPct > 0 ? `+${a.diffPct}٪` : a.diffPct < 0 ? `${a.diffPct}٪` : 'میانگین';
  const diffLabel = a.diffPct > 8 ? 'بالاتر از میانگین' : a.diffPct < -8 ? 'پایین‌تر از میانگین' : 'نزدیک میانگین';

  const insights = buildInsights(a);
  const insightHtml = insights.map(l =>
    `<div class="insight-line"><span class="i-icon">${l.icon}</span><span>${l.text}</span></div>`
  ).join('');

  return `
    <div class="pos-card">
      <div class="pos-card-head">
        <span class="pos-card-name">${a.pos.desc || a.pos.type || 'پوزیشن'}</span>
        ${a.posId && a.posId !== '—' ? `<span class="pos-card-id">#${a.posId}</span>` : ''}
        ${a.pos.type ? `<span class="pos-card-badge">${a.pos.type}</span>` : ''}
      </div>
      <div class="pos-card-body">
        <div class="rec-row">
          <span class="rec-number">${fmt(a.recommended)}</span>
          <span class="rec-unit">تومان / RPM</span>
          <span class="rec-diff ${diffCls}">${diffText} — ${diffLabel}</span>
        </div>
        <div class="insights">${insightHtml}</div>
      </div>
      <div class="pos-card-foot">بر اساس ${a.n} روز داده · میانه تاریخی: ${fmt(a.histMedian)}</div>
    </div>`;
}

// ── Event handlers ────────────────────────────────────────────────────────────
$('search-btn').addEventListener('click', handleSearch);
$('pub-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });

async function handleSearch() {
  const q = $('pub-input').value.trim();
  if (!q) return;
  searchQuery = q;
  $('home-err').style.display = 'none';

  setLoading('در حال جستجو...');
  try {
    await loadData();
  } catch (e) {
    $('home-err').textContent = e.message;
    $('home-err').style.display = '';
    showPage('search');
    return;
  }

  foundPub = searchPublisher(q);

  if (foundPub) {
    setLoading('در حال تحلیل داده‌ها...');
    await new Promise(r => setTimeout(r, 300)); // brief pause for UX
    $('bar-query').textContent = foundPub.publisher_name || q;
    renderExisting(foundPub);
    showPage('results');
  } else {
    $('query-echo').textContent = q;
    showPage('pv');
  }
}

$('pv-btn').addEventListener('click', async () => {
  const pv = Number($('pv-input').value);
  $('pv-err').style.display = 'none';
  if (!pv || pv <= 0) {
    $('pv-err').textContent = 'بازدید روزانه را وارد کنید';
    $('pv-err').style.display = '';
    return;
  }
  setLoading('در حال جستجوی ناشران مشابه...');
  await new Promise(r => setTimeout(r, 300));
  $('bar-query').textContent = `ناشر جدید — ${fmt(pv)} pageview`;
  renderNewPublisher(pv);
  showPage('results');
});

$('pv-back').addEventListener('click', () => {
  $('pv-input').value = '';
  showPage('search');
});

$('new-search-btn').addEventListener('click', () => {
  foundPub = null;
  $('pub-input').value = '';
  $('pv-input').value = '';
  showPage('search');
});
