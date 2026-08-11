import type { ExecutionNode, LimitMetric } from "@salesforce-xray/parser";

// ─── Diagnostic severity ──────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning" | "info";

// ─── Individual diagnostic ────────────────────────────────────────────────────

export type DiagnosticKind =
  | "exception"
  | "slow_operation"
  | "high_cpu"
  | "high_soql"
  | "high_dml"
  | "high_callouts"
  | "high_heap"
  | "high_soql_rows"
  | "governor_risk";

export interface Diagnostic {
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  node: ExecutionNode | undefined;
  executionPath: string[];
}

// ─── Threshold configuration ──────────────────────────────────────────────────

export interface AnalyzerThresholds {
  slowOperationMs: number;
  governorWarningPct: number;
}

export const DEFAULT_THRESHOLDS: AnalyzerThresholds = {
  slowOperationMs: 1_000,
  governorWarningPct: 0.8,
};

// ─── Analysis result ──────────────────────────────────────────────────────────

export interface AnalysisResult {
  diagnostics: Diagnostic[];
  hasErrors: boolean;
  hasWarnings: boolean;
  summary: string;
}

// ─── Limit check helper ────────────────────────────────────────────────────────

export interface LimitCheck {
  metric: LimitMetric;
  label: string;
  kind: DiagnosticKind;
}
