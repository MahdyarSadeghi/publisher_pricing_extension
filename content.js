(function () {
  if (document.getElementById("ynprice-sidebar-container")) {
    const el = document.getElementById("ynprice-sidebar-container");
    el.style.display = el.style.display === "none" ? "block" : "none";
    return;
  }

  // ── Page scan ────────────────────────────────────────────────
  function scanPage() {
    let appId = null;

    document.querySelectorAll("script[src]").forEach((s) => {
      if (!appId) {
        const m = s.src.match(/cdn\.yektanet\.com\/superscript\/([^/]+)\//);
        if (m) appId = m[1];
      }
    });
    if (!appId) {
      const m = document.documentElement.innerHTML.match(
        /cdn\.yektanet\.com\/superscript\/([^/]+)\//
      );
      if (m) appId = m[1];
    }

    const allIds = new Set();
    const re = /id=["']ynpos-(\d+)["']/g;
    let match;
    while ((match = re.exec(document.documentElement.innerHTML)) !== null) {
      allIds.add(match[1]);
    }
    document.querySelectorAll('[id^="ynpos-"]').forEach((el) => {
      allIds.add(el.id.replace("ynpos-", ""));
    });

    return { appId, positionIds: [...allIds] };
  }

  // ── Sidebar iframe ───────────────────────────────────────────
  const container = document.createElement("div");
  container.id = "ynprice-sidebar-container";
  container.style.cssText =
    "position:fixed;top:0;right:0;width:360px;height:100vh;z-index:2147483647;box-shadow:-4px 0 20px rgba(0,0,0,0.25);";

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidebar.html");
  iframe.style.cssText = "width:100%;height:100%;border:none;";
  container.appendChild(iframe);
  document.body.appendChild(container);

  const scanData = scanPage();

  iframe.addEventListener("load", () => {
    iframe.contentWindow.postMessage(
      {
        type: "SCAN_RESULT",
        appId: scanData.appId,
        positionIds: scanData.positionIds,
        pageUrl: window.location.href,
        pageTitle: document.title,
      },
      "*"
    );
  });

  // Close sidebar via postMessage from iframe
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "CLOSE_SIDEBAR") {
      container.style.display = "none";
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "TAKE_SCREENSHOTS") {
      sendResponse({ ok: true });
      takeScreenshots(msg.positionIds || []).catch(e => console.error("ynprice screenshot:", e));
      return false;
    }
  });

  async function takeScreenshots(positionIds) {
    const MAX_MS = 28000;
    const start = Date.now();
    const screenshots = {};
    for (const posId of positionIds) {
      if (Date.now() - start > MAX_MS) break;
      const el = document.getElementById("ynpos-" + posId);
      if (!el) continue;
      const s = window.getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || el.offsetWidth === 0) continue;
      el.style.outline = "3px solid #e53935";
      el.style.outlineOffset = "2px";
      el.scrollIntoView({ behavior: "instant", block: "center" });
      await sleep(300);
      const rect = el.getBoundingClientRect();
      const dataUrl = await captureTab();
      el.style.outline = "";
      el.style.outlineOffset = "";
      if (dataUrl && rect.width > 0 && rect.height > 0) {
        const cropped = await cropToRect(dataUrl, rect);
        if (cropped) screenshots[posId] = cropped;
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    if (Object.keys(screenshots).length > 0) {
      const stored = await new Promise(r => chrome.storage.local.get("ynprice_report", r));
      if (stored.ynprice_report) {
        stored.ynprice_report.screenshots = Object.assign(stored.ynprice_report.screenshots || {}, screenshots);
        await new Promise(r => chrome.storage.local.set({ ynprice_report: stored.ynprice_report }, r));
      }
    }
  }

  async function captureTab() {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve(null), 4000);
      try {
        chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, res => {
          clearTimeout(t);
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res || null);
        });
      } catch(e) { clearTimeout(t); resolve(null); }
    });
  }

  async function cropToRect(dataUrl, rect) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const pad = 16;
        const sx = Math.max(0, rect.left - pad) * dpr;
        const sy = Math.max(0, rect.top - pad) * dpr;
        const sw = Math.min((rect.width + pad * 2) * dpr, img.width - sx);
        const sh = Math.min((rect.height + pad * 2) * dpr, img.height - sy);
        if (sw <= 0 || sh <= 0) { resolve(null); return; }
        const c = document.createElement("canvas");
        c.width = Math.round(sw); c.height = Math.round(sh);
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
