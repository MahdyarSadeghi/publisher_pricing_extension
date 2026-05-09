chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (err) {
    console.error("Failed to inject content script:", err);
  }
});
