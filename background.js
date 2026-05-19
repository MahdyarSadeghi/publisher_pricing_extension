const KEYCLOAK_DEVICE = 'https://heimdall.yektanet.tech/realms/Tech/protocol/openid-connect/auth/device';
const KEYCLOAK_TOKEN  = 'https://heimdall.yektanet.tech/realms/Tech/protocol/openid-connect/token';
const CLIENT_ID       = 'trino';
const TRINO_BASE      = 'https://trino.data-infra:8443';

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (err) {
    console.error('Failed to inject content script:', err);
  }
});

// ── Token storage ─────────────────────────────────────────────────────────────
async function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ynprice_token', 'ynprice_token_expiry'], data => {
      if (!data.ynprice_token) { resolve(null); return; }
      if (Date.now() > (data.ynprice_token_expiry || 0) - 60_000) {
        chrome.storage.local.remove(['ynprice_token', 'ynprice_token_expiry']);
        resolve(null); return;
      }
      resolve(data.ynprice_token);
    });
  });
}

// ── Network error → human-readable Persian message ───────────────────────────
function networkErrMsg(e) {
  const m = (e && e.message) || String(e);
  if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('network')) {
    return 'اتصال به سرور برقرار نشد — VPN فعال باشد و گواهی CA داخلی شرکت در Chrome نصب باشد';
  }
  if (m.includes('ERR_CERT') || m.includes('certificate') || m.includes('SSL') || m.includes('TLS')) {
    return 'گواهی SSL نامعتبر — گواهی CA داخلی شرکت را در تنظیمات Chrome نصب کنید';
  }
  if (m.includes('ERR_NAME_NOT_RESOLVED') || m.includes('getaddrinfo')) {
    return 'آدرس سرور Trino پیدا نشد — VPN متصل است؟';
  }
  if (m.includes('ERR_CONNECTION_REFUSED')) {
    return 'سرور Trino پاسخ نمی‌دهد — پورت ۸۴۴۳ باز باشد';
  }
  return m;
}

// ── Read error body safely ────────────────────────────────────────────────────
async function readErrBody(resp) {
  try { return (await resp.text()).slice(0, 300); } catch (_) { return ''; }
}

// ── Keycloak device flow ──────────────────────────────────────────────────────
async function startDeviceAuth() {
  // 1. Request device code
  let device;
  try {
    const dr = await fetch(KEYCLOAK_DEVICE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=' + CLIENT_ID + '&scope=openid+profile+email+offline_access',
    });
    if (!dr.ok) {
      const body = await readErrBody(dr);
      throw new Error('Keycloak ' + dr.status + (body ? ': ' + body : ''));
    }
    device = await dr.json();
  } catch (e) {
    throw new Error('خطا در اتصال به سرور احراز هویت: ' + networkErrMsg(e));
  }

  if (!device.verification_uri_complete || !device.device_code) {
    throw new Error('پاسخ نامعتبر از Keycloak — فیلد device_code یا verification_uri_complete خالی است');
  }

  // 2. Open auth popup
  const win = await new Promise(resolve =>
    chrome.windows.create({
      url: device.verification_uri_complete,
      type: 'popup', width: 500, height: 660, focused: true,
    }, resolve)
  );

  // 3. Detect if user manually closes the window
  let windowClosed = false;
  const onRemoved = (id) => { if (id === win.id) windowClosed = true; };
  chrome.windows.onRemoved.addListener(onRemoved);

  const pollMs    = Math.max((device.interval || 5), 3) * 1000;
  const TIMEOUT   = 10 * 60 * 1000; // 10 minutes
  const startedAt = Date.now();

  try {
    while (true) {
      if (windowClosed) throw new Error('پنجره احراز هویت بسته شد — دوباره تلاش کنید');
      if (Date.now() - startedAt > TIMEOUT) {
        chrome.windows.remove(win.id).catch(() => {});
        throw new Error('مهلت احراز هویت به پایان رسید (۱۰ دقیقه) — دوباره کلیک کنید');
      }

      await new Promise(r => setTimeout(r, pollMs));

      let td;
      try {
        const tr = await fetch(KEYCLOAK_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=urn:ietf:params:oauth:grant-type:device_code' +
                '&device_code=' + encodeURIComponent(device.device_code) +
                '&client_id=' + CLIENT_ID,
        });
        td = await tr.json();
      } catch (e) {
        // Network hiccup during polling — keep trying
        console.warn('Auth poll error (retrying):', e);
        continue;
      }

      if (td.access_token) {
        chrome.windows.remove(win.id).catch(() => {});
        await new Promise(r => chrome.storage.local.set({
          ynprice_token: td.access_token,
          ynprice_token_expiry: Date.now() + (td.expires_in || 3600) * 1000,
        }, r));
        return { ok: true };
      }

      if (td.error === 'expired_token') {
        chrome.windows.remove(win.id).catch(() => {});
        throw new Error('کد احراز هویت منقضی شد — دوباره کلیک کنید');
      }
      if (td.error && td.error !== 'authorization_pending' && td.error !== 'slow_down') {
        chrome.windows.remove(win.id).catch(() => {});
        throw new Error(td.error_description || td.error);
      }
      // slow_down: double the interval once
      if (td.error === 'slow_down') await new Promise(r => setTimeout(r, pollMs));
    }
  } finally {
    chrome.windows.onRemoved.removeListener(onRemoved);
  }
}

