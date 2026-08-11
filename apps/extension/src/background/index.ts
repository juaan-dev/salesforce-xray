// Background service worker for Salesforce X-Ray.
// Handles cross-context messaging and opens the X-Ray analysis tab.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_XRAY") {
    const url = chrome.runtime.getURL("src/xray/index.html");
    void chrome.tabs.create({ url }).then((tab) => {
      sendResponse({ tabId: tab.id });
    });
    return true; // keep message channel open for async response
  }

  if (message.type === "STORE_LOG") {
    // Persist the log body so the X-Ray tab can retrieve it
    void chrome.storage.session
      .set({ pendingLog: message.payload })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_LOG") {
    void chrome.storage.session.get("pendingLog").then((data) => {
      sendResponse({ payload: data["pendingLog"] ?? null });
    });
    return true;
  }
});
