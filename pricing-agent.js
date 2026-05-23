'use strict';

// API key loaded from config.js (gitignored — copy config.example.js to create it)
const OPENROUTER_KEY = (typeof CONFIG !== 'undefined' && CONFIG.OPENROUTER_KEY !== 'YOUR_OPENROUTER_KEY_HERE')
  ? CONFIG.OPENROUTER_KEY : '';
const LLM_MODEL = (typeof CONFIG !== 'undefined') ? CONFIG.LLM_MODEL : 'openai/gpt-4o-mini';

// ── State ─────────────────────────────────────────────────────────────────────
let allData     = null;
let foundPub    = null;
let searchQuery = '';
let comparePubs = []; // { appId, name, pub } for comparison mode

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

// ── Position Classification ───────────────────────────────────────────────────
// Returns { key, name } — canonical group for a position based on its description + type.
function classifyPosition(posType, desc) {
  const t = (posType || '').toLowerCase().trim();
  const d = (desc || '').replace(/ی/g, 'ي').replace(/ک/g, 'ك');

  if (t === 'notification')           return { key: 'notification',       name: 'نوتیفیکیشن' };
  if (t === 'pre_roll')               return { key: 'pre_roll',           name: 'پری‌رول' };
  if (t === 'slider')                 return { key: 'slider',             name: 'اسلایدر' };
  if (t === 'banner-sticky' || t === 'footer-sticky')
                                      return { key: 'sticky',             name: 'استیکی' };
  if (t === 'article-display-sticky') return { key: 'native_sticky',      name: 'همسان استیکی' };
  if (t === 'article-display-card')   return { key: 'native_display_mid', name: 'همسان تصویری میان مطلب' };

  if (t === 'article-display') {
    if (/سايدبار|ساید.?بار|نوار جانبي|سمت (چپ|راست)/.test(d))
      return { key: 'native_display_sidebar', name: 'همسان تصویری سایدبار' };
    if (/ميان|بين.?مطلب|بين.?متن|ابتداي|بالاي.?(خبر|مطلب)|زير.?(ليد|عكس)/.test(d))
      return { key: 'native_display_mid',     name: 'همسان تصویری میان مطلب' };
    return { key: 'native_display_end', name: 'همسان تصویری انتهای مطلب' };
  }

  if (t === 'article-text') {
    if (/سايدبار|ساید.?بار|نوار جانبي|سمت (چپ|راست)/.test(d))
      return { key: 'native_text_sidebar', name: 'همسان متنی سایدبار' };
    if (/ميان|بين.?مطلب|ابتداي/.test(d))
      return { key: 'native_text_mid',     name: 'همسان متنی میان مطلب' };
    return { key: 'native_text_end', name: 'همسان متنی انتهای مطلب' };
  }

  // banner-article: check desc for sticky variants
  if (/استيكي/.test(d)) return { key: 'sticky', name: 'استیکی' };
  return { key: 'banner', name: 'بنر' };
}

// ── Compute canonical group stats for a publisher's positions ─────────────────
function computeGroupStats(positions) {
  const groups = {};
  for (const pos of Object.values(positions)) {
    const { key, name } = classifyPosition(pos.type, pos.desc);
    if (!groups[key]) groups[key] = { name, allRows: [], posCount: 0 };
    // Only data from فروردین ۱۴۰۴ onwards
    const filtered = pos.rows.filter(([date]) => {
      const parts = date.split('-').map(Number);
      return gToJ(parts[0], parts[1], parts[2])[0] >= 1404;
    });
    groups[key].allRows.push(...filtered);
    groups[key].posCount++;
  }

  const ORDER = ['notification','pre_roll','slider','sticky','native_sticky','native_display_mid','native_display_end','native_display_sidebar','native_text_mid','native_text_end','native_text_sidebar','banner'];
  const result = [];
  for (const [key, g] of Object.entries(groups)) {
    if (!g.allRows.length) continue;
    const daily = toDaily(g.allRows);
    if (daily.length < 3) continue;
    const rpms   = daily.map(d => d.rpm);
    const recent = daily.slice(-30);
    const avg    = Math.round(mean(recent.map(d => d.rpm)));
    const p50    = Math.round(pct50(rpms));
    const s      = linSlope(daily.slice(-60).map((d, i) => [i, d.rpm]));
    const tAvg   = mean(daily.slice(-60).map(d => d.rpm));
    const trend  = tAvg > 0 ? Math.round((s * 30 / tAvg) * 10) / 10 : 0;
    result.push({ key, name: g.name, posCount: g.posCount, p50, avg, trend, days: daily.length });
  }
  result.sort((a, b) => {
    const ai = ORDER.findIndex(o => a.key.startsWith(o));
    const bi = ORDER.findIndex(o => b.key.startsWith(o));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.key.localeCompare(b.key);
  });
  return result;
}