// ── Trino REST query ──────────────────────────────────────────────────────────
async function trinoQuery(sql, token) {
  const authHdr = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };

  // POST statement
  let resp;
  try {
    resp = await fetch(TRINO_BASE + '/v1/statement', {
      method: 'POST',
      headers: {
        ...authHdr,
        // Trino expects SQL body as raw bytes
        'Content-Type': 'application/octet-stream',
        'X-Trino-User':   'nashereman-ext',
        'X-Trino-Source': 'chrome-extension',
      },
      body: sql,
    });
  } catch (e) {
    throw new Error(networkErrMsg(e));
  }

  if (!resp.ok) {
    const body = await readErrBody(resp);
    if (resp.status === 401) throw new Error('توکن نامعتبر یا منقضی (۴۰۱) — دوباره وارد شوید');
    if (resp.status === 403) throw new Error('دسترسی مجاز نیست (۴۰۳)');
    throw new Error('خطای Trino HTTP ' + resp.status + (body ? ':\n' + body : ''));
  }

  let result;
  try { result = await resp.json(); }
  catch (_) { throw new Error('پاسخ Trino قابل پردازش نیست (JSON parse error)'); }

  if (result.error) {
    const e = result.error;
    throw new Error('[' + (e.errorName || e.errorType || 'QUERY_ERROR') + '] ' + (e.message || JSON.stringify(e)));
  }

  const allRows = [];
  let columns = result.columns || null;
  if (result.data) allRows.push(...result.data);

  // Poll nextUri until query finishes
  let pollFailures = 0;
  while (result.nextUri) {
    await new Promise(r => setTimeout(r, 300));
    let pr;
    try {
      pr = await fetch(result.nextUri, { headers: authHdr });
    } catch (e) {
      if (++pollFailures > 3) throw new Error('اتصال در حین دریافت نتایج قطع شد: ' + networkErrMsg(e));
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    pollFailures = 0;

    if (!pr.ok) {
      const body = await readErrBody(pr);
      throw new Error('خطای Trino HTTP ' + pr.status + ' (polling)' + (body ? ':\n' + body : ''));
    }

    try { result = await pr.json(); }
    catch (_) { throw new Error('پاسخ polling قابل پردازش نیست'); }

    if (result.error) {
      const e = result.error;
      throw new Error('[' + (e.errorName || e.errorType || 'QUERY_ERROR') + '] ' + (e.message || JSON.stringify(e)));
    }
    if (result.columns) columns = result.columns;
    if (result.data)    allRows.push(...result.data);
  }

  return { columns: columns || [], rows: allRows };
}

// ── Message handlers ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_REPORT_VIEWER') {
    chrome.tabs.create({ url: chrome.runtime.getURL('report-viewer.html') });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_PRICING_AGENT') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pricing-agent.html') });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 82 }, dataUrl => {
      if (chrome.runtime.lastError) { sendResponse(null); return; }
      sendResponse(dataUrl);
    });
    return true;
  }

  if (msg.type === 'GET_AUTH_STATUS') {
    getStoredToken()
      .then(token => sendResponse({ authed: !!token }))
      .catch(e => sendResponse({ authed: false, error: e.message }));
    return true;
  }

  if (msg.type === 'START_AUTH') {
    startDeviceAuth()
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ error: e.message }));
    return true; // keeps service worker alive until auth completes
  }

  if (msg.type === 'LOGOUT') {
    chrome.storage.local.remove(['ynprice_token', 'ynprice_token_expiry'],
      () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'QUERY_TRINO') {
    getStoredToken()
      .then(token => {
        if (!token) return Promise.resolve({ error: 'not_authed' });
        return trinoQuery(msg.sql, token);
      })
      .then(r  => sendResponse(r))
      .catch(e => sendResponse({ error: e.message }));
    return true; // keeps service worker alive until query completes
  }
});
