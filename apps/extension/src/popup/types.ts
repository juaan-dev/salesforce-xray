import type { SalesforceSession, SalesforceUser } from "@salesforce-xray/salesforce";

export type PopupView = "trace" | "upload";

export type PopupStatus =
  | "no_session"       // not on a Salesforce page
  | "idle"             // ready to search/select
  | "searching"        // user search in progress
  | "selected"         // user selected, ready to start
  | "starting"         // creating TraceFlag
  | "tracing"          // waiting for log
  | "captured"         // log captured, opening X-Ray
  | "error";

export interface PopupState {
  view: PopupView;
  status: PopupStatus;
  session: SalesforceSession | null;
  searchQuery: string;
  searchResults: SalesforceUser[];
  selectedUser: SalesforceUser | null;
  errorMessage: string | null;
}
