import type { LogEvent, ExecutionNode, ExecutionNodeType } from "./types.js";
import { classifyEvent, type EventClass } from "./events.js";
import { nanoToMs } from "./lexer.js";

let _idCounter = 0;
function nextId(): string {
  return `node-${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

function eventClassToNodeType(cls: EventClass): ExecutionNodeType {
  switch (cls) {
    case "transaction_start":
    case "transaction_end":
      return "transaction";
    case "code_unit_start":
    case "code_unit_end":
      return "code_unit";
    case "method_entry":
    case "method_exit":
      return "method";
    case "flow_start":
    case "flow_end":
    case "flow_element_begin":
    case "flow_element_end":
      return "flow";
    case "soql_begin":
    case "soql_end":
      return "soql";
    case "dml_begin":
    case "dml_end":
      return "dml";
    case "callout_request":
    case "callout_response":
      return "callout";
    case "exception":
    case "fatal_error":
      return "exception";
    default:
      return "other";
  }
}

interface StackFrame {
  node: ExecutionNode;
  eventClass: EventClass;
}

const START_CLASSES = new Set<EventClass>([
  "transaction_start",
  "code_unit_start",
  "method_entry",
  "flow_start",
  "flow_element_begin",
  "soql_begin",
  "dml_begin",
  "callout_request",
]);

const END_CLASSES = new Set<EventClass>([
  "transaction_end",
  "code_unit_end",
  "method_exit",
  "flow_end",
  "flow_element_end",
  "soql_end",
  "dml_end",
  "callout_response",
]);

const MATCHING_START: Partial<Record<EventClass, EventClass>> = {
  transaction_end: "transaction_start",
  code_unit_end: "code_unit_start",
  method_exit: "method_entry",
  flow_end: "flow_start",
  flow_element_end: "flow_element_begin",
  soql_end: "soql_begin",
  dml_end: "dml_begin",
  callout_response: "callout_request",
};

// Strip leading [lineNumber]| prefix that appears in many Salesforce payloads
function stripLineRef(payload: string): string {
  return payload.replace(/^\[\d+\]\|/, "");
}

function extractName(event: LogEvent, cls: EventClass): string {
  const payload = stripLineRef(event.payload);
  switch (cls) {
    case "transaction_start":
    case "transaction_end":
      return "Transaction";
    case "code_unit_start": {
      const parts = payload.split("|");
      return parts[parts.length - 1]?.trim() ?? payload;
    }
    case "code_unit_end":
      return payload || "Code Unit";
    case "method_entry":
    case "method_exit": {
      const sig = payload.split(",")[1]?.trim() ?? payload;
      return sig;
    }
    case "soql_begin": {
      const soqlParts = payload.split("|");
      const query = soqlParts[soqlParts.length - 1]?.trim() ?? "";
      return query ? `SOQL: ${query}` : "SOQL";
    }
    case "soql_end":
      return "SOQL";
    case "dml_begin": {
      const [op, obj] = payload.split("|");
      const opName = (op ?? "").replace(/^Op:/i, "");
      const objName = (obj ?? "").replace(/^Type:/i, "");
      return `DML ${opName} ${objName}`.trim();
    }
    case "dml_end":
      return "DML";
    case "callout_request": {
      const method = extractCalloutMethod(payload);
      const url = extractCalloutUrl(payload);
      return `${method} ${url}`.trim() || "HTTP Callout";
    }
    case "callout_response":
      return "Callout Response";
    case "exception":
    case "fatal_error":
      return extractExceptionType(payload);
    case "flow_start":
    case "flow_end": {
      const name = payload.split("|")[0]?.trim() ?? "";
      return name ? `Flow: ${name}` : "Flow";
    }
    case "flow_element_begin":
    case "flow_element_end": {
      const parts = payload.split("|");
      return parts[1]?.trim() ?? parts[0]?.trim() ?? "Flow Element";
    }
    default:
      return event.event;
  }
}

function extractCalloutMethod(payload: string): string {
  const m = /Method=([A-Z]+)/.exec(payload);
  return m?.[1] ?? "";
}

function extractCalloutUrl(payload: string): string {
  const m = /Endpoint=([^,\]\s]+)/.exec(payload);
  if (!m?.[1]) return "";
  try {
    const u = new URL(m[1]);
    return u.hostname + u.pathname;
  } catch {
    return m[1];
  }
}

function extractExceptionType(payload: string): string {
  const colon = payload.indexOf(":");
  return colon !== -1 ? payload.slice(0, colon).trim() : payload.trim();
}

function buildMetadata(event: LogEvent, cls: EventClass): Record<string, unknown> {
  const payload = stripLineRef(event.payload);
  const base: Record<string, unknown> = { raw: event.payload };

  if (cls === "soql_begin") {
    const parts = payload.split("|");
    base["query"] = parts[parts.length - 1]?.trim() ?? "";
    const rowsM = /Aggregations:\d+/.exec(payload);
    if (rowsM) base["aggregations"] = true;
  }

  if (cls === "dml_begin") {
    const [op, obj, , rows] = payload.split("|");
    if (op) base["operation"] = op.trim().replace(/^Op:/i, "");
    if (obj) base["sobjectType"] = obj.trim().replace(/^Type:/i, "");
    if (rows) base["rows"] = parseInt(rows.trim().replace(/^Rows:/i, ""), 10) || 0;
  }

  if (cls === "callout_request") {
    const method = extractCalloutMethod(payload);
    const urlM = /Endpoint=([^,\]\s]+)/.exec(payload);
    if (method) base["method"] = method;
    if (urlM?.[1]) base["endpoint"] = urlM[1];
  }

  if (cls === "callout_response") {
    const statusM = /StatusCode=(\d+)/.exec(payload);
    if (statusM?.[1]) base["statusCode"] = parseInt(statusM[1], 10);
  }

  if (cls === "exception" || cls === "fatal_error") {
    const colon = payload.indexOf(":");
    if (colon !== -1) {
      base["exceptionType"] = payload.slice(0, colon).trim();
      base["message"] = payload.slice(colon + 1).trim();
    } else {
      base["exceptionType"] = payload.trim();
    }
  }

  return base;
}

export function buildExecutionTree(events: LogEvent[]): ExecutionNode {
  resetIdCounter();

  const syntheticRoot: ExecutionNode = {
    id: nextId(),
    type: "transaction",
    name: "Transaction",
    startLine: 1,
    endLine: undefined,
    startTime: undefined,
    endTime: undefined,
    duration: undefined,
    metadata: {},
    children: [],
  };

  const stack: StackFrame[] = [{ node: syntheticRoot, eventClass: "transaction_start" }];

  for (const event of events) {
    const cls = classifyEvent(event.event);

    if (START_CLASSES.has(cls)) {
      const node: ExecutionNode = {
        id: nextId(),
        type: eventClassToNodeType(cls),
        name: extractName(event, cls),
        startLine: event.lineNumber,
        endLine: undefined,
        startTime: event.timestamp !== undefined ? nanoToMs(event.timestamp) : undefined,
        endTime: undefined,
        duration: undefined,
        metadata: buildMetadata(event, cls),
        children: [],
      };
      const top = stack[stack.length - 1];
      if (top) top.node.children.push(node);
      stack.push({ node, eventClass: cls });
      continue;
    }

    if (END_CLASSES.has(cls)) {
      const expectedStart = MATCHING_START[cls];

      // Pop to find the matching open frame; tolerant of mismatched/truncated logs
      for (let i = stack.length - 1; i >= 1; i--) {
        const frame = stack[i];
        if (!frame) continue;
        if (frame.eventClass === expectedStart || frame.node.type === eventClassToNodeType(cls)) {
          stack.splice(i, 1);
          frame.node.endLine = event.lineNumber;
          if (frame.node.startTime !== undefined && event.timestamp !== undefined) {
            frame.node.endTime = nanoToMs(event.timestamp);
            frame.node.duration = frame.node.endTime - frame.node.startTime;
          }
          break;
        }
      }
      continue;
    }

    // Point events (exceptions, fatal errors) — leaf nodes attached to current parent
    if (cls === "exception" || cls === "fatal_error") {
      const node: ExecutionNode = {
        id: nextId(),
        type: "exception",
        name: extractName(event, cls),
        startLine: event.lineNumber,
        endLine: event.lineNumber,
        startTime: event.timestamp !== undefined ? nanoToMs(event.timestamp) : undefined,
        endTime: event.timestamp !== undefined ? nanoToMs(event.timestamp) : undefined,
        duration: 0,
        metadata: buildMetadata(event, cls),
        children: [],
      };
      const top = stack[stack.length - 1];
      if (top) top.node.children.push(node);
    }
  }

  // Unwrap: if syntheticRoot has a single transaction child, promote it as the root
  if (syntheticRoot.children.length === 1 && syntheticRoot.children[0]?.type === "transaction") {
    return syntheticRoot.children[0];
  }

  // Set duration on syntheticRoot from its children when no EXECUTION_STARTED was present
  const firstChild = syntheticRoot.children[0];
  const lastChild = syntheticRoot.children[syntheticRoot.children.length - 1];
  if (firstChild?.startTime !== undefined) syntheticRoot.startTime = firstChild.startTime;
  if (lastChild?.endTime !== undefined) syntheticRoot.endTime = lastChild.endTime;
  if (syntheticRoot.startTime !== undefined && syntheticRoot.endTime !== undefined) {
    syntheticRoot.duration = syntheticRoot.endTime - syntheticRoot.startTime;
  }

  return syntheticRoot;
}
