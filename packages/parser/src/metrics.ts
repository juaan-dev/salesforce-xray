import type { LogEvent, GovernorMetrics, LimitMetric } from "./types.js";
import { classifyEvent } from "./events.js";

// Salesforce governor limits (per-transaction defaults, as of Spring '24)
const DEFAULT_LIMITS = {
  cpuTimeMs: 10_000,
  soqlQueries: 100,
  soqlRows: 50_000,
  dmlStatements: 150,
  dmlRows: 10_000,
  callouts: 100,
  heapSizeBytes: 6_000_000, // 6 MB (async); 12 MB for future-proofing kept at 6
  queryLocatorRows: 10_000,
} as const;

const LIMIT_USAGE_PATTERN =
  /Number of SOQL queries:\s*(\d+)\s*out of\s*(\d+)/i;
const CPU_TIME_PATTERN =
  /Maximum CPU time:\s*(\d+)\s*out of\s*(\d+)/i;
const SOQL_ROWS_PATTERN =
  /Number of query rows:\s*(\d+)\s*out of\s*(\d+)/i;
const DML_PATTERN =
  /Number of DML statements:\s*(\d+)\s*out of\s*(\d+)/i;
const DML_ROWS_PATTERN =
  /Number of DML rows:\s*(\d+)\s*out of\s*(\d+)/i;
const CALLOUTS_PATTERN =
  /Number of callouts:\s*(\d+)\s*out of\s*(\d+)/i;
const HEAP_PATTERN =
  /Maximum heap size:\s*(\d+)\s*out of\s*(\d+)/i;

function parseLimit(text: string, pattern: RegExp): LimitMetric | undefined {
  const m = pattern.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) return undefined;
  return { used: parseInt(m[1], 10), limit: parseInt(m[2], 10) };
}

function mergeMetric(
  existing: LimitMetric | undefined,
  incoming: LimitMetric | undefined
): LimitMetric | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  // Keep the highest usage we've seen (cumulative limit blocks report totals)
  return incoming.used > existing.used ? incoming : existing;
}

export function extractMetrics(events: LogEvent[]): GovernorMetrics {
  let cpuTime: LimitMetric | undefined;
  let soqlQueries: LimitMetric | undefined;
  let soqlRows: LimitMetric | undefined;
  let dmlStatements: LimitMetric | undefined;
  let dmlRows: LimitMetric | undefined;
  let callouts: LimitMetric | undefined;
  let heapSize: LimitMetric | undefined;

  // Count actual events as fallback when LIMIT_USAGE lines are absent
  let soqlCount = 0;
  let dmlCount = 0;
  let calloutCount = 0;

  for (const event of events) {
    const cls = classifyEvent(event.event);

    if (cls === "soql_begin") soqlCount++;
    if (cls === "dml_begin") dmlCount++;
    if (cls === "callout_request") calloutCount++;

    if (cls === "limit_usage" || cls === "cumulative_limit_usage") {
      const text = event.payload;
      cpuTime = mergeMetric(cpuTime, parseLimit(text, CPU_TIME_PATTERN));
      soqlQueries = mergeMetric(soqlQueries, parseLimit(text, LIMIT_USAGE_PATTERN));
      soqlRows = mergeMetric(soqlRows, parseLimit(text, SOQL_ROWS_PATTERN));
      dmlStatements = mergeMetric(dmlStatements, parseLimit(text, DML_PATTERN));
      dmlRows = mergeMetric(dmlRows, parseLimit(text, DML_ROWS_PATTERN));
      callouts = mergeMetric(callouts, parseLimit(text, CALLOUTS_PATTERN));
      heapSize = mergeMetric(heapSize, parseLimit(text, HEAP_PATTERN));
    }
  }

  // If no LIMIT_USAGE lines were found, synthesize from event counts with defaults
  if (!soqlQueries && soqlCount > 0) {
    soqlQueries = { used: soqlCount, limit: DEFAULT_LIMITS.soqlQueries };
  }
  if (!dmlStatements && dmlCount > 0) {
    dmlStatements = { used: dmlCount, limit: DEFAULT_LIMITS.dmlStatements };
  }
  if (!callouts && calloutCount > 0) {
    callouts = { used: calloutCount, limit: DEFAULT_LIMITS.callouts };
  }

  return {
    cpuTime,
    soqlQueries,
    soqlRows,
    dmlStatements,
    dmlRows,
    callouts,
    heapSize,
    queryLocatorRows: undefined,
  };
}

export { DEFAULT_LIMITS };
