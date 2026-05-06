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

    const positionIds = [...document.querySelectorAll('[id^="ynpos-"]')].map(
      (el) => el.id.replace("ynpos-", "")
    );

    return { appId, positionIds };
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

    // Add red borders to all found ynpos elements
    const elements = [];
    matched.concat(unmatched.map((id) => ({ positionId: id, noData: true }))).forEach((item) => {
      const el = document.getElementById(`ynpos-${item.positionId}`);
      if (!el) return;
      el.dataset.ynpriceOrigOutline = el.style.outline;
      el.dataset.ynpriceOrigOutlineOffset = el.style.outlineOffset;
      el.style.outline = "3px solid #e53935";
      el.style.outlineOffset = "3px";
      elements.push({ ...item, el });
    });

    if (elements.length === 0) {
      // No elements found in DOM — take one full-page screenshot
      const screenshot = await captureTab();
      await saveAndOpenReport({ matched, unmatched, totalRpm, publisherName, from, to, appId,
        pageTitle: document.title, pageUrl: window.location.href,
        screenshots: [] , fullPageShot: screenshot });
      return;
    }

    // Sort by vertical scroll position
    elements.sort((a, b) => {
      const aTop = a.el.getBoundingClientRect().top + window.scrollY;
      const bTop = b.el.getBoundingClientRect().top + window.scrollY;
      return aTop - bTop;
    });

    // Group elements into viewport-sized buckets (minimal scrolling)
    const viewH = window.innerHeight;
    const groups = [];
    let groupStart = null;

    for (const item of elements) {
      const elTop = item.el.getBoundingClientRect().top + window.scrollY;
      if (groupStart === null || elTop - groupStart > viewH * 0.8) {
        groups.push([item]);
        groupStart = elTop;
      } else {
        groups[groups.length - 1].push(item);
      }
    }

    // Capture each group
    const positionScreenshots = {};
    for (const group of groups) {
      const midEl = group[Math.floor(group.length / 2)].el;
      midEl.scrollIntoView({ behavior: "instant", block: "center" });
      await sleep(350);
      const dataUrl = await captureTab();
      group.forEach((item) => {
        positionScreenshots[item.positionId] = dataUrl;
      });
    }

    // Restore borders
    elements.forEach((item) => {
      item.el.style.outline = item.el.dataset.ynpriceOrigOutline || "";
      item.el.style.outlineOffset = item.el.dataset.ynpriceOrigOutlineOffset || "";
    });

    // Scroll back to top
    window.scrollTo({ top: 0, behavior: "instant" });

    // Attach screenshots to matched positions
    const matchedWithScreenshots = matched.map((p) => ({
      ...p,
      screenshot: positionScreenshots[p.positionId] || null,
    }));

    await saveAndOpenReport({
      matched: matchedWithScreenshots,
      unmatched,
      totalRpm,
      publisherName,
      from,
      to,
      appId,
      pageTitle: document.title,
      pageUrl: window.location.href,
      screenshots: positionScreenshots,
    });
  }

  async function captureTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, resolve);
    });
  }

  async function saveAndOpenReport(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SAVE_REPORT", data }, resolve);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
