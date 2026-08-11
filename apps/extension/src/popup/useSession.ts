import { useEffect, useState } from "react";
import type { SalesforceSession } from "@salesforce-xray/salesforce";

export function useSession(): SalesforceSession | null | "loading" {
  const [session, setSession] = useState<SalesforceSession | null | "loading">("loading");

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        setSession(null);
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: "GET_SESSION" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not injected — not a Salesforce page
          setSession(null);
          return;
        }
        setSession(response?.session ?? null);
      });
    });
  }, []);

  return session;
}
