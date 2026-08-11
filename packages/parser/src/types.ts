// ─── Raw log event ──────────────────────────────────────────────────────────

export interface LogEvent {
  lineNumber: number;
  timestamp: number | undefined;
  category: string;
  event: string;
  payload: string;
  raw: string;
}

// ─── Execution model ─────────────────────────────────────────────────────────

export type ExecutionNodeType =
  | "transaction"
  | "code_unit"
  | "method"
  | "flow"
  | "soql"
  | "dml"
  | "callout"
  | "exception"
  | "other";

export interface ExecutionNode {
  id: string;
  type: ExecutionNodeType;
  name: string;
  startLine: number;
  endLine: number | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  duration: number | undefined;
  metadata: Record<string, unknown>;
  children: ExecutionNode[];
}

// ─── Governor limits ─────────────────────────────────────────────────────────

export interface GovernorMetrics {
  cpuTime: LimitMetric | undefined;
  soqlQueries: LimitMetric | undefined;
  soqlRows: LimitMetric | undefined;
  dmlStatements: LimitMetric | undefined;
  dmlRows: LimitMetric | undefined;
  callouts: LimitMetric | undefined;
  heapSize: LimitMetric | undefined;
  queryLocatorRows: LimitMetric | undefined;
}

export interface LimitMetric {
  used: number;
  limit: number;
}

// ─── Parse result ─────────────────────────────────────────────────────────────

export interface ParseResult {
  events: LogEvent[];
  tree: ExecutionNode;
  metrics: GovernorMetrics;
  errors: ParseError[];
  warnings: string[];
  stats: ParseStats;
}

export interface ParseError {
  lineNumber: number;
  message: string;
  raw: string;
}

export interface ParseStats {
  totalLines: number;
  parsedEvents: number;
  unknownEvents: number;
  duration: number;
}