// ── Render single-publisher canonical group table ─────────────────────────────
function renderGroupTable(groups) {
  if (!groups.length) return '';
  const rows = groups.map(g => {
    const trendStr = g.trend > 2 ? `+${g.trend}٪ ↑` : g.trend < -2 ? `${g.trend}٪ ↓` : 'ثابت';
    const trendCls = g.trend > 2 ? 'trend-up' : g.trend < -2 ? 'trend-dn' : '';
    return `<tr>
      <td>${g.name}</td>
      <td style="text-align:center">${g.posCount}</td>
      <td><strong>${g.p50.toLocaleString()}</strong></td>
      <td>${g.avg.toLocaleString()}</td>
      <td class="${trendCls}">${trendStr}</td>
    </tr>`;
  }).join('');
  return `<div class="section-block">
    <h2 class="md-h2">جایگاه‌ها بر اساس دسته‌بندی</h2>
    <table class="md-table">
      <tr><th>گروه</th><th>تعداد</th><th>RPM میانه</th><th>RPM میانگین</th><th>ترند</th></tr>
      ${rows}
    </table>
  </div>`;
}

// ── Render multi-publisher comparison table ───────────────────────────────────
function renderCompareTable(pubsData) {
  const ORDER = ['notification','pre_roll','slider','sticky','native_sticky','native_display_mid','native_display_end','native_display_sidebar','native_text_mid','native_text_end','native_text_sidebar','banner'];
  const keyMap = new Map(); // key → name
  for (const pub of pubsData) {
    for (const g of pub.groups) {
      if (!keyMap.has(g.key)) keyMap.set(g.key, g.name);
    }
  }
  const sortedKeys = [...keyMap.entries()].sort(([ka], [kb]) => {
    const ai = ORDER.findIndex(o => ka.startsWith(o));
    const bi = ORDER.findIndex(o => kb.startsWith(o));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || ka.localeCompare(kb);
  });

  const headCells = pubsData.map(p =>
    `<th colspan="2" class="pub-col-header">${p.name}<span class="pub-col-id">${p.appId}</span></th>`
  ).join('');
  const subHead = pubsData.map(() => '<th>p50 RPM</th><th>avg RPM</th>').join('');

  const bodyRows = sortedKeys.map(([key, name]) => {
    const cells = pubsData.map(pub => {
      const g = pub.groups.find(x => x.key === key);
      if (!g) return '<td class="cmp-na">—</td><td class="cmp-na">—</td>';
      return `<td><strong>${g.p50.toLocaleString()}</strong></td><td>${g.avg.toLocaleString()}</td>`;
    }).join('');
    return `<tr><td class="grp-name">${name}</td>${cells}</tr>`;
  }).join('');

  return `<div class="section-block">
    <table class="md-table cmp-table">
      <tr><th>گروه جایگاه</th>${headCells}</tr>
      <tr><th></th>${subHead}</tr>
      ${bodyRows}
    </table>
  </div>`;
}

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

