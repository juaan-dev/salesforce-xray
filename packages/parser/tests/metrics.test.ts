import { describe, it, expect } from "vitest";
import { extractMetrics } from "../src/metrics.js";
import { lex } from "../src/lexer.js";

function metricsFrom(raw: string) {
  const { events } = lex(raw);
  return extractMetrics(events);
}

const LIMIT_BLOCK = `
11:30:01.0 (1070000001)|LIMIT_USAGE_FOR_NS|(default)|
  Number of SOQL queries: 14 out of 100
  Number of query rows: 47 out of 50000
  Number of SOSL queries: 0 out of 20
  Number of DML statements: 7 out of 150
  Number of DML rows: 22 out of 10000
  Maximum CPU time: 1840 out of 10000
  Maximum heap size: 2048000 out of 6000000
  Number of callouts: 2 out of 100
`;

describe("extractMetrics", () => {
  it("parses SOQL count from LIMIT_USAGE_FOR_NS", () => {
    const m = metricsFrom(LIMIT_BLOCK);
    expect(m.soqlQueries?.used).toBe(14);
    expect(m.soqlQueries?.limit).toBe(100);
  });

  it("parses DML count from LIMIT_USAGE_FOR_NS", () => {
    const m = metricsFrom(LIMIT_BLOCK);
    expect(m.dmlStatements?.used).toBe(7);
    expect(m.dmlStatements?.limit).toBe(150);
  });

  it("parses CPU time from LIMIT_USAGE_FOR_NS", () => {
    const m = metricsFrom(LIMIT_BLOCK);
    expect(m.cpuTime?.used).toBe(1840);
    expect(m.cpuTime?.limit).toBe(10000);
  });

  it("parses callouts from LIMIT_USAGE_FOR_NS", () => {
    const m = metricsFrom(LIMIT_BLOCK);
    expect(m.callouts?.used).toBe(2);
    expect(m.callouts?.limit).toBe(100);
  });

  it("parses heap size from LIMIT_USAGE_FOR_NS", () => {
    const m = metricsFrom(LIMIT_BLOCK);
    expect(m.heapSize?.used).toBe(2048000);
    expect(m.heapSize?.limit).toBe(6000000);
  });

  it("synthesizes SOQL count from events when no LIMIT_USAGE present", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.1 (50000000)|SOQL_EXECUTE_BEGIN|[1]|Aggregations:0|SELECT Id FROM Contact",
      "08:23:41.1 (80000000)|SOQL_EXECUTE_END|[1]|Rows:3",
      "08:23:41.1 (90000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account",
      "08:23:41.1 (120000000)|SOQL_EXECUTE_END|[2]|Rows:1",
      "08:23:41.5 (500000000)|EXECUTION_FINISHED",
    ].join("\n");

    const m = metricsFrom(raw);
    expect(m.soqlQueries?.used).toBe(2);
  });

  it("synthesizes DML count from events when no LIMIT_USAGE present", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.1 (50000000)|DML_BEGIN|[1]|Op:Insert|Type:Contact|Rows:1",
      "08:23:41.1 (80000000)|DML_END|[1]",
      "08:23:41.5 (500000000)|EXECUTION_FINISHED",
    ].join("\n");

    const m = metricsFrom(raw);
    expect(m.dmlStatements?.used).toBe(1);
  });

  it("returns undefined for metrics absent from log", () => {
    const raw = "08:23:41.0 (1000000)|EXECUTION_STARTED\n08:23:41.0 (2000000)|EXECUTION_FINISHED";
    const m = metricsFrom(raw);
    expect(m.cpuTime).toBeUndefined();
    expect(m.soqlQueries).toBeUndefined();
  });

  it("keeps highest usage when multiple LIMIT_USAGE blocks appear", () => {
    const raw = [
      "08:23:41.0 (1000000)|LIMIT_USAGE_FOR_NS|(default)|\n  Number of SOQL queries: 5 out of 100",
      "08:23:41.0 (2000000)|CUMULATIVE_LIMIT_USAGE",
      "08:23:41.0 (2000001)|LIMIT_USAGE_FOR_NS|(default)|\n  Number of SOQL queries: 14 out of 100",
      "08:23:41.0 (2000002)|CUMULATIVE_LIMIT_USAGE_END",
    ].join("\n");

    const m = metricsFrom(raw);
    expect(m.soqlQueries?.used).toBe(14);
  });
});
