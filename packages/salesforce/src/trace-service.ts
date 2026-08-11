import type { SalesforceClient, DebugLog, TraceFlag, DebugLevel } from "./types.js";

export type TraceStatus =
  | "idle"
  | "starting"
  | "active"
  | "captured"
  | "error"
  | "stopped";

export interface TraceState {
  status: TraceStatus;
  userId: string | undefined;
  userName: string | undefined;
  traceFlag: TraceFlag | undefined;
  debugLevel: DebugLevel | undefined;
  capturedLog: DebugLog | undefined;
  error: string | undefined;
  startedAt: Date | undefined;
}

export type TraceStateListener = (state: TraceState) => void;

const POLL_INTERVAL_MS = 2_000;
const XRAY_DEBUG_LEVEL_NAME = "XRay_Debug_Level";

export class TraceService {
  private state: TraceState = {
    status: "idle",
    userId: undefined,
    userName: undefined,
    traceFlag: undefined,
    debugLevel: undefined,
    capturedLog: undefined,
    error: undefined,
    startedAt: undefined,
  };

  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<TraceStateListener>();

  constructor(private readonly client: SalesforceClient) {}

  // ─── State subscription ──────────────────────────────────────────────────

  subscribe(listener: TraceStateListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const l of this.listeners) l(snapshot);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(userId: string, userName: string): Promise<void> {
    this.stopPolling();
    this.state = {
      ...this.state,
      status: "starting",
      userId,
      userName,
      traceFlag: undefined,
      capturedLog: undefined,
      error: undefined,
      startedAt: undefined,
    };
    this.emit();

    try {
      const debugLevel = await this.ensureDebugLevel();
      const traceFlag = await this.client.createTraceFlag(userId, debugLevel.id);

      this.state = {
        ...this.state,
        status: "active",
        traceFlag,
        debugLevel,
        startedAt: new Date(),
      };
      this.emit();

      this.startPolling();
    } catch (err) {
      this.state = {
        ...this.state,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      this.emit();
    }
  }

  async stop(): Promise<void> {
    this.stopPolling();
    if (this.state.traceFlag) {
      try {
        await this.client.deleteTraceFlag(this.state.traceFlag.id);
      } catch {
        // Best-effort cleanup
      }
    }
    this.state = {
      ...this.state,
      status: "stopped",
      traceFlag: undefined,
    };
    this.emit();
  }

  reset(): void {
    this.stopPolling();
    this.state = {
      status: "idle",
      userId: undefined,
      userName: undefined,
      traceFlag: undefined,
      debugLevel: undefined,
      capturedLog: undefined,
      error: undefined,
      startedAt: undefined,
    };
    this.emit();
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  private startPolling(): void {
    this.pollTimer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async poll(): Promise<void> {
    if (this.state.status !== "active" || !this.state.userId) return;

    try {
      const logs = await this.client.getDebugLogs(
        this.state.userId,
        this.state.startedAt
      );

      if (logs.length > 0) {
        const newest = logs[0]!;
        this.stopPolling();
        this.state = {
          ...this.state,
          status: "captured",
          capturedLog: newest,
        };
        this.emit();

        // Auto-cleanup the trace flag after capture
        if (this.state.traceFlag) {
          await this.client.deleteTraceFlag(this.state.traceFlag.id).catch(() => {});
          this.state = { ...this.state, traceFlag: undefined };
          this.emit();
        }
        return;
      }
    } catch {
      // Transient poll error — keep polling
    }

    if (this.state.status === "active") {
      this.pollTimer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async ensureDebugLevel(): Promise<DebugLevel> {
    const levels = await this.client.getDebugLevels();
    const existing = levels.find(
      (l) => l.developerName === XRAY_DEBUG_LEVEL_NAME
    );
    if (existing) return existing;
    return this.client.createDebugLevel(XRAY_DEBUG_LEVEL_NAME);
  }

  getState(): TraceState {
    return { ...this.state };
  }
}
