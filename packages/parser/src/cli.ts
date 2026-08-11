#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseLog } from "./parser.js";
import type { ExecutionNode } from "./types.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: pnpm parse <path-to-log-file>");
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(filePath, "utf-8");
} catch {
  console.error(`Cannot read file: ${filePath}`);
  process.exit(1);
}

const result = parseLog(raw);

// ─── Transaction summary ───────────────────────────────────────────────────

const root = result.tree;
const durationStr = root.duration !== undefined
  ? `${root.duration.toFixed(0)}ms`
  : "unknown";

console.log(`\nTransaction: ${root.name}`);
console.log(`Duration:    ${durationStr}`);
console.log(`Lines:       ${result.stats.totalLines}`);
console.log(`Events:      ${result.stats.parsedEvents}`);
if (result.stats.unknownEvents > 0) {
  console.log(`Unknown:     ${result.stats.unknownEvents}`);
}

// ─── Execution tree ─────────────────────────────────────────────────────────

console.log("\nExecution:\n");
printTree(root.children, "");

function printTree(nodes: ExecutionNode[], indent: string): void {
  for (const node of nodes) {
    const dur = node.duration !== undefined ? `${node.duration.toFixed(0)}ms` : "";
    const label = `${indent}${node.name}`;
    console.log(`  ${label.padEnd(60)} ${dur.padStart(8)}`);
    if (node.children.length > 0) {
      printTree(node.children, indent + "  ");
    }
  }
}

// ─── Governor limits ─────────────────────────────────────────────────────────

const m = result.metrics;
console.log("\nGovernor Limits:\n");

if (m.soqlQueries) {
  console.log(`  SOQL queries:  ${m.soqlQueries.used} / ${m.soqlQueries.limit}`);
}
if (m.dmlStatements) {
  console.log(`  DML statements: ${m.dmlStatements.used} / ${m.dmlStatements.limit}`);
}
if (m.callouts) {
  console.log(`  Callouts:      ${m.callouts.used} / ${m.callouts.limit}`);
}
if (m.cpuTime) {
  console.log(`  CPU time:      ${m.cpuTime.used}ms / ${m.cpuTime.limit}ms`);
}
if (m.heapSize) {
  console.log(`  Heap:          ${m.heapSize.used} / ${m.heapSize.limit} bytes`);
}

// ─── Errors and warnings ─────────────────────────────────────────────────────

const errorNodes = collectErrors(result.tree);
console.log(`\nErrors:   ${errorNodes.length}`);
console.log(`Warnings: ${result.warnings.length}\n`);

if (errorNodes.length > 0) {
  console.log("Exceptions:\n");
  for (const e of errorNodes) {
    console.log(`  🔴 ${e.name}`);
    if (e.metadata["message"]) {
      console.log(`     ${e.metadata["message"]}`);
    }
  }
}

if (result.warnings.length > 0) {
  console.log("Warnings:\n");
  for (const w of result.warnings) {
    console.log(`  ⚠  ${w}`);
  }
}

function collectErrors(node: ExecutionNode): ExecutionNode[] {
  const errors: ExecutionNode[] = [];
  if (node.type === "exception") errors.push(node);
  for (const child of node.children) {
    errors.push(...collectErrors(child));
  }
  return errors;
}
