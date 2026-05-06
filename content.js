(function () {
  // Prevent duplicate injection
  if (document.getElementById("ynprice-sidebar-container")) {
    const existing = document.getElementById("ynprice-sidebar-container");
    existing.style.display = existing.style.display === "none" ? "block" : "none";
    return;
  }

  function extractYektanetData() {
    let appId = null;

    // Search script src attributes
    document.querySelectorAll("script[src]").forEach((script) => {
      if (!appId) {
        const match = script.src.match(/cdn\.yektanet\.com\/superscript\/([^/]+)\//);
        if (match) appId = match[1];
      }
    });

    // Search inline script textContent as fallback
    if (!appId) {
      document.querySelectorAll("script:not([src])").forEach((script) => {
        if (!appId) {
          const match = script.textContent.match(/cdn\.yektanet\.com\/superscript\/([^/]+)\//);
          if (match) appId = match[1];
        }
      });
    }

    // Also check page HTML source for dynamically-loaded scripts
    if (!appId) {
      const match = document.documentElement.innerHTML.match(
        /cdn\.yektanet\.com\/superscript\/([^/]+)\//
      );
      if (match) appId = match[1];
    }

    const positionElements = document.querySelectorAll('[id^="ynpos-"]');
    const positionIds = [...positionElements].map((el) =>
      el.id.replace("ynpos-", "")
    );

    return { appId, positionIds };
  }

  const { appId, positionIds } = extractYektanetData();

  // Create sidebar container iframe
  const container = document.createElement("div");
  container.id = "ynprice-sidebar-container";
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 360px;
    height: 100vh;
    z-index: 2147483647;
    border: none;
    box-shadow: -4px 0 20px rgba(0,0,0,0.25);
  `;

  const iframe = document.createElement("iframe");
  iframe.id = "ynprice-sidebar-iframe";
  iframe.src = chrome.runtime.getURL("sidebar.html");
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
  `;

  container.appendChild(iframe);
  document.body.appendChild(container);

  // Pass scan data to sidebar once it's loaded
  iframe.addEventListener("load", () => {
    iframe.contentWindow.postMessage(
      {
        type: "SCAN_RESULT",
        appId: appId,
        positionIds: positionIds,
        pageUrl: window.location.href,
        pageTitle: document.title,
      },
      "*"
    );
  });

  // Listen for close message from sidebar
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "CLOSE_SIDEBAR") {
      container.style.display = "none";
    }
  });
})();
