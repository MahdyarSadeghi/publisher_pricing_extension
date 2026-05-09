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

    // Regex scan on full HTML (catches lazily rendered elements)
    const re = /id=["']ynpos-(\d+)["']/g;
    let match;
    while ((match = re.exec(document.documentElement.innerHTML)) !== null) {
      allIds.add(match[1]);
    }
    // DOM query
    document.querySelectorAll('[id^="ynpos-"]').forEach((el) => {
      allIds.add(el.id.replace("ynpos-", ""));
    });
    // Data-attribute variants (some Yektanet setups)
    document.querySelectorAll('[data-ynpos],[data-position-id]').forEach((el) => {
      const id = el.getAttribute('data-ynpos') || el.getAttribute('data-position-id');
      if (id && /^\d+$/.test(id)) allIds.add(id);
    });
    // Same-origin iframes
    document.querySelectorAll('iframe').forEach((fr) => {
      try {
        const doc = fr.contentDocument;
        if (!doc) return;
        doc.querySelectorAll('[id^="ynpos-"]').forEach((el) => {
          allIds.add(el.id.replace("ynpos-", ""));
        });
        const reIf = /id=["']ynpos-(\d+)["']/g;
        let m2;
        while ((m2 = reIf.exec(doc.documentElement.innerHTML)) !== null) {
          allIds.add(m2[1]);
        }
      } catch (_) {}
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

  window.addEventListener("message", (event) => {
    if (!event.data) return;
    if (event.data.type === "CLOSE_SIDEBAR") {
      container.style.display = "none";
    }
    if (event.data.type === "HIGHLIGHT_POSITION") {
      highlightPosition(event.data.positionId);
    }
  });

  // ── Highlight (DevTools-style) ───────────────────────────────
  function findElement(posId) {
    // Main document
    let el = document.getElementById("ynpos-" + posId);
    if (el) return { el, iframeEl: null };

    // Data attribute variants
    el = document.querySelector('[data-ynpos="' + posId + '"],[data-position-id="' + posId + '"]');
    if (el) return { el, iframeEl: null };

    // Same-origin iframes
    for (const fr of document.querySelectorAll('iframe')) {
      try {
        const doc = fr.contentDocument;
        if (!doc) continue;
        const candidate = doc.getElementById("ynpos-" + posId) ||
          doc.querySelector('[data-ynpos="' + posId + '"],[data-position-id="' + posId + '"]');
        if (candidate) return { el: candidate, iframeEl: fr };
      } catch (_) {}
    }
    return null;
  }

  function highlightPosition(posId) {
    const found = findElement(posId);
    if (!found) {
      iframe.contentWindow.postMessage({ type: "HIGHLIGHT_NOT_FOUND", positionId: posId }, "*");
      return;
    }
    const { el, iframeEl } = found;

    // Inject animation keyframes once
    if (!document.getElementById("ynprice-kf")) {
      const s = document.createElement("style");
      s.id = "ynprice-kf";
      s.textContent =
        "@keyframes ynprice-in{" +
          "0%{opacity:0;transform:scale(1.04)}" +
          "12%{opacity:1;transform:scale(1)}" +
          "78%{opacity:1}" +
          "100%{opacity:0}" +
        "}";
      document.head.appendChild(s);
    }

    document.querySelectorAll(".ynprice-overlay").forEach((e) => e.remove());

    // Calculate ABSOLUTE document position BEFORE any scroll
    // so the overlay tracks the element correctly during smooth scroll
    const elRect = el.getBoundingClientRect();
    let absTop, absLeft;
    if (iframeEl) {
      const frRect = iframeEl.getBoundingClientRect();
      const innerScrollY = iframeEl.contentWindow ? (iframeEl.contentWindow.scrollY || 0) : 0;
      const innerScrollX = iframeEl.contentWindow ? (iframeEl.contentWindow.scrollX || 0) : 0;
      absTop  = frRect.top  + window.scrollY + elRect.top  + innerScrollY;
      absLeft = frRect.left + window.scrollX + elRect.left + innerScrollX;
    } else {
      absTop  = elRect.top  + window.scrollY;
      absLeft = elRect.left + window.scrollX;
    }

    const pad = 6;
    const ov = document.createElement("div");
    ov.className = "ynprice-overlay";
    // position:absolute so the overlay stays with the element as the page scrolls
    ov.style.cssText =
      "position:absolute;" +
      "top:"    + Math.round(absTop  - pad) + "px;" +
      "left:"   + Math.round(absLeft - pad) + "px;" +
      "width:"  + Math.round(elRect.width  + pad * 2) + "px;" +
      "height:" + Math.round(elRect.height + pad * 2) + "px;" +
      "background:rgba(229,57,53,0.12);" +
      "border:3px solid #e53935;" +
      "border-radius:5px;" +
      "box-shadow:0 0 0 9999px rgba(0,0,0,0.22);" +
      "pointer-events:none;" +
      "z-index:2147483646;" +
      "animation:ynprice-in 2.4s ease forwards;";
    document.body.appendChild(ov);

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => ov.remove(), 2500);
  }

  // ── Screenshots ──────────────────────────────────────────────
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
