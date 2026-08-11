import { useState, useEffect, useCallback } from "react";
import "./styles.css";
import type { ExecutionNode, ParseResult, LimitMetric } from "@salesforce-xray/parser";
import { parseLog } from "@salesforce-xray/parser";
import type { Diagnostic } from "@salesforce-xray/analyzer";
import { analyze } from "@salesforce-xray/analyzer";

// ─── Data loading ─────────────────────────────────────────────────────────────

function useLogData(): ParseResult | null | "loading" | "error" {
  const [state, setState] = useState<ParseResult | null | "loading" | "error">("loading");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_LOG" }, (response) => {
      if (chrome.runtime.lastError || !response?.payload) {
        setState("error");
        return;
      }
      try {
        const payload = response.payload as string;
        // Could be raw log or stringified {raw, result}
        let result: ParseResult;
        try {
          const parsed = JSON.parse(payload) as { raw?: string; result?: ParseResult };
          result = parsed.result ?? parseLog(parsed.raw ?? payload);
        } catch {
          result = parseLog(payload);
        }
        setState(result);
      } catch {
        setState("error");
      }
    });
  }, []);

  return state;
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export function XRayApp() {
  const data = useLogData();

  if (data === "loading") {
    return <div className="center"><span className="spinner" /></div>;
  }

  if (data === "error" || !data) {
    return (
      <div className="center">
        <span>No log data found.</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Start a trace from the X-Ray popup or upload a .log file.
        </span>
      </div>
    );
  }

  return <XRayView result={data} />;
}

// ─── Main analysis view ───────────────────────────────────────────────────────

