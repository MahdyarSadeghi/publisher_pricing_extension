(function () {
  if (document.getElementById("ynprice-sidebar-container")) {
    const el = document.getElementById("ynprice-sidebar-container");
    el.style.display = el.style.display === "none" ? "block" : "none";
    return;
  }

  function scanPage() {
    let appId = null;

    // Check script src attributes
    document.querySelectorAll("script[src]").forEach((s) => {
      if (!appId) {
        const m = s.src.match(/cdn\.yektanet\.com\/superscript\/([^/]+)\//);
        if (m) appId = m[1];
      }
    });
    // Fallback: search full page HTML
    if (!appId) {
      const m = document.documentElement.innerHTML.match(
        /cdn\.yektanet\.com\/superscript\/([^/]+)\//
      );
      if (m) appId = m[1];
    }

    // Scan full innerHTML for ALL ynpos-* IDs (catches hidden/mobile positions too)
    const allIds = new Set();
    const re = /id=["']ynpos-(\d+)["']/g;
    let match;
    while ((match = re.exec(document.documentElement.innerHTML)) !== null) {
      allIds.add(match[1]);
    }
    // Also catch dynamically-added elements
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

  // ── Report generation ──────────────────────────────────────────
  async function generateReport(analysisData) {
    const { matched, unmatched, totalRpm, publisherName, from, to, appId } = analysisData;

    // Tag each ynpos element with a red border + check visibility
    const elements = [];
    matched.forEach((item) => {
      const el = document.getElementById(`ynpos-${item.positionId}`);
      if (!el) return;
      const style = window.getComputedStyle(el);
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.offsetWidth > 0;
      el.dataset.ynpriceOrig = el.style.outline + "|" + el.style.outlineOffset;
      el.style.outline = "3px solid #e53935";
      el.style.outlineOffset = "3px";
      elements.push({ ...item, el, mobileOnly: !visible });
    });

    const positionScreenshots = {};

    if (elements.length > 0) {
      // Sort by vertical position
      elements.sort((a, b) => {
        const ay = a.el.getBoundingClientRect().top + window.scrollY;
        const by = b.el.getBoundingClientRect().top + window.scrollY;
        return ay - by;
      });

      // Group elements into viewport-sized buckets
      const viewH = window.innerHeight;
      const groups = [];
      let groupAnchor = null;

      for (const item of elements) {
        if (item.mobileOnly) continue; // skip hidden elements
        const elTop = item.el.getBoundingClientRect().top + window.scrollY;
        if (groupAnchor === null || elTop - groupAnchor > viewH * 0.75) {
          groups.push([item]);
          groupAnchor = elTop;
        } else {
          groups[groups.length - 1].push(item);
        }
      }

      // Capture each group
      for (const group of groups) {
        const midEl = group[Math.floor(group.length / 2)].el;
        midEl.scrollIntoView({ behavior: "instant", block: "center" });
        await sleep(350);
        const dataUrl = await captureTab();
        if (dataUrl) {
          group.forEach((item) => { positionScreenshots[item.positionId] = dataUrl; });
        }
      }

      // Restore original styles
      elements.forEach((item) => {
        const [origOutline, origOffset] = (item.el.dataset.ynpriceOrig || "|").split("|");
        item.el.style.outline = origOutline || "";
        item.el.style.outlineOffset = origOffset || "";
        delete item.el.dataset.ynpriceOrig;
      });

      window.scrollTo({ top: 0, behavior: "instant" });
    }

    // Attach screenshot info to matched positions
    const matchedWithScreenshots = matched.map((p) => ({
      ...p,
      screenshot: positionScreenshots[p.positionId] || null,
      mobileOnly: elements.find((e) => e.positionId === p.positionId)?.mobileOnly || false,
    }));

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

    // Store in chrome.storage.local directly (no large message passing)
    chrome.storage.local.set({ ynprice_report: reportData }, () => {
      if (chrome.runtime.lastError) {
        console.error("ynprice storage error:", chrome.runtime.lastError);
      }
      chrome.runtime.sendMessage({ type: "OPEN_REPORT_VIEWER" });
    });
  }

  async function captureTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, (res) => {
        resolve(res || null);
      });
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
