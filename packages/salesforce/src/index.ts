export { BrowserSalesforceClient } from "./client.js";
export { TraceService } from "./trace-service.js";
export { extractSession } from "./session.js";
export type {
  SalesforceClient,
  SalesforceUser,
  DebugLevel,
  TraceFlag,
  DebugLog,
  OrgInfo,
  SalesforceSession,
} from "./types.js";
export type { TraceState, TraceStatus, TraceStateListener } from "./trace-service.js";
export { SalesforceApiError, SalesforcePermissionError } from "./types.js";