function XRayView({ result }: { result: ParseResult }) {
  const [selectedNode, setSelectedNode] = useState<ExecutionNode | null>(null);
  const { diagnostics } = analyze(result);

  const root = result.tree;
  const dur = root.duration !== undefined ? formatDuration(root.duration) : "—";

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <span className="topbar-title">Salesforce X-Ray</span>
        <span className="topbar-meta">
          {result.stats.parsedEvents} events · {result.stats.totalLines} lines
        </span>
        <span className="topbar-duration">{dur}</span>
      </div>

      {/* Diagnostics */}
      {diagnostics.length > 0 && (
        <div className="diagnostics">
          {diagnostics.map((d, i) => (
            <DiagChip key={i} diagnostic={d} onSelect={() => d.node && setSelectedNode(d.node)} />
          ))}
        </div>
      )}

      <div className="main">
        <div className="left-panel">
          {/* Execution tree */}
          <div className="section-header">Execution</div>
          <div className="tree-scroll">
            <TreeNode
              node={root}
              depth={0}
              maxDuration={root.duration ?? 1}
              selectedId={selectedNode?.id}
              onSelect={setSelectedNode}
            />
          </div>

          {/* Governor limits */}
          <div className="section-header">Governor Limits</div>
          <LimitPanel metrics={result.metrics} />
        </div>

        {/* Node detail */}
        <div className="right-panel">
          <div className="section-header">Detail</div>
          {selectedNode ? (
            <NodeDetail node={selectedNode} />
          ) : (
            <div className="detail-empty">Click a node to inspect it.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Diagnostic chip ──────────────────────────────────────────────────────────

function DiagChip({ diagnostic: d, onSelect }: { diagnostic: Diagnostic; onSelect: () => void }) {
  return (
    <div
      className={`diag-chip ${d.severity === "error" ? "diag-error" : "diag-warning"}`}
      onClick={onSelect}
      title={d.detail}
    >
      <span>{d.severity === "error" ? "🔴" : "⚠"}</span>
      <span>{d.title}</span>
    </div>
  );
}

// ─── Execution tree node ──────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  maxDuration,
  selectedId,
  onSelect,
}: {
  node: ExecutionNode;
  depth: number;
  maxDuration: number;
  selectedId: string | undefined;
  onSelect: (n: ExecutionNode) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const pct = maxDuration > 0 && node.duration !== undefined
    ? Math.min(1, node.duration / maxDuration)
    : 0;

  const barColor = nodeBarColor(node.type);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(node);
    },
    [node, onSelect]
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsed((c) => !c);
    },
    []
  );

  return (
    <div>
      <div
        className={`tree-node type-${node.type} ${selectedId === node.id ? "selected" : ""}`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={handleClick}
      >
        <div className="tree-toggle" onClick={hasChildren ? handleToggle : undefined}>
          {hasChildren ? (collapsed ? "▶" : "▾") : ""}
        </div>
        <div className="tree-name" title={node.name}>{node.name}</div>
        <div className="tree-bar-cell">
          {pct > 0 && (
            <div className="tree-bar-bg" style={{ width: "100%" }}>
              <div
                className="tree-bar-fill"
                style={{ width: `${(pct * 100).toFixed(1)}%`, background: barColor }}
              />
            </div>
          )}
        </div>
        <div className="tree-duration">
          {node.duration !== undefined ? formatDuration(node.duration) : ""}
        </div>
      </div>

      {!collapsed &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            maxDuration={maxDuration}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// ─── Governor limits panel ────────────────────────────────────────────────────

function LimitPanel({ metrics }: { metrics: ParseResult["metrics"] }) {
  const entries: Array<{ label: string; metric: LimitMetric | undefined; unit?: string }> = [
    { label: "CPU Time", metric: metrics.cpuTime, unit: "ms" },
    { label: "SOQL Queries", metric: metrics.soqlQueries },
    { label: "SOQL Rows", metric: metrics.soqlRows },
    { label: "DML Statements", metric: metrics.dmlStatements },
    { label: "DML Rows", metric: metrics.dmlRows },
    { label: "Callouts", metric: metrics.callouts },
    { label: "Heap", metric: metrics.heapSize, unit: "B" },
  ].filter((e): e is typeof e & { metric: LimitMetric } => e.metric !== undefined);

  if (entries.length === 0) {
    return (
      <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-dim)" }}>
        No governor limit data in this log.
      </div>
    );
  }

  return (
    <div className="limits-grid">
      {entries.map(({ label, metric, unit }) => {
        const pct = metric.used / metric.limit;
        const cls = pct >= 1 ? "limit-danger" : pct >= 0.8 ? "limit-warn" : "limit-ok";
        const usedStr = unit === "ms" ? `${metric.used.toLocaleString()}ms`
          : unit === "B" ? formatBytes(metric.used)
          : metric.used.toString();
        const limitStr = unit === "ms" ? `${metric.limit.toLocaleString()}ms`
          : unit === "B" ? formatBytes(metric.limit)
          : metric.limit.toString();
        return (
          <div key={label} className={`limit-item ${cls}`}>
            <div className="limit-label">{label}</div>
            <div className="limit-values">
              <span className="limit-used">{usedStr}</span>
              <span className="limit-total">/ {limitStr}</span>
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

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetail({ node }: { node: ExecutionNode }) {
  return (
    <div className="detail-panel">
      <div>
        <div className="detail-section-title">Node</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`detail-badge badge-${node.type}`}>{node.type}</span>
          <span style={{ fontSize: 12, color: "var(--text-bright)" }}>{node.name}</span>
        </div>
      </div>

      <div>
        <div className="detail-section-title">Timing</div>
        <div className="detail-row">
          <span className="detail-key">Duration</span>
          <span className="detail-val">
            {node.duration !== undefined ? formatDuration(node.duration) : "—"}
          </span>
        </div>
        <div className="detail-row" style={{ marginTop: 4 }}>
          <span className="detail-key">Lines</span>
          <span className="detail-val">
            {node.startLine}{node.endLine ? `–${node.endLine}` : ""}
          </span>
        </div>
      </div>

      {node.type === "soql" && node.metadata["query"] && (
        <div>
          <div className="detail-section-title">Query</div>
          <pre className="detail-query">{String(node.metadata["query"])}</pre>
        </div>
      )}

      {node.type === "dml" && (
        <div>
          <div className="detail-section-title">DML</div>
          <div className="detail-row">
            <span className="detail-key">Operation</span>
            <span className="detail-val">{String(node.metadata["operation"] ?? "—")}</span>
          </div>
          <div className="detail-row" style={{ marginTop: 4 }}>
            <span className="detail-key">sObject</span>
            <span className="detail-val">{String(node.metadata["sobjectType"] ?? "—")}</span>
          </div>
          {node.metadata["rows"] !== undefined && (
            <div className="detail-row" style={{ marginTop: 4 }}>
              <span className="detail-key">Rows</span>
              <span className="detail-val">{String(node.metadata["rows"])}</span>
            </div>
          )}
        </div>
      )}

      {node.type === "callout" && (
        <div>
          <div className="detail-section-title">Callout</div>
          <div className="detail-row">
            <span className="detail-key">Method</span>
            <span className="detail-val">{String(node.metadata["method"] ?? "—")}</span>
          </div>
          <div className="detail-row" style={{ marginTop: 4 }}>
            <span className="detail-key">Endpoint</span>
            <span className="detail-val" style={{ wordBreak: "break-all" }}>
              {String(node.metadata["endpoint"] ?? "—")}
            </span>
          </div>
          {node.metadata["statusCode"] !== undefined && (
            <div className="detail-row" style={{ marginTop: 4 }}>
              <span className="detail-key">Status</span>
              <span className="detail-val">{String(node.metadata["statusCode"])}</span>
            </div>
          )}
        </div>
      )}

      {node.type === "exception" && (
        <div>
          <div className="detail-section-title">Exception</div>
          <div className="detail-row">
            <span className="detail-key">Type</span>
            <span className="detail-val" style={{ color: "var(--error)" }}>
              {String(node.metadata["exceptionType"] ?? node.name)}
            </span>
          </div>
          {node.metadata["message"] && (
            <div className="detail-row" style={{ marginTop: 4 }}>
              <span className="detail-key">Message</span>
              <span className="detail-val">{String(node.metadata["message"])}</span>
            </div>
          )}
        </div>
      )}

      {node.children.length > 0 && (
        <div>
          <div className="detail-section-title">Children</div>
          <div className="detail-row">
            <span className="detail-key">Count</span>
            <span className="detail-val">{node.children.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1) return `${ms.toFixed(0)}ms`;
  return `<1ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)}KB`;
  return `${bytes}B`;
}

function nodeBarColor(type: ExecutionNode["type"]): string {
  switch (type) {
    case "soql": return "#9cdcfe";
    case "dml": return "#ce9178";
    case "callout": return "#dcdcaa";
    case "flow": return "#c586c0";
    case "exception": return "#f44747";
    default: return "#0078d4";
  }
}
