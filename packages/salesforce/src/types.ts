// ─── Salesforce domain types ──────────────────────────────────────────────────

export interface SalesforceUser {
  id: string;
  name: string;
  username: string;
  email: string;
  isActive: boolean;
}

export interface DebugLevel {
  id: string;
  developerName: string;
  apexCode: string;
  apexProfiling: string;
  callout: string;
  database: string;
  system: string;
  validation: string;
  visualforce: string;
  workflow: string;
}

export interface TraceFlag {
  id: string;
  tracedEntityId: string;
  debugLevelId: string;
  logType: string;
  startDate: string;
  expirationDate: string;
}

export interface DebugLog {
  id: string;
  logUserId: string;
  logLength: number;
  lastModifiedDate: string;
  request: string;
  operation: string;
  application: string;
  status: string;
  durationMilliseconds: number;
}

// ─── Client interface ─────────────────────────────────────────────────────────

export interface SalesforceClient {
  getUsers(query?: string): Promise<SalesforceUser[]>;

  getDebugLevels(): Promise<DebugLevel[]>;

  createDebugLevel(developerName: string): Promise<DebugLevel>;

  createTraceFlag(
    tracedEntityId: string,
    debugLevelId: string,
    durationMinutes?: number
  ): Promise<TraceFlag>;

  deleteTraceFlag(id: string): Promise<void>;

  getDebugLogs(userId: string, since?: Date): Promise<DebugLog[]>;

  getDebugLogBody(id: string): Promise<string>;

  getOrgInfo(): Promise<OrgInfo>;
}

export interface OrgInfo {
  id: string;
  instanceUrl: string;
  apiVersion: string;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class SalesforceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "SalesforceApiError";
  }
}

export class SalesforcePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesforcePermissionError";
  }
}
