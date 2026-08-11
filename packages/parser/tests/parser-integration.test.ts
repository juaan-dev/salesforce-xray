import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseLog } from "../src/parser.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dir, "../../../fixtures/logs");

function loadFixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf-8");
}

describe("parseLog — simple-apex.log", () => {
  const result = parseLog(loadFixture("simple-apex.log"));

  it("produces no parse errors", () => {
    expect(result.errors).toHaveLength(0);
  });

  it("finds SOQL and DML queries", () => {
    expect(result.metrics.soqlQueries?.used).toBeGreaterThan(0);
    expect(result.metrics.dmlStatements?.used).toBeGreaterThan(0);
  });

  it("builds an execution tree with children", () => {
    expect(result.tree.children.length).toBeGreaterThan(0);
  });
});

describe("parseLog — trigger-handler.log", () => {
  const result = parseLog(loadFixture("trigger-handler.log"));

  it("produces no parse errors", () => {
    expect(result.errors).toHaveLength(0);
  });

  it("reads SOQL count from LIMIT_USAGE block", () => {
    expect(result.metrics.soqlQueries?.used).toBe(14);
  });

  it("reads DML count from LIMIT_USAGE block", () => {
    expect(result.metrics.dmlStatements?.used).toBe(7);
  });

  it("reads callout count from LIMIT_USAGE block", () => {
    expect(result.metrics.callouts?.used).toBe(2);
  });

  it("reads CPU time from LIMIT_USAGE block", () => {
    expect(result.metrics.cpuTime?.used).toBe(1840);
  });

  it("contains callout node in tree", () => {
    function findType(node: { type: string; children: typeof node[] }, type: string): boolean {
      if (node.type === type) return true;
      return node.children.some((c) => findType(c, type));
    }
    expect(findType(result.tree as any, "callout")).toBe(true);
  });

  it("root duration is set", () => {
    expect(result.tree.duration).toBeDefined();
    expect(result.tree.duration!).toBeGreaterThan(0);
  });
});

describe("parseLog — exception.log", () => {
  const result = parseLog(loadFixture("exception.log"));

  it("detects exception in tree", () => {
    function hasException(node: { type: string; children: typeof node[] }): boolean {
      if (node.type === "exception") return true;
      return node.children.some((c) => hasException(c));
    }
    expect(hasException(result.tree as any)).toBe(true);
  });

  it("identifies CalloutException type", () => {
    function findException(node: { type: string; name: string; children: typeof node[] }): string | undefined {
      if (node.type === "exception") return node.name;
      for (const c of node.children) {
        const found = findException(c);
        if (found) return found;
      }
      return undefined;
    }
    const name = findException(result.tree as any);
    expect(name).toContain("CalloutException");
  });
});

describe("parseLog — flow-apex.log", () => {
  const result = parseLog(loadFixture("flow-apex.log"));

  it("produces no parse errors", () => {
    expect(result.errors).toHaveLength(0);
  });

  it("contains flow nodes in tree", () => {
    function hasFlow(node: { type: string; children: typeof node[] }): boolean {
      if (node.type === "flow") return true;
      return node.children.some((c) => hasFlow(c));
    }
    expect(hasFlow(result.tree as any)).toBe(true);
  });
});

describe("parseLog — governor-limit.log", () => {
  const result = parseLog(loadFixture("governor-limit.log"));

  it("reads near-limit SOQL usage", () => {
    expect(result.metrics.soqlQueries?.used).toBe(87);
    expect(result.metrics.soqlQueries?.limit).toBe(100);
  });

  it("reads near-limit CPU time", () => {
    expect(result.metrics.cpuTime?.used).toBe(8750);
  });

  it("reads heap usage", () => {
    expect(result.metrics.heapSize?.used).toBe(4800000);
  });
});

describe("parseLog — resilience", () => {
  it("does not crash on empty string", () => {
    expect(() => parseLog("")).not.toThrow();
  });

  it("does not crash on only headers", () => {
    expect(() => parseLog("Version: 58.0 APEX_CODE,DEBUG")).not.toThrow();
  });

  it("does not crash on completely malformed input", () => {
    expect(() => parseLog("this is not a log\n!!@#@!")).not.toThrow();
  });

  it("does not crash on unknown event types", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|FUTURE_UNKNOWN_EVENT_TYPE_XYZ_2099|some payload",
      "08:23:41.0 (1200000)|EXECUTION_FINISHED",
    ].join("\n");
    expect(() => parseLog(raw)).not.toThrow();
    const result = parseLog(raw);
    expect(result.stats.unknownEvents).toBeGreaterThan(0);
  });
});
