import type { LogEvent, ParseError } from "./types.js";

// Salesforce Debug Log line format:
//   HH:MM:SS.mmm (nanoseconds)|EVENT_NAME|payload...
//   or without timestamp:
//   EVENT_NAME|payload...
//
// LIMIT_USAGE_FOR_NS blocks span multiple lines; continuation lines are
// indented with spaces and are appended to the previous event's payload.

const TIMESTAMP_PATTERN = /^\d{1,2}:\d{2}:\d{2}\.\d+\s*\(\d+\)\|/;
const TIMESTAMP_CAPTURE = /^(\d{1,2}:\d{2}:\d{2}\.\d+)\s*\((\d+)\)\|(.*)$/;
const NO_TIMESTAMP_EVENT = /^[A-Z][A-Z0-9_]+(\||$)/;

export interface LexResult {
  events: LogEvent[];
  errors: ParseError[];
  totalLines: number;
}

export function lex(rawLog: string): LexResult {
  const events: LogEvent[] = [];
  const errors: ParseError[] = [];
  const lines = splitLines(rawLog);
  let i = 0;

  while (i < lines.length) {
    const lineNumber = i + 1;
    const line = lines[i] ?? "";

    if (!line || isHeaderLine(line)) {
      i++;
      continue;
    }

    const event = parseLine(line, lineNumber);
    if (event) {
      // Accumulate indented continuation lines (multi-line LIMIT_USAGE blocks)
      const continuations: string[] = [];
      let j = i + 1;
      while (j < lines.length && isContinuationLine(lines[j] ?? "")) {
        continuations.push((lines[j] ?? "").trim());
        j++;
      }
      if (continuations.length > 0) {
        event.payload = [event.payload, ...continuations].filter(Boolean).join("\n");
      }
      events.push(event);
      i = j;
    } else if (looksLikeEventLine(line)) {
      errors.push({ lineNumber, message: "Failed to parse event line", raw: line });
      i++;
    } else {
      i++;
    }
  }

  return { events, errors, totalLines: lines.length };
}

function splitLines(raw: string): string[] {
  return raw.split(/\r?\n|\r/);
}

function isHeaderLine(line: string): boolean {
  if (line.startsWith("Version:")) return true;
  if (line.startsWith("Profiling")) return true;
  if (line.startsWith("Log ")) return true;
  if (line.startsWith("Number")) return true;
  if (line.trim() === "") return true;
  return false;
}

function isContinuationLine(line: string): boolean {
  return line.length > 0 && (line.startsWith("  ") || line.startsWith("\t"));
}

function looksLikeEventLine(line: string): boolean {
  return TIMESTAMP_PATTERN.test(line) || NO_TIMESTAMP_EVENT.test(line);
}

function parseLine(line: string, lineNumber: number): LogEvent | undefined {
  let timestamp: number | undefined;
  let rest: string;

  if (TIMESTAMP_PATTERN.test(line)) {
    const m = TIMESTAMP_CAPTURE.exec(line);
    if (!m || !m[2] || m[3] === undefined) return undefined;
    timestamp = parseInt(m[2], 10);
    rest = m[3];
  } else if (NO_TIMESTAMP_EVENT.test(line)) {
    rest = line;
  } else {
    return undefined;
  }

  // rest = "EVENT_NAME|payload..." or just "EVENT_NAME"
  const pipeIndex = rest.indexOf("|");
  if (pipeIndex === -1) {
    const event = rest.trim();
    if (!event) return undefined;
    return { lineNumber, timestamp, category: event, event, payload: "", raw: line };
  }

  const event = rest.slice(0, pipeIndex);
  const payload = rest.slice(pipeIndex + 1);

  if (!event) return undefined;

  return { lineNumber, timestamp, category: event, event, payload, raw: line };
}

// Convert nanosecond timestamp (Salesforce wall-clock) to milliseconds
export function nanoToMs(nano: number): number {
  return nano / 1_000_000;
}
