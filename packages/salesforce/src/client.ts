import type {
  SalesforceClient,
  SalesforceUser,
  DebugLevel,
  TraceFlag,
  DebugLog,
  OrgInfo,
} from "./types.js";
import { SalesforceApiError, SalesforcePermissionError } from "./types.js";

// Default debug level settings for X-Ray tracing.
// Verbose enough to capture the execution tree; not so verbose it hits log limits.
const XRAY_DEBUG_LEVEL = {
  ApexCode: "DEBUG",
  ApexProfiling: "INFO",
  Callout: "INFO",
  Database: "INFO",
  System: "DEBUG",
  Validation: "INFO",
  Visualforce: "INFO",
  Wave: "INFO",
  Workflow: "INFO",
} as const;

const DEFAULT_TRACE_DURATION_MINUTES = 15;

export class BrowserSalesforceClient implements SalesforceClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly sessionToken: string;

  constructor(opts: {
    instanceUrl: string;
    apiVersion: string;
    sessionToken: string;
  }) {
    this.baseUrl = opts.instanceUrl.replace(/\/$/, "");
    this.apiVersion = opts.apiVersion;
    this.sessionToken = opts.sessionToken;
  }

  // ─── Internal fetch helper ─────────────────────────────────────────────────

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/services/data/v${this.apiVersion}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.status === 403 || res.status === 401) {
      throw new SalesforcePermissionError(
        `Insufficient Salesforce permissions (HTTP ${res.status}). ` +
          "Ensure you have 'Manage Users' or 'Modify All Data' to create Trace Flags."
      );
    }

    if (!res.ok) {
      const body = await res.json().catch(() => res.text());
      throw new SalesforceApiError(
        `Salesforce API error: ${res.status} ${res.statusText}`,
        res.status,
        body
      );
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getUsers(query = ""): Promise<SalesforceUser[]> {
    const q = query
      ? `Name LIKE '%${query}%' OR Username LIKE '%${query}%'`
      : "IsActive = true";

    const soql = encodeURIComponent(
      `SELECT Id, Name, Username, Email, IsActive FROM User WHERE ${q} ORDER BY Name LIMIT 50`
    );
    const data = await this.request<{ records: RawUser[] }>(
      `/query?q=${soql}`
    );
    return data.records.map(mapUser);
  }

  async getDebugLevels(): Promise<DebugLevel[]> {
    const soql = encodeURIComponent(
      "SELECT Id, DeveloperName, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow FROM DebugLevel ORDER BY DeveloperName"
    );
    const data = await this.request<{ records: RawDebugLevel[] }>(
      `/query?q=${soql}`
    );
    return data.records.map(mapDebugLevel);
  }

  async createDebugLevel(developerName: string): Promise<DebugLevel> {
    const body = {
      DeveloperName: developerName,
      MasterLabel: developerName,
      ...XRAY_DEBUG_LEVEL,
    };
    const result = await this.request<{ id: string }>(
      "/sobjects/DebugLevel",
      { method: "POST", body: JSON.stringify(body) }
    );
    return {
      id: result.id,
      developerName,
      apexCode: XRAY_DEBUG_LEVEL.ApexCode,
      apexProfiling: XRAY_DEBUG_LEVEL.ApexProfiling,
      callout: XRAY_DEBUG_LEVEL.Callout,
      database: XRAY_DEBUG_LEVEL.Database,
      system: XRAY_DEBUG_LEVEL.System,
      validation: XRAY_DEBUG_LEVEL.Validation,
      visualforce: XRAY_DEBUG_LEVEL.Visualforce,
      workflow: XRAY_DEBUG_LEVEL.Workflow,
    };
  }

  async createTraceFlag(
    tracedEntityId: string,
    debugLevelId: string,
    durationMinutes = DEFAULT_TRACE_DURATION_MINUTES
  ): Promise<TraceFlag> {
    const startDate = new Date();
    const expirationDate = new Date(
      startDate.getTime() + durationMinutes * 60 * 1000
    );
    const body = {
      TracedEntityId: tracedEntityId,
      DebugLevelId: debugLevelId,
      LogType: "USER_DEBUG",
      StartDate: startDate.toISOString(),
      ExpirationDate: expirationDate.toISOString(),
    };
    const result = await this.request<{ id: string }>(
      "/sobjects/TraceFlag",
      { method: "POST", body: JSON.stringify(body) }
    );
    return {
      id: result.id,
      tracedEntityId,
      debugLevelId,
      logType: "USER_DEBUG",
      startDate: startDate.toISOString(),
      expirationDate: expirationDate.toISOString(),
    };
  }

  async deleteTraceFlag(id: string): Promise<void> {
    await this.request(`/sobjects/TraceFlag/${id}`, { method: "DELETE" });
  }

  async getDebugLogs(userId: string, since?: Date): Promise<DebugLog[]> {
    const sinceFilter = since
      ? ` AND LastModifiedDate >= ${since.toISOString()}`
      : "";
    const soql = encodeURIComponent(
      `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds FROM ApexLog WHERE LogUserId = '${userId}'${sinceFilter} ORDER BY LastModifiedDate DESC LIMIT 10`
    );
    const data = await this.request<{ records: RawApexLog[] }>(
      `/query?q=${soql}`
    );
    return data.records.map(mapApexLog);
  }

  async getDebugLogBody(id: string): Promise<string> {
    const url = `${this.baseUrl}/services/data/v${this.apiVersion}/sobjects/ApexLog/${id}/Body`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.sessionToken}` },
    });
    if (!res.ok) {
      throw new SalesforceApiError(
        `Failed to fetch log body: ${res.status}`,
        res.status,
        null
      );
    }
    return res.text();
  }

  async getOrgInfo(): Promise<OrgInfo> {
    const data = await this.request<RawOrgInfo>("/");
    return {
      id: data.organizationId ?? "",
      instanceUrl: this.baseUrl,
      apiVersion: this.apiVersion,
    };
  }
}

// ─── Raw Salesforce API shapes ────────────────────────────────────────────────

interface RawUser {
  Id: string;
  Name: string;
  Username: string;
  Email: string;
  IsActive: boolean;
}

interface RawDebugLevel {
  Id: string;
  DeveloperName: string;
  ApexCode: string;
  ApexProfiling: string;
  Callout: string;
  Database: string;
  System: string;
  Validation: string;
  Visualforce: string;
  Workflow: string;
}

interface RawApexLog {
  Id: string;
  LogUserId: string;
  LogLength: number;
  LastModifiedDate: string;
  Request: string;
  Operation: string;
  Application: string;
  Status: string;
  DurationMilliseconds: number;
}

interface RawOrgInfo {
  organizationId?: string;
}

function mapUser(r: RawUser): SalesforceUser {
  return {
    id: r.Id,
    name: r.Name,
    username: r.Username,
    email: r.Email,
    isActive: r.IsActive,
  };
}

function mapDebugLevel(r: RawDebugLevel): DebugLevel {
  return {
    id: r.Id,
    developerName: r.DeveloperName,
    apexCode: r.ApexCode,
    apexProfiling: r.ApexProfiling,
    callout: r.Callout,
    database: r.Database,
    system: r.System,
    validation: r.Validation,
    visualforce: r.Visualforce,
    workflow: r.Workflow,
  };
}

function mapApexLog(r: RawApexLog): DebugLog {
  return {
    id: r.Id,
    logUserId: r.LogUserId,
    logLength: r.LogLength,
    lastModifiedDate: r.LastModifiedDate,
    request: r.Request,
    operation: r.Operation,
    application: r.Application,
    status: r.Status,
    durationMilliseconds: r.DurationMilliseconds,
  };
}
