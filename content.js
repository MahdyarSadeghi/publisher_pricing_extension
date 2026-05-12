(function () {
  if (document.getElementById("ynprice-sidebar-container")) {
    const el = document.getElementById("ynprice-sidebar-container");
    el.style.display = el.style.display === "none" ? "block" : "none";
    return;
  }

  // All known Yektanet position ID patterns
  const YN_PREFIXES = [
    'ynpos-',
    'yn-notification-',
    'pos-article-display-card-',
    'pos-article-display-',
    'pos-article-text-',
    'pos-notification-',
    'pos-slider-',
  ];

  // ── Page scan ────────────────────────────────────────────────
  function scanPage() {
    let appId = null;

    document.querySelectorAll("script[src]").forEach((s) => {
      if (!appId) {
        let m = s.src.match(/cdn\.yektanet\.com\/superscript\/([^/]+)\//);
        if (m) { appId = m[1]; return; }
        // New loader URL: cdn.yektanet.com/rg_woebegone/scripts_v4/{ver}/{appId}/complete.js
        m = s.src.match(/cdn\.yektanet\.com\/rg_woebegone\/scripts_v4\/[^/]+\/([^/]+)\//);
        if (m) appId = m[1];
      }
    });
    if (!appId) {
      let m = document.documentElement.innerHTML.match(
        /cdn\.yektanet\.com\/superscript\/([^/]+)\//
      );
      if (m) appId = m[1];
    }
    if (!appId) {
      const m = document.documentElement.innerHTML.match(
        /cdn\.yektanet\.com\/rg_woebegone\/scripts_v4\/[^/]+\/([^/]+)\//
      );
      if (m) appId = m[1];
    }

    const allIds = new Set();
    const html = document.documentElement.innerHTML;

    // Regex scan across all known ID patterns
    const re = /id=["'](ynpos|yn-notification|pos-article-display-card|pos-article-display|pos-article-text|pos-notification|pos-slider)-(\d+)["']/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      allIds.add(match[2]);
    }

    // yn-notification-{id}-player-style: style tag scan only (not a container — used for ID detection)
    const reNotifStyle = /id=["']yn-notification-(\d+)-player-style["']/g;
    while ((match = reNotifStyle.exec(html)) !== null) {
      allIds.add(match[1]);
    }

    // DOM query for all prefixes
    const selector = YN_PREFIXES.map(p => '[id^="' + p + '"]').join(',');
    document.querySelectorAll(selector).forEach((el) => {
      const m = el.id.match(/(\d+)$/);
      if (m) allIds.add(m[1]);
    });

    // xads class with data-id (e.g. <div class="xads position-22" data-id="22">)
    document.querySelectorAll('.xads[data-id]').forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && /^\d+$/.test(id)) allIds.add(id);
    });

    // Data-attribute variants
    document.querySelectorAll('[data-ynpos],[data-position-id]').forEach((el) => {
      const id = el.getAttribute('data-ynpos') || el.getAttribute('data-position-id');
      if (id && /^\d+$/.test(id)) allIds.add(id);
    });

    // Same-origin iframes
    document.querySelectorAll('iframe').forEach((fr) => {
      try {
        const doc = fr.contentDocument;
        if (!doc) return;
        doc.querySelectorAll(selector).forEach((el) => {
          const m = el.id.match(/(\d+)$/);
          if (m) allIds.add(m[1]);
        });
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

  // ── Find element by any known prefix ────────────────────────
  function findElement(posId) {
    // Try every known Yektanet prefix pattern in main document
    for (const prefix of YN_PREFIXES) {
      const el = document.getElementById(prefix + posId);
      if (el) return { el, iframeEl: null };
    }
    // xads class with data-id
    const byXads = document.querySelector('.xads[data-id="' + posId + '"]');
    if (byXads) return { el: byXads, iframeEl: null };

    // Data attributes
    const byAttr =
      document.querySelector('[data-ynpos="' + posId + '"],[data-position-id="' + posId + '"]');
    if (byAttr) return { el: byAttr, iframeEl: null };

    // Same-origin iframes
    for (const fr of document.querySelectorAll('iframe')) {
      try {
        const doc = fr.contentDocument;
        if (!doc) continue;
        for (const prefix of YN_PREFIXES) {
          const candidate = doc.getElementById(prefix + posId);
          if (candidate) return { el: candidate, iframeEl: fr };
        }
        const frXads = doc.querySelector('.xads[data-id="' + posId + '"]');
        if (frXads) return { el: frXads, iframeEl: fr };
      } catch (_) {}
    }
    return null;
  }

  // ── Highlight (DevTools-style, fires after scroll ends) ──────
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

    // For empty containers (e.g. notification placeholders), use first visible child
    let targetEl = el;
    {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        for (const child of el.querySelectorAll("*")) {
          const cr = child.getBoundingClientRect();
          if (cr.width > 0 || cr.height > 0) { targetEl = child; break; }
        }
      }
    }

    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // Show overlay after scroll finishes (detect via scroll-end)
    // Falls back to 200ms if element is already in view (no scroll event fires)
    let scrolled = false;
    let scrollEndTimer = null;

    function showOverlay() {
      window.removeEventListener("scroll", onScroll, true);
      clearTimeout(noScrollTimer);

      const elRect = targetEl.getBoundingClientRect();
      let top, left;
      if (iframeEl) {
        const frRect = iframeEl.getBoundingClientRect();
        top  = frRect.top  + elRect.top;
        left = frRect.left + elRect.left;
      } else {
        top  = elRect.top;
        left = elRect.left;
      }

      // If the element is hidden behind the sidebar panel, slide the sidebar away
      // so the user can actually see the highlight
      const sidebarRect = container.getBoundingClientRect();
      const hiddenBySidebar =
        left + Math.max(elRect.width, 60) > sidebarRect.left &&
        left < sidebarRect.right &&
        top  + Math.max(elRect.height, 30) > sidebarRect.top &&
        top  < sidebarRect.bottom;

      if (hiddenBySidebar) {
        container.style.transition = "transform 0.28s ease";
        container.style.transform  = "translateX(100%)";
        // Slide back in after highlight fades
        setTimeout(function() {
          container.style.transition = "transform 0.35s ease";
          container.style.transform  = "";
          setTimeout(function(){ container.style.transition = ""; }, 360);
        }, 2700);
      }

      // Ensure minimum size so even empty placeholder divs are visible
      const w = Math.max(elRect.width,  60);
      const h = Math.max(elRect.height, 30);
      const pad = 6;

      const ov = document.createElement("div");
      ov.className = "ynprice-overlay";
      ov.style.cssText =
        "position:fixed;" +
        "top:"    + Math.round(top  - pad) + "px;" +
        "left:"   + Math.round(left - pad) + "px;" +
        "width:"  + Math.round(w + pad * 2) + "px;" +
        "height:" + Math.round(h + pad * 2) + "px;" +
        "background:rgba(229,57,53,0.12);" +
        "border:3px solid #e53935;" +
        "border-radius:5px;" +
        "box-shadow:0 0 0 9999px rgba(0,0,0,0.22);" +
        "pointer-events:none;" +
        "z-index:2147483646;" +
        "animation:ynprice-in 2.4s ease forwards;";
      document.body.appendChild(ov);
      setTimeout(() => ov.remove(), 2500);
    }

    function onScroll() {
      scrolled = true;
      clearTimeout(scrollEndTimer);
      // 120ms after last scroll event = scroll has ended
      scrollEndTimer = setTimeout(showOverlay, 120);
    }

    // If element already in view or scroll is very fast, fall back after 250ms
    const noScrollTimer = setTimeout(() => {
      if (!scrolled) showOverlay();
    }, 250);

    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
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
      const hit = findElement(posId);
      if (!hit) continue;
      const el = hit.el;
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
