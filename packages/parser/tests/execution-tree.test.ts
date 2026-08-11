import { describe, it, expect, beforeEach } from "vitest";
import { buildExecutionTree, resetIdCounter } from "../src/execution-tree.js";
import { lex } from "../src/lexer.js";

beforeEach(() => resetIdCounter());

function treeFrom(raw: string) {
  const { events } = lex(raw);
  return buildExecutionTree(events);
}

describe("buildExecutionTree", () => {
  it("builds a transaction root with a code unit child", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.5 (500000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.5 (501000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    expect(root.type).toBe("transaction");
    expect(root.children).toHaveLength(1);
    const cu = root.children[0]!;
    expect(cu.type).toBe("code_unit");
    expect(cu.name).toBe("MyClass");
  });

  it("nests methods inside code units", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|CaseTrigger",
      "08:23:41.0 (1200000)|METHOD_ENTRY|[10]|CaseTrigger.CaseTrigger()",
      "08:23:41.0 (1300000)|METHOD_EXIT|[10]|CaseTrigger",
      "08:23:41.5 (500000000)|CODE_UNIT_FINISHED|CaseTrigger",
      "08:23:41.5 (501000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    expect(cu.type).toBe("code_unit");
    expect(cu.children).toHaveLength(1);
    expect(cu.children[0]!.type).toBe("method");
  });

  it("calculates duration from timestamps", () => {
    const raw = [
      "08:23:41.0 (0)|EXECUTION_STARTED",
      "08:23:41.0 (1000000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.1 (100000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.1 (101000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    expect(cu.duration).toBeCloseTo(99, 0); // (100000000 - 1000000) / 1e6 ≈ 99ms
  });

  it("attaches SOQL nodes as children", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.1 (50000000)|SOQL_EXECUTE_BEGIN|[1]|Aggregations:0|SELECT Id FROM Contact",
      "08:23:41.1 (80000000)|SOQL_EXECUTE_END|[1]|Rows:5",
      "08:23:41.5 (500000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.5 (501000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    expect(cu.children).toHaveLength(1);
    expect(cu.children[0]!.type).toBe("soql");
  });

  it("attaches DML nodes as children", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.1 (50000000)|DML_BEGIN|[2]|Op:Update|Type:Contact|Rows:3",
      "08:23:41.1 (80000000)|DML_END|[2]",
      "08:23:41.5 (500000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.5 (501000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    const dml = cu.children[0]!;
    expect(dml.type).toBe("dml");
    expect(dml.metadata["operation"]).toBe("Update");
    expect(dml.metadata["sobjectType"]).toBe("Contact");
  });

  it("attaches callout nodes with metadata", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.1 (50000000)|CALLOUT_REQUEST|[3]|System.HttpRequest[Endpoint=https://api.example.com/v1, Method=POST]",
      "08:23:41.9 (900000000)|CALLOUT_RESPONSE|[3]|System.HttpResponse[Status=OK, StatusCode=200]",
      "08:23:41.9 (901000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.9 (902000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    const callout = cu.children[0]!;
    expect(callout.type).toBe("callout");
    expect(callout.metadata["method"]).toBe("POST");
    expect(String(callout.metadata["endpoint"])).toContain("api.example.com");
  });

  it("captures exceptions as leaf nodes", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      "08:23:41.1 (50000000)|EXCEPTION_THROWN|[5]|System.CalloutException: Read timed out",
      "08:23:41.1 (51000000)|CODE_UNIT_FINISHED|MyClass",
      "08:23:41.1 (52000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const cu = root.children[0]!;
    const exception = cu.children[0]!;
    expect(exception.type).toBe("exception");
    expect(exception.name).toBe("System.CalloutException");
    expect(exception.metadata["message"]).toBe("Read timed out");
  });

  it("handles flow events", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (2000000)|FLOW_START_INTERVIEWS_BEGIN|1",
      "08:23:41.0 (2100000)|FLOW_START_INTERVIEW_BEGIN|Case_After_Save|Case_After_Save",
      "08:23:41.1 (100000000)|FLOW_INTERVIEW_FINISHED|Case_After_Save|Case_After_Save",
      "08:23:41.1 (101000000)|FLOW_START_INTERVIEWS_END|1",
      "08:23:41.1 (102000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const flowNodes = root.children.filter((c) => c.type === "flow");
    expect(flowNodes.length).toBeGreaterThan(0);
  });

  it("does not crash on unknown events", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|COMPLETELY_UNKNOWN_EVENT_XYZ|some payload here",
      "08:23:41.0 (1200000)|EXECUTION_FINISHED",
    ].join("\n");

    expect(() => treeFrom(raw)).not.toThrow();
  });

  it("is tolerant of truncated logs (unclosed units)", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|MyClass",
      // no CODE_UNIT_FINISHED
    ].join("\n");

    expect(() => treeFrom(raw)).not.toThrow();
    const root = treeFrom(raw);
    expect(root.children.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves execution order of siblings", () => {
    const raw = [
      "08:23:41.0 (1000000)|EXECUTION_STARTED",
      "08:23:41.0 (1100000)|CODE_UNIT_STARTED|[EXTERNAL]|First",
      "08:23:41.1 (100000000)|CODE_UNIT_FINISHED|First",
      "08:23:41.1 (101000000)|CODE_UNIT_STARTED|[EXTERNAL]|Second",
      "08:23:41.2 (200000000)|CODE_UNIT_FINISHED|Second",
      "08:23:41.2 (201000000)|EXECUTION_FINISHED",
    ].join("\n");

    const root = treeFrom(raw);
    const names = root.children.map((c) => c.name);
    expect(names).toEqual(["First", "Second"]);
  });
});
