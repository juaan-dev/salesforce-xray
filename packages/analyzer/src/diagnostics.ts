import type { ExecutionNode, ParseResult } from "@salesforce-xray/parser";
import type {
  Diagnostic,
  AnalyzerThresholds,
  LimitCheck,
} from "./types.js";
import { DEFAULT_THRESHOLDS } from "./types.js";

// ─── Execution path helpers ───────────────────────────────────────────────────

function buildPath(
  root: ExecutionNode,
  target: ExecutionNode,
  currentPath: string[] = []
): string[] | undefined {
  const path = [...currentPath, root.name];
  if (root.id === target.id) return path;
  for (const child of root.children) {
    const found = buildPath(child, target, path);
    if (found) return found;
  }
  return undefined;
}

function pathTo(root: ExecutionNode, node: ExecutionNode): string[] {
  return buildPath(root, node) ?? [node.name];
}

// ─── Tree traversal ───────────────────────────────────────────────────────────

function walk(node: ExecutionNode, fn: (n: ExecutionNode) => void): void {
  fn(node);
  for (const child of node.children) walk(child, fn);
}

// ─── Slow operation detection ─────────────────────────────────────────────────

function detectSlowOperations(
  root: ExecutionNode,
  thresholdMs: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walk(root, (node) => {
    if (node === root) return;
    if (node.duration === undefined || node.duration < thresholdMs) return;
    // Skip wrapper nodes — only flag leaf-ish nodes or meaningful named operations
    if (node.type === "transaction") return;

    diagnostics.push({
      kind: "slow_operation",
      severity: "warning",
      title: "Slow operation",
      detail: `${node.name} took ${node.duration.toFixed(0)}ms (threshold: ${thresholdMs}ms)`,
      node,
      executionPath: pathTo(root, node),
    });
  });

  // Sort by duration descending so the slowest appear first
  return diagnostics.sort(
    (a, b) => (b.node?.duration ?? 0) - (a.node?.duration ?? 0)
  );
}

// ─── Exception detection ──────────────────────────────────────────────────────

function detectExceptions(root: ExecutionNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walk(root, (node) => {
    if (node.type !== "exception") return;

    const exType = String(node.metadata["exceptionType"] ?? node.name);
    const message = node.metadata["message"]
      ? String(node.metadata["message"])
      : "";

    diagnostics.push({
      kind: "exception",
      severity: "error",
      title: exType,
      detail: message,
      node,
      executionPath: pathTo(root, node),
    });
  });

  return diagnostics;
}

// ─── Governor limit checks ────────────────────────────────────────────────────

function detectGovernorRisks(
  result: ParseResult,
  warningPct: number
): Diagnostic[] {
  const m = result.metrics;
  const diagnostics: Diagnostic[] = [];

  const checks: LimitCheck[] = [
    { metric: m.cpuTime!, label: "CPU time", kind: "high_cpu" },
    { metric: m.soqlQueries!, label: "SOQL queries", kind: "high_soql" },
    { metric: m.soqlRows!, label: "SOQL rows", kind: "high_soql_rows" },
    { metric: m.dmlStatements!, label: "DML statements", kind: "high_dml" },
    { metric: m.callouts!, label: "Callouts", kind: "high_callouts" },
    { metric: m.heapSize!, label: "Heap size", kind: "high_heap" },
  ].filter((c): c is LimitCheck & { metric: NonNullable<typeof c.metric> } =>
    c.metric !== undefined
  );

  for (const check of checks) {
    const { metric, label, kind } = check;
    const pct = metric.used / metric.limit;
    if (pct < warningPct) continue;

    const pctStr = (pct * 100).toFixed(0);
    const severity = pct >= 1 ? "error" : "warning";

    diagnostics.push({
      kind,
      severity,
      title: `${label} usage at ${pctStr}%`,
      detail: `${metric.used.toLocaleString()} / ${metric.limit.toLocaleString()}`,
      node: undefined,
      executionPath: [],
    });
  }

  return diagnostics;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function diagnose(
  result: ParseResult,
  thresholds: AnalyzerThresholds = DEFAULT_THRESHOLDS
): Diagnostic[] {
  const exceptions = detectExceptions(result.tree);
  const slowOps = detectSlowOperations(result.tree, thresholds.slowOperationMs);
  const limits = detectGovernorRisks(result, thresholds.governorWarningPct);

  // Errors first (exceptions, limit violations), then warnings ordered by severity
  return [...exceptions, ...limits, ...slowOps];
}
