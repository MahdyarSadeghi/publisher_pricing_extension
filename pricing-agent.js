'use strict';

// API key loaded from config.js (gitignored — copy config.example.js to create it)
const OPENROUTER_KEY = (typeof CONFIG !== 'undefined' && CONFIG.OPENROUTER_KEY !== 'YOUR_OPENROUTER_KEY_HERE')
  ? CONFIG.OPENROUTER_KEY : '';
const LLM_MODEL = (typeof CONFIG !== 'undefined') ? CONFIG.LLM_MODEL : 'openai/gpt-4o-mini';

// ── State ─────────────────────────────────────────────────────────────────────
let allData     = null;
let foundPub    = null;
let searchQuery = '';

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showPage(name) {
  const show = { search: 'flex', pv: 'flex', loading: 'flex', results: 'block' };
  for (const [p, disp] of Object.entries(show)) {
    const el = $('page-' + p);
    if (el) el.style.display = p === name ? disp : 'none';
  }
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
const mean  = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const pct50 = arr => { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };

function linSlope(pairs) {
  const n = pairs.length;
  if (n < 4) return 0;
  let sx=0,sy=0,sxy=0,sxx=0;
  for (const [x,y] of pairs) { sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; }
  const d = n*sxx - sx*sx;
  return d ? (n*sxy - sx*sy)/d : 0;
}

// ── Jalali ────────────────────────────────────────────────────────────────────
function gToJ(gy, gm, gd) {
  const g_dm = [31,28+(gy%4===0&&(gy%100!==0||gy%400===0)?1:0),31,30,31,30,31,31,30,31,30,31];
  let g_d = 365*gy + Math.floor((gy+3)/4) - Math.floor((gy+99)/100) + Math.floor((gy+399)/400);
  for (let i=0; i<gm-1; i++) g_d += g_dm[i];
  g_d += gd;
  let j_d = g_d - 79;
  const j_np = Math.floor(j_d/12053); j_d %= 12053;
  let jy = 979 + 33*j_np + 4*Math.floor(j_d/1461); j_d %= 1461;
  if (j_d >= 366) { jy += Math.floor((j_d-1)/365); j_d = (j_d-1)%365; }
  const jm_d = [31,31,31,31,31,31,30,30,30,30,30,29];
  let jm = 0;
  for (let i=0; i<11 && j_d>=jm_d[i]; i++) { j_d -= jm_d[i]; jm++; }
  return [jy, jm+1, j_d+1];
}

const J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

function todayJalali() {
  const n = new Date();
  return gToJ(n.getFullYear(), n.getMonth()+1, n.getDate());
}

// ── Aggregate rows → daily RPMs ───────────────────────────────────────────────
function toDaily(rows) {
  const by = {};
  for (const [date, cost, pv] of rows) {
    if (!by[date]) by[date] = { c:0, p:0 };
    by[date].c += Number(cost);
    by[date].p += Number(pv);
  }
  return Object.entries(by)
    .filter(([,d]) => d.p > 0)
    .map(([date,{c,p}]) => ({ date, rpm: (c/p)*1000 }))
    .sort((a,b) => a.date.localeCompare(b.date));
}

// ── Compute position stats for LLM context ───────────────────────────────────
function computeStats(posId, desc, type, rows) {
  const daily = toDaily(rows);
  if (daily.length < 7) return null;

  const recent    = daily.slice(-30);
  const recentAvg = mean(recent.map(d => d.rpm));

  const tw    = daily.slice(-60);
  const s     = linSlope(tw.map((d,i) => [i, d.rpm]));
  const tAvg  = mean(tw.map(d => d.rpm));
  const trend = tAvg > 0 ? Math.round((s*30/tAvg)*1000)/10 : 0; // %/month

  const hist = Math.round(pct50(daily.map(d => d.rpm)));

  const byJM = {};
  for (const {date, rpm} of daily) {
    const [y,m,d] = date.split('-').map(Number);
    const [,jm] = gToJ(y,m,d);
    if (!byJM[jm]) byJM[jm] = [];
    byJM[jm].push(rpm);
  }
  const monthly = {};
  for (const [m, rpms] of Object.entries(byJM)) monthly[Number(m)] = Math.round(mean(rpms));

  return { id: posId, desc: desc||type||'—', type: type||'—',
           recent_30d: Math.round(recentAvg), trend_pct: trend,
           hist_median: hist, monthly, days: daily.length };
}

// ── Build structured context string for LLM ───────────────────────────────────
function buildContext(stats) {
  return stats.map(p => {
    const sign = p.trend_pct > 0 ? '+' : '';
    const dir  = p.trend_pct > 2 ? 'صعودی' : p.trend_pct < -2 ? 'نزولی' : 'ثابت';
    const months = Object.entries(p.monthly)
      .sort(([a],[b]) => Number(a)-Number(b))
      .map(([m,v]) => `${J_MONTHS[Number(m)-1].slice(0,3)}:${v.toLocaleString()}`)
      .join('  ');
    return `▸ ${p.desc} (${p.type}) #${p.id}
  میانگین ۳۰ روز: ${p.recent_30d.toLocaleString()} تومان | ترند: ${sign}${p.trend_pct}٪/ماه [${dir}] | میانه: ${p.hist_median.toLocaleString()} تومان
  ماهانه: ${months}
  داده: ${p.days} روز`;
  }).join('\n\n');
}

// ── OpenRouter streaming call ─────────────────────────────────────────────────
async function* streamLLM(system, user) {
  if (!OPENROUTER_KEY) {
    throw new Error('فایل config.js یافت نشد یا API key تنظیم نشده — فایل config.example.js را کپی کنید به config.js و key را وارد کنید');
  }
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer':  'https://yektanet.com',
      'X-Title':       'Publisher Pricing Agent',
    },
    body: JSON.stringify({
      model:       LLM_MODEL,
      stream:      true,
      max_tokens:  1600,
      temperature: 0.2,
      messages:    [{ role:'system', content:system }, { role:'user', content:user }],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`خطای API (${resp.status})${txt ? ': ' + txt.slice(0,150) : ''}`);
  }

  const reader = resp.body.getReader();
  const dec    = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {}
    }
  }
}

