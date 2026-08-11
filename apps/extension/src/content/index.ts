// Content script — runs on Salesforce pages.
// Extracts session context and makes it available to the popup via chrome.runtime.

import { extractSession } from "@salesforce-xray/salesforce";

// Respond to session-info requests from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SESSION") {
    const session = extractSession();
    sendResponse({ session: session ?? null });
  }
});
