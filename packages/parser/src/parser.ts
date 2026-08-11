import type { ParseResult } from "./types.js";
import { lex } from "./lexer.js";
import { buildExecutionTree } from "./execution-tree.js";
import { extractMetrics } from "./metrics.js";
import { isKnownEvent } from "./events.js";

export function parseLog(rawLog: string): ParseResult {
  const start = Date.now();

  const { events, errors, totalLines } = lex(rawLog);

  const unknownEvents = events.filter((e) => !isKnownEvent(e.event)).length;

  const warnings: string[] = [];
  if (unknownEvents > 0) {
    warnings.push(
      `${unknownEvents} unknown event type(s) encountered — treated as "other".`
    );
  }

  const tree = buildExecutionTree(events);
  const metrics = extractMetrics(events);

  const parseTime = Date.now() - start;

  return {
    events,
    tree,
    metrics,
    errors,
    warnings,
    stats: {
      totalLines,
      parsedEvents: events.length,
      unknownEvents,
      duration: parseTime,
    },
  };
}
