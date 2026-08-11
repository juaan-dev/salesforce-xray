import type { ParseResult } from "@salesforce-xray/parser";
import { diagnose } from "./diagnostics.js";
import type { AnalysisResult, AnalyzerThresholds } from "./types.js";
import { DEFAULT_THRESHOLDS } from "./types.js";

export function analyze(
  result: ParseResult,
  thresholds: AnalyzerThresholds = DEFAULT_THRESHOLDS
): AnalysisResult {
  const diagnostics = diagnose(result, thresholds);
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  const hasWarnings = diagnostics.some((d) => d.severity === "warning");

  let summary: string;
  if (hasErrors) {
    const errors = diagnostics.filter((d) => d.severity === "error");
    summary = `${errors.length} error${errors.length !== 1 ? "s" : ""} detected`;
  } else if (hasWarnings) {
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    summary = `${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`;
  } else {
    summary = "No issues detected";
  }

  return { diagnostics, hasErrors, hasWarnings, summary };
}
