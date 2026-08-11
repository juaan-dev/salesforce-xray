// Extracts Salesforce session context from the currently open Salesforce page.
// Must be called from a content script running on a Salesforce page.

export interface SalesforceSession {
  instanceUrl: string;
  sessionToken: string;
  apiVersion: string;
  userId: string;
}

// Salesforce embeds session context in several places in the page.
// We probe them in priority order.
export function extractSession(): SalesforceSession | undefined {
  const instanceUrl = extractInstanceUrl();
  if (!instanceUrl) return undefined;

  const sessionToken = extractSessionToken();
  if (!sessionToken) return undefined;

  const apiVersion = extractApiVersion();
  const userId = extractUserId();

  return {
    instanceUrl,
    sessionToken,
    apiVersion: apiVersion ?? "59.0",
    userId: userId ?? "",
  };
}

function extractInstanceUrl(): string | undefined {
  // window.location is always present on a Salesforce page
  if (typeof window === "undefined") return undefined;
  const { protocol, hostname } = window.location;
  if (!hostname.includes("salesforce.com") && !hostname.includes("force.com")) {
    return undefined;
  }
  return `${protocol}//${hostname}`;
}

function extractSessionToken(): string | undefined {
  if (typeof window === "undefined") return undefined;

  // Approach 1: Salesforce sets __sfdcSessionId on the window
  const win = window as Record<string, unknown>;
  if (typeof win["__sfdcSessionId"] === "string") {
    return win["__sfdcSessionId"] as string;
  }

  // Approach 2: Lightning app bootstrap embeds it in a script tag
  const scripts = Array.from(document.querySelectorAll("script"));
  for (const script of scripts) {
    const m = /"sid"\s*:\s*"([^"]+)"/.exec(script.textContent ?? "");
    if (m?.[1]) return m[1];
  }

  // Approach 3: cookie (works in some classic orgs)
  const sidCookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith("sid="));
  if (sidCookie) {
    return sidCookie.split("=")[1]?.trim();
  }

  return undefined;
}

function extractApiVersion(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as Record<string, unknown>;
  if (typeof win["$A"] === "object" && win["$A"] !== null) {
    const aura = win["$A"] as Record<string, unknown>;
    if (typeof aura["get"] === "function") {
      try {
        const ver = (aura["get"] as (k: string) => unknown)("$ApiVersion");
        if (typeof ver === "string") return ver;
      } catch {
        // ignore
      }
    }
  }
  // Fall back to detecting from meta tags or page URL patterns
  const canonical = document.querySelector<HTMLLinkElement>("link[rel=canonical]");
  if (canonical?.href) {
    const m = /\/v(\d+\.\d+)\//.exec(canonical.href);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as Record<string, unknown>;
  if (typeof win["__sfdcUserId"] === "string") {
    return win["__sfdcUserId"] as string;
  }
  return undefined;
}
