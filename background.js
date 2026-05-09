chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (err) {
    console.error("Failed to inject content script:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OPEN_REPORT_VIEWER") {
    chrome.tabs.create({ url: chrome.runtime.getURL("report-viewer.html") });
    sendResponse({ ok: true });
    return false;
  }
});
