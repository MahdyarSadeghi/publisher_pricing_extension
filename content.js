(function () {
  if (document.getElementById("ynprice-sidebar-container")) {
    const el = document.getElementById("ynprice-sidebar-container");
    el.style.display = el.style.display === "none" ? "block" : "none";
    return;
  }

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

  window.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "CLOSE_SIDEBAR") {
      container.style.display = "none";
    }

    if (msg.type === "GENERATE_REPORT") {
      await generateReport(msg.data);
      iframe.contentWindow.postMessage({ type: "REPORT_DONE" }, "*");
    }
  });

  // ── Report generation ───────────────────────────────────────────
  async function generateReport(analysisData) {
    const { matched, unmatched, totalRpm, publisherName, from, to, appId } = analysisData;

    const positionScreenshots = {};

    for (const item of matched) {
      const el = document.getElementById(`ynpos-${item.positionId}`);
      if (!el) continue;

      const style = window.getComputedStyle(el);
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0;

      if (!visible) continue;

      el.style.outline = "3px solid #e53935";
      el.style.outlineOffset = "3px";

      el.scrollIntoView({ behavior: "instant", block: "center" });
      await sleep(300);

      const rect = el.getBoundingClientRect();
      const fullDataUrl = await captureTab();

      el.style.outline = "";
      el.style.outlineOffset = "";

      if (fullDataUrl && rect.width > 0 && rect.height > 0) {
        const cropped = await cropToRect(fullDataUrl, rect);
        if (cropped) positionScreenshots[item.positionId] = cropped;
      }
    }

    window.scrollTo({ top: 0, behavior: "instant" });

    const matchedWithScreenshots = matched.map((p) => {
      const el = document.getElementById(`ynpos-${p.positionId}`);
      let mobileOnly = true;
      if (el) {
        const s = window.getComputedStyle(el);
        mobileOnly =
          s.display === "none" ||
          s.visibility === "hidden" ||
          el.offsetWidth === 0 ||
          el.offsetHeight === 0;
      }
      return {
        ...p,
        screenshot: positionScreenshots[p.positionId] || null,
        mobileOnly,
      };
    });

    const reportData = {
      matched: matchedWithScreenshots,
      unmatched,
      totalRpm,
      publisherName,
      from,
      to,
      appId,
      pageTitle: document.title,
      pageUrl: window.location.href,
      generatedAt: new Date().toISOString(),
    };

    await new Promise((resolve) => {
      chrome.storage.local.set({ ynprice_report: reportData }, () => {
        if (chrome.runtime.lastError) {
          console.error("ynprice storage error:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });

    chrome.runtime.sendMessage({ type: "OPEN_REPORT_VIEWER" });
  }

  async function captureTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, (res) => {
        resolve(res || null);
      });
    });
  }

  async function cropToRect(dataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const pad = 20;
        const sx = Math.max(0, rect.left - pad) * dpr;
        const sy = Math.max(0, rect.top - pad) * dpr;
        const sw = Math.min((rect.width + pad * 2) * dpr, img.width - sx);
        const sh = Math.min((rect.height + pad * 2) * dpr, img.height - sy);
        if (sw <= 0 || sh <= 0) { resolve(null); return; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
