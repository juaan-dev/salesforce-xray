# Salesforce X-Ray

> **See what Salesforce is actually doing.**

Chrome DevTools for Salesforce transactions.

Salesforce X-Ray is an open-source browser extension that makes Salesforce transaction debugging significantly easier. Select a user, start tracing, reproduce the problem — X-Ray captures the Debug Log and visualizes exactly what happened inside Salesforce.

---

## The Problem

Salesforce Debug Logs are powerful but painful. A single transaction can produce thousands of raw log lines. Finding what actually caused a bug — the slow query, the failed callout, the unhandled exception — requires manually scanning walls of text.

Salesforce X-Ray turns that wall of text into an understandable execution trace.

---

## Core Workflow

```
Open Salesforce
      ↓
Open Salesforce X-Ray
      ↓
Select user → Start tracing
      ↓
User reproduces the problem
      ↓
X-Ray captures the Debug Log
      ↓
Parse → Build execution tree
      ↓
Timeline · Governor Limits · Errors
```

---

## Features (MVP)

- **Live Trace** — select a Salesforce user, start tracing, let X-Ray do the rest
- **Upload Mode** — analyze any `.log` file offline
- **Execution Tree** — visual hierarchy of triggers, classes, flows, SOQL, DML, callouts
- **Timeline** — proportional duration view of every execution unit
- **Governor Limits** — CPU, SOQL, DML, callouts at a glance
- **Diagnostics** — slow operations, high limits, exceptions highlighted automatically
- **100% local** — logs never leave your browser

---

## Architecture

```
salesforce-xray/
├── apps/
│   └── extension/          # Chrome Extension (Manifest V3)
│
├── packages/
│   ├── parser/             # Debug Log parser (core, no dependencies)
│   ├── analyzer/           # Diagnostics engine
│   └── salesforce/         # Salesforce API client
│
├── fixtures/
│   └── logs/               # Realistic sample logs for development
│
└── docs/
```

The parser has zero runtime dependencies and can run in any JavaScript environment — browser, Node.js, or Deno. It is the foundation everything else builds on.

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Run parser tests
pnpm --filter @salesforce-xray/parser test

# Parse a log file from the command line
pnpm parse ./fixtures/logs/simple-apex.log

# Build everything
pnpm build
```

---

## Local Development Handoff

Each contributor maintains a local `HANDOFF.md` file in the project root. This file is intentionally **not committed** and **not listed in `.gitignore`** — it is a personal working note, not a project artifact.

Create your own:

```bash
touch HANDOFF.md
```

Use it to capture current context: what you are working on, what is blocked, what the next step is. The `gen-handoff` Claude Code skill can help generate and update it.

---

## Contributing

Contributions are welcome. Please read the architecture notes above before submitting a PR.

- Keep the parser independent of browser APIs and Salesforce credentials
- All new parser event types must have fixtures and tests
- Unknown log events must not crash the parser — they become `type: "other"`
- No external backend, no AI integration, no cloud storage in the MVP

---

## License

MIT
