import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseLog } from "@salesforce-xray/parser";
import { analyze, diagnose } from "../src/index.js";
import type { AnalyzerThresholds } from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dir, "../../../fixtures/logs");

function load(name: string) {
  return parseLog(readFileSync(join(fixtures, name), "utf-8"));
}

describe("diagnostics — exception.log", () => {
  const result = load("exception.log");
  const diagnostics = diagnose(result);

  it("detects CalloutException as error severity", () => {
    const ex = diagnostics.find((d) => d.kind === "exception");
    expect(ex).toBeDefined();
    expect(ex!.severity).toBe("error");
    expect(ex!.title).toContain("CalloutException");
  });

  it("includes exception message in detail", () => {
    const ex = diagnostics.find((d) => d.kind === "exception");
    expect(ex!.detail).toContain("timed out");
  });

  it("provides an execution path", () => {
    const ex = diagnostics.find((d) => d.kind === "exception");
    expect(ex!.executionPath.length).toBeGreaterThan(0);
  });

  it("attaches the exception node", () => {
    const ex = diagnostics.find((d) => d.kind === "exception");
    expect(ex!.node).toBeDefined();
    expect(ex!.node!.type).toBe("exception");
  });
});

describe("diagnostics — governor-limit.log", () => {
  const result = load("governor-limit.log");
  const diagnostics = diagnose(result);

  it("detects high SOQL usage (87/100 = 87%)", () => {
    const d = diagnostics.find((d) => d.kind === "high_soql");
    expect(d).toBeDefined();
    expect(d!.severity).toBe("warning");
    expect(d!.detail).toContain("87");
  });

  it("detects high CPU usage (8750/10000 = 87.5%)", () => {
    const d = diagnostics.find((d) => d.kind === "high_cpu");
    expect(d).toBeDefined();
    expect(d!.severity).toBe("warning");
  });

  it("detects high heap usage (4800000/6000000 = 80%)", () => {
    const d = diagnostics.find((d) => d.kind === "high_heap");
    expect(d).toBeDefined();
  });

  it("detects high DML usage (130/150 = 86%)", () => {
    const d = diagnostics.find((d) => d.kind === "high_dml");
    expect(d).toBeDefined();
  });
});

describe("diagnostics — trigger-handler.log", () => {
  const result = load("trigger-handler.log");

  it("detects no errors (no exceptions in log)", () => {
    const diagnostics = diagnose(result);
    expect(diagnostics.filter((d) => d.kind === "exception")).toHaveLength(0);
  });

  it("detects callout as slow operation (2650ms > 1000ms threshold)", () => {
    const diagnostics = diagnose(result);
    const slow = diagnostics.filter((d) => d.kind === "slow_operation");
    expect(slow.length).toBeGreaterThan(0);
    // The callout (and its parent method) both exceed the threshold
    const hasCallout = slow.some((d) => d.node?.type === "callout");
    expect(hasCallout).toBe(true);
  });

  it("respects custom threshold — no slow ops at 3000ms threshold", () => {
    const thresholds: AnalyzerThresholds = {
      slowOperationMs: 3_000,
      governorWarningPct: 0.8,
    };
    const diagnostics = diagnose(result, thresholds);
    const slow = diagnostics.filter((d) => d.kind === "slow_operation");
    expect(slow).toHaveLength(0);
  });

  it("does not flag governor limits (14/100 SOQL is well under 80%)", () => {
    const diagnostics = diagnose(result);
    const limitDiags = diagnostics.filter(
      (d) =>
        d.kind === "high_soql" ||
        d.kind === "high_dml" ||
        d.kind === "high_cpu"
    );
    expect(limitDiags).toHaveLength(0);
  });
});

describe("analyze — summary", () => {
  it("returns hasErrors=true for exception log", () => {
    const r = analyze(load("exception.log"));
    expect(r.hasErrors).toBe(true);
    expect(r.summary).toContain("error");
  });

  it("returns hasWarnings=true for governor-limit log", () => {
    const r = analyze(load("governor-limit.log"));
    expect(r.hasWarnings).toBe(true);
  });

  it("returns no issues for simple-apex log", () => {
    const thresholds: AnalyzerThresholds = {
      slowOperationMs: 5_000,
      governorWarningPct: 0.9,
    };
    const r = analyze(load("simple-apex.log"), thresholds);
    expect(r.hasErrors).toBe(false);
    expect(r.hasWarnings).toBe(false);
    expect(r.summary).toBe("No issues detected");
  });

  it("orders errors before warnings", () => {
    const r = analyze(load("exception.log"));
    const firstError = r.diagnostics.findIndex((d) => d.severity === "error");
    const firstWarning = r.diagnostics.findIndex((d) => d.severity === "warning");
    if (firstError !== -1 && firstWarning !== -1) {
      expect(firstError).toBeLessThan(firstWarning);
    }
  });
});
