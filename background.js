chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (err) {
    console.error("Failed to inject content script:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_TAB") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 85 }, (dataUrl) => {
      sendResponse(dataUrl || null);
    });
    return true;
  }

  if (msg.type === "SAVE_REPORT") {
    chrome.storage.local.set({ ynprice_report: msg.data }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("report-viewer.html") });
      sendResponse({ ok: true });
    });
    return true;
  }
});
