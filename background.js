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

async function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ynprice_token', 'ynprice_token_expiry'], data => {
      if (!data.ynprice_token) { resolve(null); return; }
      // Invalidate 60 seconds before expiry
      if (Date.now() > (data.ynprice_token_expiry || 0) - 60_000) {
        chrome.storage.local.remove(['ynprice_token', 'ynprice_token_expiry']);
        resolve(null); return;
      }
      resolve(data.ynprice_token);
    });
  });
}

async function startDeviceAuth() {
  const dr = await fetch(KEYCLOAK_DEVICE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=' + CLIENT_ID + '&scope=openid+profile+email+offline_access',
  });
  const device = await dr.json();

  const win = await new Promise(resolve =>
    chrome.windows.create({
      url: device.verification_uri_complete,
      type: 'popup', width: 500, height: 660, focused: true,
    }, resolve)
  );

  const pollMs = Math.max((device.interval || 5), 3) * 1000;

  while (true) {
    await new Promise(r => setTimeout(r, pollMs));
    const tr = await fetch(KEYCLOAK_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn:ietf:params:oauth:grant-type:device_code' +
            '&device_code=' + encodeURIComponent(device.device_code) +
            '&client_id=' + CLIENT_ID,
    });
    const td = await tr.json();
    if (td.access_token) {
      chrome.windows.remove(win.id).catch(() => {});
      await new Promise(r => chrome.storage.local.set({
        ynprice_token: td.access_token,
        ynprice_token_expiry: Date.now() + (td.expires_in || 3600) * 1000,
      }, r));
      return { ok: true };
    }
    if (td.error && td.error !== 'authorization_pending') {
      chrome.windows.remove(win.id).catch(() => {});
      throw new Error(td.error_description || td.error);
    }
  }
}

async function trinoQuery(sql, token) {
  const postResp = await fetch(TRINO_BASE + '/v1/statement', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-Trino-User': 'nashereman-ext',
    },
    body: sql,
  });
  let result = await postResp.json();
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

  const allRows = [];
  let columns = result.columns || null;
  if (result.data) allRows.push(...result.data);

  while (result.nextUri) {
    await new Promise(r => setTimeout(r, 300));
    const pr = await fetch(result.nextUri, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    result = await pr.json();
    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
    if (result.columns) columns = result.columns;
    if (result.data) allRows.push(...result.data);
  }

  return { columns: columns || [], rows: allRows };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_REPORT_VIEWER') {
    chrome.tabs.create({ url: chrome.runtime.getURL('report-viewer.html') });
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
    getStoredToken().then(token => sendResponse({ authed: !!token }));
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
    getStoredToken().then(token => {
      if (!token) return Promise.resolve({ error: 'not_authed' });
      return trinoQuery(msg.sql, token);
    }).then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
    return true; // keeps service worker alive until query completes
  }
});