// ── Minimal markdown → HTML ───────────────────────────────────────────────────
function md(text) {
  return text
    .replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^---$/gm, '<hr class="md-hr">')
    .replace(/^[•\-] (.+)$/gm, '<div class="md-bullet">• $1</div>')
    .replace(/\n/g, '<br>');
}

// ── Core: run LLM analysis and stream into the page ───────────────────────────
async function runAnalysis(pubName, appId, stats, extraContext) {
  const [jy, jm] = todayJalali();

  const SYSTEM = `تو متخصص قیمت‌گذاری تبلیغات دیجیتال در شبکه یکتانت هستی.
وظیفه: تعیین RPM تضمینی پیشنهادی به ناشران برای قراردادهای آینده.
RPM = درآمد به ازای هر ۱۰۰۰ پیج‌ویو (واحد: تومان).
تاریخ امروز: ${J_MONTHS[jm-1]} ${jy}.

اصول:
- برای هر جایگاه یک عدد دقیق بده (نه بازه).
- یک جمله دلیل: ترند + فصلیت + مقایسه با میانه.
- اگر ترند صعودی است، بالاتر از میانه پیشنهاد بده.
- اگر ماه آینده تاریخاً بهتر/بدتر است، در عدد لحاظ کن.
- در انتها یک توصیه کوتاه برای تیم فروش.

فرمت دقیق:
## [نام ناشر]
[یک جمله وضعیت کلی]

### [نام جایگاه] · [نوع] · #[شناسه]
**پیشنهاد: [عدد] تومان RPM**
[دلیل — یک جمله]

---
**توصیه تیم فروش:** [یک جمله عملی]`;

  const context = buildContext(stats);
  const USER = extraContext
    ? `${extraContext}\n\n${context}`
    : `ناشر: ${pubName} (${appId})\n\n${context}`;

  const outEl = $('stream-output');
  const curEl = $('stream-cursor');

  let text = '';
  try {
    for await (const chunk of streamLLM(SYSTEM, USER)) {
      text += chunk;
      outEl.innerHTML = md(text);
    }
  } catch (e) {
    outEl.innerHTML += `<div class="api-err">⚠️ ${e.message}</div>`;
  } finally {
    if (curEl) curEl.remove();
  }
}

// ── Average daily PV (for similarity) ────────────────────────────────────────
function avgDailyPV(pub) {
  const rows = Object.values(pub.positions)[0]?.rows;
  if (!rows?.length) return 0;
  const by = {};
  for (const [date,,pv] of rows) by[date] = (by[date]||0) + Number(pv);
  const v = Object.values(by);
  return v.length ? mean(v) : 0;
}

function findSimilar(targetPV, excludeId) {
  const out = [];
  for (const [appId, pub] of Object.entries(allData)) {
    if (appId === excludeId) continue;
    const pv = avgDailyPV(pub);
    if (!pv) continue;
    const r = targetPV / pv;
    if (r >= 0.2 && r <= 5) out.push({ appId, pub, r });
  }
  return out.sort((a,b) => Math.abs(Math.log(a.r)) - Math.abs(Math.log(b.r))).slice(0, 15);
}

// ── Setup results page shell ──────────────────────────────────────────────────
function setupResults(queryLabel) {
  $('bar-query').textContent = queryLabel;
  $('results-body').innerHTML = `
    <div id="stream-output" class="stream-output">
      <span style="color:#ccc;font-size:0.88rem;">در حال تحلیل...</span>
    </div>
    <span id="stream-cursor" class="stream-cursor"></span>`;
}

// ── Render existing publisher ─────────────────────────────────────────────────
async function renderExisting(pub) {
  $('pub-row').innerHTML = `
    <span class="pub-row-name">${pub.publisher_name || pub.appId}</span>
    <span class="pub-row-id">${pub.appId}</span>
    <span class="pub-row-meta">${Object.keys(pub.positions).length} جایگاه</span>`;

  const stats = Object.entries(pub.positions)
    .map(([id, p]) => computeStats(id, p.desc, p.type, p.rows))
    .filter(Boolean);

  await runAnalysis(pub.publisher_name || pub.appId, pub.appId, stats, null);
}

