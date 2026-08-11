import { useState, useCallback, useRef } from "react";
import "./styles.css";
import { parseLog } from "@salesforce-xray/parser";
import type { ParseResult, ExecutionNode, LimitMetric } from "@salesforce-xray/parser";
import { analyze } from "@salesforce-xray/analyzer";
import type { Diagnostic } from "@salesforce-xray/analyzer";

// ─── Fixture metadata (built-in sample logs) ─────────────────────────────────

const FIXTURES = [
  { file: "trigger-handler.log", label: "trigger-handler.log", desc: "CaseTrigger → callout → DML (2.84s)" },
  { file: "exception.log",       label: "exception.log",       desc: "CalloutException timeout" },
  { file: "governor-limit.log",  label: "governor-limit.log",  desc: "Near-limit CPU / SOQL / DML" },
  { file: "flow-apex.log",       label: "flow-apex.log",       desc: "Trigger + Flow record update" },
  { file: "simple-apex.log",     label: "simple-apex.log",     desc: "Anonymous execute SOQL + DML" },
] as const;

type AppState =
  | { kind: "landing" }
  | { kind: "parsing" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: ParseResult; filename: string };

// ─── Root ─────────────────────────────────────────────────────────────────────

export function App() {
  const [state, setState] = useState<AppState>({ kind: "landing" });

  const load = useCallback((raw: string, filename: string) => {
    setState({ kind: "parsing" });
    // Yield to render, then parse (large logs can take a frame)
    setTimeout(() => {
      try {
        const result = parseLog(raw);
        setState({ kind: "done", result, filename });
      } catch (err) {
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }, 0);
  }, []);

  const loadFixture = useCallback(async (file: string) => {
    setState({ kind: "parsing" });
    try {
      const res = await fetch(`/${file}`);
      if (!res.ok) throw new Error(`Could not load fixture: ${file}`);
      const raw = await res.text();
      load(raw, file);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [load]);

  const reset = useCallback(() => setState({ kind: "landing" }), []);

  return (
    <>
      <TopBar state={state} onReset={reset} />

      {state.kind === "landing" && <Landing onLoad={load} onFixture={loadFixture} />}
      {state.kind === "parsing" && <Parsing />}
      {state.kind === "error"   && <ErrorState message={state.message} onBack={reset} />}
      {state.kind === "done"    && <Analysis result={state.result} />}
    </>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ state, onReset }: { state: AppState; onReset: () => void }) {
  const isDone = state.kind === "done";
  const meta = isDone ? state.result.stats : null;
  const dur = isDone && state.result.tree.duration !== undefined
    ? fmtDur(state.result.tree.duration) : null;

  return (
    <div className="topbar">
      <span className="topbar-logo">Salesforce X-Ray</span>
      <span className="topbar-badge">dev</span>

      {isDone && meta && (
        <span className="topbar-meta">
          {(state as { filename: string }).filename}
          {" · "}
          {meta.parsedEvents} events · {meta.totalLines} lines
          {meta.unknownEvents > 0 && ` · ${meta.unknownEvents} unknown`}
        </span>
      )}

      <div className="topbar-right">
        {dur && <span className="topbar-duration">{dur}</span>}
        {isDone && (
          <button className="btn-new" onClick={onReset}>
            Open another log
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function Landing({
  onLoad,
  onFixture,
}: {
  onLoad: (raw: string, filename: string) => void;
  onFixture: (file: string) => void;
}) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = e.target?.result;
        if (typeof raw === "string") onLoad(raw, file.name);
      };
      reader.readAsText(file);
    },
    [onLoad]
  );

  return (
    <div className="landing">
      <div>
        <div className="landing-title">Drop a Salesforce Debug Log</div>
        <div className="landing-sub">
          Paste or drag any <code>.log</code> file to visualize its execution tree,
          governor limits, and diagnostics — no Salesforce connection required.
        </div>
      </div>

      <div
        className={`drop-zone ${dragover ? "dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => { e.preventDefault(); setDragover(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <span className="drop-icon">📂</span>
        <span className="drop-label">Drop your .log file here</span>
        <span className="drop-or">or</span>
        <button
          className="btn-choose"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          Choose file
        </button>
        <span className="drop-hint">Salesforce Debug Log (.log)</span>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="fixture-list">
        <div className="fixture-label">Or load a built-in sample</div>
        {FIXTURES.map((f) => (
          <button
            key={f.file}
            className="fixture-btn"
            onClick={() => void onFixture(f.file)}
          >
            <span>{f.label}</span>
            <span className="fixture-desc">— {f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function Parsing() {
  return (
    <div className="parsing-overlay">
      <span className="spinner" />
      <span>Parsing log…</span>
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="error-state">
      <span className="error-title">Failed to parse log</span>
      <span className="error-detail">{message}</span>
      <button className="btn-choose" style={{ marginTop: 8 }} onClick={onBack}>
        Try another file
      </button>
    </div>
  );
}

// ─── Analysis view ────────────────────────────────────────────────────────────

function Analysis({ result }: { result: ParseResult }) {
  const [selected, setSelected] = useState<ExecutionNode | null>(null);
  const { diagnostics } = analyze(result);

  return (
    <div className="analysis">
      {diagnostics.length > 0 && (
        <div className="diagnostics">
          {diagnostics.map((d, i) => (
            <DiagChip key={i} d={d} onSelect={() => d.node && setSelected(d.node)} />
          ))}
        </div>
      )}

      <div className="main">
        <div className="left-panel">
          <div className="section-header">Execution Tree</div>
          <div className="tree-scroll">
            <TreeNode
              node={result.tree}
              depth={0}
              maxDur={result.tree.duration ?? 1}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          </div>
          <div className="section-header">Governor Limits</div>
          <LimitsPanel metrics={result.metrics} />
        </div>

        <div className="right-panel">
          <div className="section-header">Detail</div>
          {selected ? <NodeDetail node={selected} /> : (
            <div className="detail-empty">Click any node to inspect it.</div>
          )}
        </div>
      </div>

      <div className="kbd-hint">
        Click to select · Click <kbd>▶</kbd> to expand/collapse
      </div>
    </div>
  );
}

// ─── Diagnostic chip ──────────────────────────────────────────────────────────

function DiagChip({ d, onSelect }: { d: Diagnostic; onSelect: () => void }) {
  return (
    <div
      className={`diag-chip ${d.severity === "error" ? "diag-error" : "diag-warning"}`}
      onClick={d.node ? onSelect : undefined}
      title={d.executionPath.join(" → ")}
      style={{ cursor: d.node ? "pointer" : "default" }}
    >
      <span>{d.severity === "error" ? "🔴" : "⚠"}</span>
      <span>{d.title}</span>
      {d.detail && <span style={{ opacity: 0.7 }}>— {d.detail}</span>}
    </div>
  );
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({
  node, depth, maxDur, selectedId, onSelect,
}: {
  node: ExecutionNode;
  depth: number;
  maxDur: number;
  selectedId: string | undefined;
  onSelect: (n: ExecutionNode) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasKids = node.children.length > 0;
  const pct = maxDur > 0 && node.duration !== undefined
    ? Math.min(1, node.duration / maxDur) : 0;

  return (
    <div>
      <div
        className={`tree-node type-${node.type} ${selectedId === node.id ? "active" : ""}`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => onSelect(node)}
      >
        <div
          className="tree-toggle"
          onClick={hasKids ? (e) => { e.stopPropagation(); setCollapsed((c) => !c); } : undefined}
        >
          {hasKids ? (collapsed ? "▶" : "▾") : ""}
        </div>
        <div className="tree-name" title={node.name}>{node.name}</div>
        <div className="tree-bar-cell">
          {pct > 0 && (
            <div className="tree-bar-bg">
              <div
                className="tree-bar-fill"
                style={{ width: `${(pct * 100).toFixed(1)}%`, background: barColor(node.type) }}
              />
            </div>
          )}
        </div>
        <div className="tree-dur">
          {node.duration !== undefined ? fmtDur(node.duration) : ""}
        </div>
      </div>

      {!collapsed && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} maxDur={maxDur} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── Limits panel ─────────────────────────────────────────────────────────────

function LimitsPanel({ metrics }: { metrics: ParseResult["metrics"] }) {
  const rows: Array<{ label: string; m: LimitMetric; unit?: string }> = [
    { label: "CPU Time",       m: metrics.cpuTime!,       unit: "ms" },
    { label: "SOQL Queries",   m: metrics.soqlQueries! },
    { label: "SOQL Rows",      m: metrics.soqlRows! },
    { label: "DML Statements", m: metrics.dmlStatements! },
    { label: "DML Rows",       m: metrics.dmlRows! },
    { label: "Callouts",       m: metrics.callouts! },
    { label: "Heap",           m: metrics.heapSize!,      unit: "B" },
  ].filter((r): r is typeof r & { m: LimitMetric } => r.m !== undefined);

  if (rows.length === 0) {
    return <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-dim)" }}>No limit data in this log.</div>;
  }

  return (
    <div className="limits-grid">
      {rows.map(({ label, m, unit }) => {
        const pct = m.used / m.limit;
        const cls = pct >= 1 ? "crit" : pct >= 0.8 ? "warn" : "ok";
        return (
          <div key={label} className={cls}>
            <div className="limit-label">{label}</div>
            <div className="limit-row">
              <span className="limit-used">{fmtMetric(m.used, unit)}</span>
              <span className="limit-max">/ {fmtMetric(m.limit, unit)}</span>
            </div>
            <div className="limit-bar-bg">
              <div className="limit-bar-fill" style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Node detail ──────────────────────────────────────────────────────────────

function NodeDetail({ node }: { node: ExecutionNode }) {
  const badgeCls = `type-badge badge-${["soql","dml","callout","exception","flow"].includes(node.type) ? node.type : "default"}`;

  return (
    <div className="detail-body">
      <div>
        <div className="detail-section-title">Node</div>
        <span className={badgeCls}>{node.type}</span>
        <div style={{ fontSize: 12, color: "var(--text-bright)", marginTop: 4, fontFamily: "var(--mono)", wordBreak: "break-word" }}>
          {node.name}
        </div>
      </div>

      <div>
        <div className="detail-section-title">Timing</div>
        <div className="detail-row"><span className="dk">Duration</span><span className="dv">{node.duration !== undefined ? fmtDur(node.duration) : "—"}</span></div>
        <div className="detail-row"><span className="dk">Lines</span><span className="dv">{node.startLine}{node.endLine ? `–${node.endLine}` : ""}</span></div>
      </div>

      {node.type === "soql" && node.metadata["query"] && (
        <div>
          <div className="detail-section-title">Query</div>
          <pre className="query-block">{String(node.metadata["query"])}</pre>
        </div>
      )}

      {node.type === "dml" && (
        <div>
          <div className="detail-section-title">DML</div>
          <div className="detail-row"><span className="dk">Operation</span><span className="dv">{String(node.metadata["operation"] ?? "—")}</span></div>
          <div className="detail-row"><span className="dk">sObject</span><span className="dv">{String(node.metadata["sobjectType"] ?? "—")}</span></div>
          {node.metadata["rows"] !== undefined && (
            <div className="detail-row"><span className="dk">Rows</span><span className="dv">{String(node.metadata["rows"])}</span></div>
          )}
        </div>
      )}

      {node.type === "callout" && (
        <div>
          <div className="detail-section-title">HTTP Callout</div>
          <div className="detail-row"><span className="dk">Method</span><span className="dv">{String(node.metadata["method"] ?? "—")}</span></div>
          <div className="detail-row"><span className="dk">Endpoint</span><span className="dv">{String(node.metadata["endpoint"] ?? "—")}</span></div>
          {node.metadata["statusCode"] !== undefined && (
            <div className="detail-row"><span className="dk">Status</span><span className="dv">{String(node.metadata["statusCode"])}</span></div>
          )}
        </div>
      )}

      {node.type === "exception" && (
        <div>
          <div className="detail-section-title">Exception</div>
          <div className="detail-row"><span className="dk">Type</span><span className="dv" style={{ color: "var(--exception)" }}>{String(node.metadata["exceptionType"] ?? node.name)}</span></div>
          {node.metadata["message"] && (
            <div className="detail-row"><span className="dk">Message</span><span className="dv">{String(node.metadata["message"])}</span></div>
          )}
        </div>
      )}

      {node.children.length > 0 && (
        <div>
          <div className="detail-section-title">Children</div>
          <div className="detail-row"><span className="dk">Count</span><span className="dv">{node.children.length}</span></div>
        </div>
      )}

      {node.executionPath !== undefined && (node as { executionPath?: string[] }).executionPath?.length > 0 && (
        <div>
          <div className="detail-section-title">Raw payload</div>
          <pre className="query-block" style={{ color: "var(--text-dim)", fontSize: 10 }}>
            {String(node.metadata["raw"] ?? "")}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDur(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1)    return `${ms.toFixed(0)}ms`;
  return "<1ms";
}

function fmtMetric(n: number, unit?: string): string {
  if (unit === "ms") return `${n.toLocaleString()}ms`;
  if (unit === "B")  return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}MB` : n >= 1_000 ? `${(n/1_000).toFixed(0)}KB` : `${n}B`;
  return n.toLocaleString();
}

function barColor(type: ExecutionNode["type"]): string {
  const map: Partial<Record<ExecutionNode["type"], string>> = {
    soql: "#9cdcfe", dml: "#ce9178", callout: "#dcdcaa",
    flow: "#c586c0", exception: "#f44747",
  };
  return map[type] ?? "#0078d4";
}
