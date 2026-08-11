import { describe, it, expect } from "vitest";
import { lex } from "../src/lexer.js";

describe("lexer", () => {
  it("parses a timestamped event line", () => {
    const raw = "08:23:41.0 (517668)|EXECUTION_STARTED";
    const { events } = lex(raw);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.event).toBe("EXECUTION_STARTED");
    expect(e.timestamp).toBe(517668);
    expect(e.payload).toBe("");
  });

  it("parses a line with payload", () => {
    const raw =
      "08:23:41.3 (327456789)|SOQL_EXECUTE_BEGIN|[1]|Aggregations:0|SELECT Id FROM Contact";
    const { events } = lex(raw);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.event).toBe("SOQL_EXECUTE_BEGIN");
    expect(e.payload).toBe("[1]|Aggregations:0|SELECT Id FROM Contact");
  });

  it("skips header lines", () => {
    const raw =
      "Version: 58.0 APEX_CODE,DEBUG\n08:23:41.0 (100)|EXECUTION_STARTED";
    const { events } = lex(raw);
    expect(events).toHaveLength(1);
  });

  it("skips empty lines", () => {
    const raw =
      "08:23:41.0 (100)|EXECUTION_STARTED\n\n\n08:23:41.5 (200)|EXECUTION_FINISHED";
    const { events } = lex(raw);
    expect(events).toHaveLength(2);
  });

  it("reports totalLines correctly", () => {
    const raw = "line1\nline2\nline3";
    const { totalLines } = lex(raw);
    expect(totalLines).toBe(3);
  });

  it("handles CRLF line endings", () => {
    const raw = "08:23:41.0 (100)|EXECUTION_STARTED\r\n08:23:41.5 (200)|EXECUTION_FINISHED";
    const { events } = lex(raw);
    expect(events).toHaveLength(2);
  });

  it("assigns correct line numbers", () => {
    const raw = [
      "Version: 58.0",
      "08:23:41.0 (100)|EXECUTION_STARTED",
    ].join("\n");
    const { events } = lex(raw);
    expect(events[0]!.lineNumber).toBe(2);
  });
});