// ── Render new publisher (from similar) ──────────────────────────────────────
async function renderNewPub(targetPV) {
  const similar = findSimilar(targetPV, null);

  $('pub-row').innerHTML = `
    <span class="pub-row-name">ناشر جدید</span>
    <span class="pub-row-meta">${similar.length} ناشر مشابه · ${fmt(targetPV)} pageview/روز</span>`;

  if (!similar.length) {
    $('results-body').innerHTML = `<p style="color:#aaa;padding:40px 0;text-align:center;font-size:0.9rem;">ناشر مشابهی یافت نشد.</p>`;
    return;
  }

  // Pool rows by position type
  const byType = {};
  for (const { pub } of similar)
    for (const pos of Object.values(pub.positions)) {
      const t = pos.type || 'unknown';
      if (!byType[t]) byType[t] = [];
      byType[t].push(...pos.rows);
    }

  const stats = Object.entries(byType)
    .map(([type, rows]) => computeStats('—', type, type, rows))
    .filter(Boolean);

  const extra = `ناشر جدید — در داده‌ها یافت نشد\nبازدید روزانه: ${fmt(targetPV)} پیج‌ویو\nتحلیل بر اساس ${similar.length} ناشر مشابه (از نظر حجم ترافیک):`;
  await runAnalysis('ناشر جدید', '—', stats, extra);
}

// ── Format ────────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fa-IR');
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
let acIndex = -1;

function getSuggestions(q) {
  if (!allData || !q || q.length < 2) return [];
  q = q.toLowerCase();
  const results = [];
  for (const [appId, pub] of Object.entries(allData)) {
    const nameMatch = pub.publisher_name?.toLowerCase().includes(q);
    const idMatch   = appId.toLowerCase().includes(q);
    if (nameMatch || idMatch) results.push({ appId, name: pub.publisher_name || appId });
    if (results.length >= 8) break;
  }
  return results;
}

function renderSuggestions(items) {
  const box = $('suggestions');
  if (!items.length) { box.style.display = 'none'; return; }
  box.innerHTML = items.map((it, i) =>
    `<div class="sug-item" data-appid="${it.appId}" data-idx="${i}">
       <span class="sug-name">${it.name}</span>
       <span class="sug-id">${it.appId}</span>
     </div>`
  ).join('');
  box.style.display = '';
  acIndex = -1;
}

function closeSuggestions() {
  $('suggestions').style.display = 'none';
  acIndex = -1;
}

function highlightSuggestion(idx) {
  const items = $('suggestions').querySelectorAll('.sug-item');
  items.forEach((el, i) => el.classList.toggle('sug-active', i === idx));
}

// Load data in background so autocomplete is ready
window.addEventListener('load', () => {
  loadData().catch(() => {});
});

$('suggestions').addEventListener('mousedown', e => {
  const item = e.target.closest('.sug-item');
  if (!item) return;
  e.preventDefault();
  $('pub-input').value = item.dataset.appid;
  closeSuggestions();
  handleSearch();
});

$('pub-input').addEventListener('input', () => {
  const q = $('pub-input').value;
  renderSuggestions(getSuggestions(q));
});

$('pub-input').addEventListener('keydown', e => {
  const box   = $('suggestions');
  const items = box.querySelectorAll('.sug-item');
  if (box.style.display !== 'none' && items.length) {
    if (e.key === 'ArrowDown')  { e.preventDefault(); acIndex = Math.min(acIndex+1, items.length-1); highlightSuggestion(acIndex); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); acIndex = Math.max(acIndex-1, -1); highlightSuggestion(acIndex); return; }
    if (e.key === 'Enter' && acIndex >= 0) {
      e.preventDefault();
      $('pub-input').value = items[acIndex].dataset.appid;
      closeSuggestions();
      handleSearch();
      return;
    }
    if (e.key === 'Escape') { closeSuggestions(); return; }
  }
  if (e.key === 'Enter') handleSearch();
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap-pos')) closeSuggestions();
});

// ── Event handlers ────────────────────────────────────────────────────────────
$('search-btn').addEventListener('click', handleSearch);

async function handleSearch() {
  const q = $('pub-input').value.trim();
  if (!q) return;
  searchQuery = q;
  $('home-err').style.display = 'none';

  $('loading-msg').textContent = 'در حال جستجو...';
  showPage('loading');

  try { await loadData(); }
  catch (e) {
    $('home-err').textContent = e.message;
    $('home-err').style.display = '';
    showPage('search');
    return;
  }

  foundPub = searchPublisher(q);

  if (foundPub) {
    setupResults(foundPub.publisher_name || q);
    showPage('results');
    await renderExisting(foundPub);
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
  setupResults(`ناشر جدید — ${fmt(pv)} pageview`);
  showPage('results');
  await renderNewPub(pv);
});

$('pv-back').addEventListener('click', () => { $('pv-input').value = ''; showPage('search'); });

$('new-search-btn').addEventListener('click', () => {
  foundPub = null;
  $('pub-input').value = '';
  $('pv-input').value = '';
  showPage('search');
});
