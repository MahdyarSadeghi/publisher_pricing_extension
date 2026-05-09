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


})();
