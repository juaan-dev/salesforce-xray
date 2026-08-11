import { useState, useEffect, useCallback, useRef } from "react";
import "./styles.css";
import { useSession } from "./useSession.js";
import {
  BrowserSalesforceClient,
  TraceService,
} from "@salesforce-xray/salesforce";
import type { SalesforceUser, TraceState } from "@salesforce-xray/salesforce";
import type { PopupView } from "./types.js";
import { UploadView } from "./UploadView.js";

export function App() {
  const [view, setView] = useState<PopupView>("trace");
  const session = useSession();

  if (session === "loading") {
    return (
      <div className="app">
        <Header view={view} onViewChange={setView} />
        <div className="body no-session">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <Header view={view} onViewChange={setView} />
        {view === "trace" ? (
          <div className="body">
            <div className="no-session">
              <span className="no-session-title">Not on a Salesforce page</span>
              <span className="no-session-hint">
                Open a Salesforce org tab, then reopen X-Ray.
              </span>
            </div>
          </div>
        ) : (
          <UploadView />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <Header view={view} onViewChange={setView} />
      {view === "trace" ? (
        <TraceView
          instanceUrl={session.instanceUrl}
          sessionToken={session.sessionToken}
          apiVersion={session.apiVersion}
        />
      ) : (
        <UploadView />
      )}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  view,
  onViewChange,
}: {
  view: PopupView;
  onViewChange: (v: PopupView) => void;
}) {
  return (
    <div className="header">
      <span className="header-title">Salesforce X-Ray</span>
      <div className="header-tabs">
        <button
          className={`tab-btn ${view === "trace" ? "active" : ""}`}
          onClick={() => onViewChange("trace")}
        >
          Live Trace
        </button>
        <button
          className={`tab-btn ${view === "upload" ? "active" : ""}`}
          onClick={() => onViewChange("upload")}
        >
          Upload Log
        </button>
      </div>
    </div>
  );
}

// ─── Trace view ───────────────────────────────────────────────────────────────

function TraceView({
  instanceUrl,
  sessionToken,
  apiVersion,
}: {
  instanceUrl: string;
  sessionToken: string;
  apiVersion: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SalesforceUser[]>([]);
  const [selected, setSelected] = useState<SalesforceUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [traceState, setTraceState] = useState<TraceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef(
    new BrowserSalesforceClient({ instanceUrl, sessionToken, apiVersion })
  );
  const traceServiceRef = useRef(new TraceService(clientRef.current));

  // Subscribe to trace state
  useEffect(() => {
    return traceServiceRef.current.subscribe(setTraceState);
  }, []);

  // Open X-Ray tab when log is captured
  useEffect(() => {
    if (!traceState || traceState.status !== "captured" || !traceState.capturedLog) return;
    void (async () => {
      try {
        const body = await clientRef.current.getDebugLogBody(
          traceState.capturedLog!.id
        );
        await chrome.runtime.sendMessage({ type: "STORE_LOG", payload: body });
        await chrome.runtime.sendMessage({ type: "OPEN_XRAY" });
      } catch {
        setError("Failed to open X-Ray. Check console for details.");
      }
    })();
  }, [traceState?.status]);

  // Debounced user search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      setSelected(null);

      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(async () => {
        setSearching(true);
        setError(null);
        try {
          const users = await clientRef.current.getUsers(q);
          setResults(users);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    []
  );

  const handleStart = useCallback(async () => {
    if (!selected) return;
    setError(null);
    try {
      await traceServiceRef.current.start(selected.id, selected.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selected]);

  const handleStop = useCallback(async () => {
    await traceServiceRef.current.stop();
  }, []);

  const handleReset = useCallback(() => {
    traceServiceRef.current.reset();
    setSelected(null);
    setResults([]);
    setQuery("");
    setError(null);
  }, []);

  // ── Tracing active ─────────────────────────────────────────────────────────
  if (traceState?.status === "active" || traceState?.status === "starting") {
    return (
      <div className="body">
        <div className="trace-active">
          <div>
            <div className="status-pill status-tracing">
              <span className="dot dot-pulse" />
              {traceState.status === "starting" ? "Starting…" : "Tracing"}
            </div>
          </div>
          <div className="trace-info-row">
            <span className="trace-label">User</span>
            <span className="trace-value">{traceState.userName}</span>
          </div>
          <div className="hint">
            Ask the user to reproduce the problem in Salesforce.
            X-Ray will capture the Debug Log automatically.
          </div>
          <button className="btn btn-danger" onClick={handleStop}>
            Stop tracing
          </button>
        </div>
      </div>
    );
  }

  // ── Captured ───────────────────────────────────────────────────────────────
  if (traceState?.status === "captured") {
    return (
      <div className="body">
        <div className="trace-active">
          <div>
            <div className="status-pill status-captured">
              <span className="dot" />
              Transaction captured
            </div>
          </div>
          <div className="trace-info-row">
            <span className="trace-label">User</span>
            <span className="trace-value">{traceState.userName}</span>
          </div>
          <div className="trace-info-row">
            <span className="trace-label">Log size</span>
            <span className="trace-value">
              {((traceState.capturedLog?.logLength ?? 0) / 1024).toFixed(0)} KB
            </span>
          </div>
          <div className="hint">X-Ray analysis is opening in a new tab…</div>
          <button className="btn btn-primary" onClick={handleReset}>
            Start new trace
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / select user ─────────────────────────────────────────────────────
  return (
    <div className="body">
      <input
        autoFocus
        className="search-input"
        placeholder="Search Salesforce user…"
        type="text"
        value={query}
        onChange={handleQueryChange}
      />

      {searching && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span className="spinner" />
        </div>
      )}

      {results.length > 0 && (
        <ul className="user-list">
          {results.map((u) => (
            <li
              key={u.id}
              className={`user-item ${selected?.id === u.id ? "selected" : ""}`}
              onClick={() => setSelected(u)}
            >
              <div className="user-name">{u.name}</div>
              <div className="user-username">{u.username}</div>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="error-box">{error}</div>}

      <button
        className="btn btn-primary"
        disabled={!selected}
        onClick={handleStart}
      >
        {selected ? `Start tracing ${selected.name}` : "Start tracing"}
      </button>
    </div>
  );
}