// ── Compute publisher-level monthly RPM trend (from فروردین 1404) ────────────
function computeMonthlyTrend(positions) {
  const byYM = {};
  for (const pos of Object.values(positions)) {
    for (const row of pos.rows) {
      const [date, cost, pv] = row;
      const [y, m, d] = date.split('-').map(Number);
      const [jy, jm] = gToJ(y, m, d);
      if (jy < 1404) continue;
      const key = `${jy}-${String(jm).padStart(2, '0')}`;
      if (!byYM[key]) byYM[key] = { cost: 0, pv: 0, jy, jm };
      byYM[key].cost += Number(cost);
      byYM[key].pv   += Number(pv);
    }
  }
  return Object.entries(byYM)
    .filter(([, d]) => d.pv > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, d]) => ({
      label: `${J_MONTHS[d.jm - 1]} ${d.jy}`,
      rpm:   Math.round((d.cost / d.pv) * 1000),
    }));
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

  return { id: posId, desc: desc||type||'—', type: type||'—',
           recent_30d: Math.round(recentAvg), trend_pct: trend,
           hist_median: hist, days: daily.length };
}

// ── Build position context string for LLM ────────────────────────────────────
function buildContext(stats) {
  return stats.map(p => {
    const sign = p.trend_pct > 0 ? '+' : '';
    const dir  = p.trend_pct > 2 ? 'صعودی' : p.trend_pct < -2 ? 'نزولی' : 'ثابت';
    return `▸ ${p.desc} (${p.type}) #${p.id}
  میانگین ۳۰ روز: ${p.recent_30d.toLocaleString()} تومان | ترند: ${sign}${p.trend_pct}٪/ماه [${dir}] | میانه: ${p.hist_median.toLocaleString()} تومان
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
      max_tokens:  1200,
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

// ── Markdown → HTML (with table support) ─────────────────────────────────────
function md(text) {
  const lines = text.split('\n');
  const out   = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        block.push(lines[i]);
        i++;
      }
      out.push(mdTable(block));
    } else {
      out.push(mdLine(line));
      i++;
    }
  }
  return out.join('');
}

function mdTable(lines) {
  const rows = lines.filter(l => !/^\s*\|[-| :]+\|\s*$/.test(l));
  if (!rows.length) return '';
  return '<table class="md-table">' + rows.map((line, idx) => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    const tag = idx === 0 ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  }).join('') + '</table>';
}

function mdLine(line) {
  if (/^## /.test(line))    return line.replace(/^## (.+)$/, '<h2 class="md-h2">$1</h2>');
  if (/^### /.test(line))   return line.replace(/^### (.+)$/, '<h3 class="md-h3">$1</h3>');
  if (/^---$/.test(line))   return '<hr class="md-hr">';
  if (/^[•\-] /.test(line)) return line.replace(/^[•\-] (.+)$/, '<div class="md-bullet">• $1</div>');
  line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  if (!line.trim()) return '';
  return line + '<br>';
}

// ── Core: run LLM analysis and stream into the page ───────────────────────────
async function runAnalysis(pubName, appId, stats, extraContext, monthlyTrend) {
  const [jy, jm] = todayJalali();

  const SYSTEM = `تو متخصص قیمت‌گذاری تبلیغات دیجیتال در شبکه یکتانت هستی.
وظیفه: تعیین RPM تضمینی پیشنهادی به ناشران برای قراردادهای آینده.
RPM = درآمد به ازای هر ۱۰۰۰ پیج‌ویو (واحد: تومان).
تاریخ امروز: ${J_MONTHS[jm-1]} ${jy}.

جدول دسته‌بندی جایگاه‌ها قبلاً نمایش داده شده. فقط یک بخش تحلیلی بنویس:

## تحلیل و پیش‌بینی
پنج تا شش جمله: روند کلی چند ماه گذشته، فصلیت، مقایسه گروه‌های جایگاه با یکدیگر، و RPM پیشنهادی برای قراردادهای آینده به تفکیک مهم‌ترین گروه‌ها.

**توصیه تیم فروش:** [یک جمله عملی]

اصول:
- اعداد را با کاما جدا کن (مثلاً ۱۲,۳۴۵).
- RPM پیشنهادی باید واقع‌بینانه و نزدیک به میانه تاریخی باشد.
- اگر ترند صعودی است، کمی بالاتر از میانه پیشنهاد بده.
- فصلیت ماه‌های آینده را در نظر بگیر.`;

  const trendCtx = monthlyTrend?.length
    ? `ترند ماهانه کل ناشر (از فروردین ۱۴۰۴):\n${monthlyTrend.map(m => `${m.label}: ${m.rpm.toLocaleString()} تومان`).join('\n')}`
    : '';

  let USER = `ناشر: ${pubName} (${appId})\n\n`;
  if (extraContext) USER += extraContext + '\n\n';
  if (trendCtx)    USER += trendCtx + '\n\n';
  USER += buildContext(stats);

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

// ── Setup results page ────────────────────────────────────────────────────────
function setupResults(queryLabel, monthlyTrend, groups, staticHtml) {
  $('bar-query').textContent = queryLabel;

  let trendHtml = '';
  if (monthlyTrend && monthlyTrend.length) {
    const rows = monthlyTrend.map(m =>
      `<tr><td>${m.label}</td><td>${m.rpm.toLocaleString()}</td></tr>`
    ).join('');
    trendHtml = `<div class="section-block">
      <h2 class="md-h2">ترند ماهانه RPM</h2>
      <table class="md-table">
        <tr><th>ماه</th><th>RPM (تومان)</th></tr>
        ${rows}
      </table>
    </div>`;
  }

  const groupHtml  = groups    ? renderGroupTable(groups) : '';
  const extraHtml  = staticHtml || '';

  $('results-body').innerHTML = `
    ${trendHtml}
    ${groupHtml}
    ${extraHtml}
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

  const monthlyTrend = computeMonthlyTrend(pub.positions);
  const groups       = computeGroupStats(pub.positions);

  // Map groups to stats format for LLM context
  const stats = groups.map(g => ({
    id: g.key, desc: g.name, type: g.key,
    recent_30d: g.avg, trend_pct: g.trend, hist_median: g.p50, days: g.days,
  }));

  setupResults(pub.publisher_name || pub.appId, monthlyTrend, groups);
  showPage('results');
  await runAnalysis(pub.publisher_name || pub.appId, pub.appId, stats, null, monthlyTrend);
}

// ── Render new publisher (from similar) ──────────────────────────────────────
async function renderNewPub(targetPV) {
  const similar = findSimilar(targetPV, null);

  $('pub-row').innerHTML = `
    <span class="pub-row-name">ناشر جدید</span>
    <span class="pub-row-meta">${similar.length} ناشر مشابه · ${fmt(targetPV)} pageview/روز</span>`;

  if (!similar.length) {
    setupResults(`ناشر جدید — ${fmt(targetPV)} pageview`, null);
    showPage('results');
    $('results-body').innerHTML = `<p style="color:#aaa;padding:40px 0;text-align:center;font-size:0.9rem;">ناشر مشابهی یافت نشد.</p>`;
    return;
  }

  // Pool all positions from similar publishers
  const pooledPositions = {};
  for (const { pub } of similar) {
    for (const [posId, pos] of Object.entries(pub.positions)) {
      pooledPositions[posId] = pos;
    }
  }

  const monthlyTrend = computeMonthlyTrend(pooledPositions);
  const groups       = computeGroupStats(pooledPositions);
  const stats        = groups.map(g => ({
    id: g.key, desc: g.name, type: g.key,
    recent_30d: g.avg, trend_pct: g.trend, hist_median: g.p50, days: g.days,
  }));

  const extra = `ناشر جدید — در داده‌ها یافت نشد\nبازدید روزانه: ${fmt(targetPV)} پیج‌ویو\nتحلیل بر اساس ${similar.length} ناشر مشابه (از نظر حجم ترافیک):`;
  setupResults(`ناشر جدید — ${fmt(targetPV)} pageview`, monthlyTrend, groups);
  showPage('results');
  await runAnalysis('ناشر جدید', '—', stats, extra, monthlyTrend);
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
    `<div class="sug-item" data-appid="${it.appId}" data-name="${it.name}" data-idx="${i}">
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

// Load data in background so autocomplete is ready immediately
window.addEventListener('load', () => {
  loadData().catch(() => {});
});

$('suggestions').addEventListener('mousedown', e => {
  const item = e.target.closest('.sug-item');
  if (!item) return;
  e.preventDefault();
  $('pub-input').value = item.dataset.name || item.dataset.appid;
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
      const active = items[acIndex];
      $('pub-input').value = active.dataset.name || active.dataset.appid;
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
  await renderNewPub(pv);
});

$('pv-back').addEventListener('click', () => { $('pv-input').value = ''; showPage('search'); });

$('new-search-btn').addEventListener('click', () => {
  foundPub = null;
  comparePubs = [];
  $('pub-input').value = '';
  $('pv-input').value = '';
  renderCmpChips();
  showPage('search');
});

// ── Mode toggle ───────────────────────────────────────────────────────────────
$('mode-single-btn').addEventListener('click', () => {
  $('mode-single-btn').classList.add('active');
  $('mode-compare-btn').classList.remove('active');
  $('single-wrap').style.display = '';
  $('compare-wrap').style.display = 'none';
});

$('mode-compare-btn').addEventListener('click', () => {
  $('mode-compare-btn').classList.add('active');
  $('mode-single-btn').classList.remove('active');
  $('single-wrap').style.display = 'none';
  $('compare-wrap').style.display = '';
  loadData().catch(() => {});
});

// ── Compare chip management ───────────────────────────────────────────────────
function renderCmpChips() {
  $('cmp-chips').innerHTML = comparePubs.map(p =>
    `<div class="cmp-chip">
      <span>${p.name}</span>
      <button class="cmp-chip-rm" data-appid="${p.appId}">×</button>
    </div>`
  ).join('');
  $('cmp-go-btn').style.display  = comparePubs.length >= 2 ? '' : 'none';
  $('cmp-hint').textContent = comparePubs.length < 2
    ? 'حداقل ۲ ناشر اضافه کنید'
    : `${comparePubs.length} ناشر انتخاب شده — می‌توانید تا ۴ ناشر اضافه کنید`;
}

$('cmp-chips').addEventListener('click', e => {
  const btn = e.target.closest('.cmp-chip-rm');
  if (!btn) return;
  comparePubs = comparePubs.filter(p => p.appId !== btn.dataset.appid);
  renderCmpChips();
});

function addComparePub(appId, name, pub) {
  if (comparePubs.find(p => p.appId === appId)) return;
  if (comparePubs.length >= 4) return;
  comparePubs.push({ appId, name, pub });
  renderCmpChips();
}

// ── Compare autocomplete ──────────────────────────────────────────────────────
let cmpAcIndex = -1;

function renderCmpSuggestions(items) {
  const box = $('cmp-suggestions');
  if (!items.length) { box.style.display = 'none'; return; }
  box.innerHTML = items.map((it, i) =>
    `<div class="sug-item" data-appid="${it.appId}" data-name="${it.name}" data-idx="${i}">
       <span class="sug-name">${it.name}</span>
       <span class="sug-id">${it.appId}</span>
     </div>`
  ).join('');
  box.style.display = '';
  cmpAcIndex = -1;
}

function highlightCmpSug(idx) {
  $('cmp-suggestions').querySelectorAll('.sug-item')
    .forEach((el, i) => el.classList.toggle('sug-active', i === idx));
}

function addFromCmpSug(appId, name) {
  const pub = allData[appId];
  if (!pub) return;
  addComparePub(appId, name || pub.publisher_name || appId, pub);
  $('cmp-input').value = '';
  $('cmp-suggestions').style.display = 'none';
  cmpAcIndex = -1;
}

$('cmp-input').addEventListener('input', () => {
  renderCmpSuggestions(getSuggestions($('cmp-input').value));
});

$('cmp-input').addEventListener('keydown', e => {
  const box   = $('cmp-suggestions');
  const items = box.querySelectorAll('.sug-item');
  if (box.style.display !== 'none' && items.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmpAcIndex = Math.min(cmpAcIndex+1, items.length-1); highlightCmpSug(cmpAcIndex); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); cmpAcIndex = Math.max(cmpAcIndex-1, -1); highlightCmpSug(cmpAcIndex); return; }
    if (e.key === 'Enter' && cmpAcIndex >= 0) {
      e.preventDefault();
      const a = items[cmpAcIndex];
      addFromCmpSug(a.dataset.appid, a.dataset.name);
      return;
    }
    if (e.key === 'Escape') { box.style.display = 'none'; return; }
  }
  if (e.key === 'Enter') {
    const first = box.querySelector('.sug-item');
    if (first) addFromCmpSug(first.dataset.appid, first.dataset.name);
  }
});

$('cmp-suggestions').addEventListener('mousedown', e => {
  const item = e.target.closest('.sug-item');
  if (!item) return;
  e.preventDefault();
  addFromCmpSug(item.dataset.appid, item.dataset.name);
});

document.addEventListener('click', e => {
  if (!e.target.closest('#compare-wrap')) $('cmp-suggestions').style.display = 'none';
});

// ── Render comparison results ─────────────────────────────────────────────────
$('cmp-go-btn').addEventListener('click', async () => {
  if (comparePubs.length < 2) return;
  $('loading-msg').textContent = 'در حال محاسبه مقایسه...';
  showPage('loading');
  await renderComparison();
});

async function renderComparison() {
  const pubsData = comparePubs.map(p => ({
    name: p.name, appId: p.appId,
    groups: computeGroupStats(p.pub.positions),
  }));

  const nameList = pubsData.map(p => p.name).join(' · ');
  $('bar-query').textContent = nameList;
  $('pub-row').innerHTML = `
    <span class="pub-row-name">مقایسه ناشران</span>
    <span class="pub-row-meta">${pubsData.length} ناشر</span>`;

  const cmpHtml = renderCompareTable(pubsData);
  $('results-body').innerHTML = `
    ${cmpHtml}
    <div id="stream-output" class="stream-output">
      <span style="color:#ccc;font-size:0.88rem;">در حال تحلیل مقایسه...</span>
    </div>
    <span id="stream-cursor" class="stream-cursor"></span>`;

  showPage('results');

  // Build LLM context
  const [jy, jm] = todayJalali();
  const groupsCtx = pubsData.map(p => {
    const gs = p.groups.map(g =>
      `  ${g.name}: p50=${g.p50.toLocaleString()} | avg=${g.avg.toLocaleString()} | ترند=${g.trend}٪/ماه`
    ).join('\n');
    return `### ${p.name} (${p.appId})\n${gs}`;
  }).join('\n\n');

  const CMP_SYSTEM = `تو متخصص قیمت‌گذاری تبلیغات دیجیتال در شبکه یکتانت هستی.
وظیفه: مقایسه ناشران و ارائه RPM تضمینی پیشنهادی به تفکیک گروه جایگاه.
RPM = درآمد به ازای هر ۱۰۰۰ پیج‌ویو (واحد: تومان).
تاریخ امروز: ${J_MONTHS[jm-1]} ${jy}.
جدول مقایسه قبلاً نمایش داده شده. فقط یک تحلیل مقایسه‌ای کوتاه بنویس (۴-۵ جمله) و RPM پیشنهادی برای هر گروه مهم ارائه بده.`;

  const CMP_USER = `مقایسه ناشران زیر:\n\n${groupsCtx}`;

  const outEl = $('stream-output');
  const curEl = $('stream-cursor');
  let text = '';
  try {
    for await (const chunk of streamLLM(CMP_SYSTEM, CMP_USER)) {
      text += chunk;
      outEl.innerHTML = md(text);
    }
  } catch (e) {
    outEl.innerHTML += `<div class="api-err">⚠️ ${e.message}</div>`;
  } finally {
    if (curEl) curEl.remove();
  }
}
