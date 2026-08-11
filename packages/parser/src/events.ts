// Canonical Salesforce Debug Log event names and their semantic classification.
// When adding a new event, add it here first — the parser derives its behavior
// from this registry rather than scattering knowledge across the codebase.

export type EventClass =
  | "transaction_start"
  | "transaction_end"
  | "code_unit_start"
  | "code_unit_end"
  | "method_entry"
  | "method_exit"
  | "soql_begin"
  | "soql_end"
  | "dml_begin"
  | "dml_end"
  | "callout_request"
  | "callout_response"
  | "exception"
  | "fatal_error"
  | "limit_usage"
  | "user_debug"
  | "flow_start"
  | "flow_end"
  | "flow_element_begin"
  | "flow_element_end"
  | "heap_allocate"
  | "variable_scope_begin"
  | "variable_scope_end"
  | "statement_execute"
  | "cumulative_limit_usage"
  | "cumulative_limit_usage_end"
  | "unknown";

export interface EventDefinition {
  name: string;
  class: EventClass;
}

const EVENT_REGISTRY: EventDefinition[] = [
  { name: "EXECUTION_STARTED", class: "transaction_start" },
  { name: "EXECUTION_FINISHED", class: "transaction_end" },

  { name: "CODE_UNIT_STARTED", class: "code_unit_start" },
  { name: "CODE_UNIT_FINISHED", class: "code_unit_end" },

  { name: "METHOD_ENTRY", class: "method_entry" },
  { name: "METHOD_EXIT", class: "method_exit" },

  { name: "SOQL_EXECUTE_BEGIN", class: "soql_begin" },
  { name: "SOQL_EXECUTE_END", class: "soql_end" },

  { name: "DML_BEGIN", class: "dml_begin" },
  { name: "DML_END", class: "dml_end" },

  { name: "CALLOUT_REQUEST", class: "callout_request" },
  { name: "CALLOUT_RESPONSE", class: "callout_response" },

  { name: "EXCEPTION_THROWN", class: "exception" },
  { name: "FATAL_ERROR", class: "fatal_error" },

  { name: "LIMIT_USAGE", class: "limit_usage" },
  { name: "LIMIT_USAGE_FOR_NS", class: "limit_usage" },
  { name: "CUMULATIVE_LIMIT_USAGE", class: "cumulative_limit_usage" },
  { name: "CUMULATIVE_LIMIT_USAGE_END", class: "cumulative_limit_usage_end" },

  { name: "USER_DEBUG", class: "user_debug" },

  { name: "FLOW_START_INTERVIEWS_BEGIN", class: "flow_start" },
  { name: "FLOW_START_INTERVIEWS_END", class: "flow_end" },
  { name: "FLOW_START_INTERVIEW_BEGIN", class: "flow_start" },
  { name: "FLOW_START_INTERVIEW_END", class: "flow_end" },
  { name: "FLOW_ELEMENT_BEGIN", class: "flow_element_begin" },
  { name: "FLOW_ELEMENT_END", class: "flow_element_end" },
  { name: "FLOW_ELEMENT_DEFERRED", class: "unknown" },
  { name: "FLOW_ELEMENT_ERROR", class: "exception" },
  { name: "FLOW_INTERVIEW_FINISHED", class: "flow_end" },
  { name: "FLOW_INTERVIEW_FINISHED_LIMIT_USAGE", class: "limit_usage" },
  { name: "FLOW_SUBFLOW_DETAIL", class: "unknown" },
  { name: "FLOW_VALUE_ASSIGNMENT", class: "unknown" },
  { name: "FLOW_ACTIONCALL_DETAIL", class: "unknown" },
  { name: "FLOW_LOOP_DETAIL", class: "unknown" },
  { name: "FLOW_BULK_ELEMENT_BEGIN", class: "flow_element_begin" },
  { name: "FLOW_BULK_ELEMENT_END", class: "flow_element_end" },
  { name: "FLOW_BULK_ELEMENT_DETAIL", class: "unknown" },
  { name: "FLOW_BULK_ELEMENT_NOT_SUPPORTED_BY_BULK_FAULT_IN_BATCH", class: "unknown" },

  { name: "HEAP_ALLOCATE", class: "heap_allocate" },
  { name: "VARIABLE_SCOPE_BEGIN", class: "variable_scope_begin" },
  { name: "VARIABLE_SCOPE_END", class: "variable_scope_end" },
  { name: "VARIABLE_ASSIGNMENT", class: "unknown" },
  { name: "STATEMENT_EXECUTE", class: "statement_execute" },
  { name: "SYSTEM_MODE_ENTER", class: "unknown" },
  { name: "SYSTEM_MODE_EXIT", class: "unknown" },
  { name: "SLA_END", class: "unknown" },
  { name: "SLA_EVAL_MILESTONE", class: "unknown" },
  { name: "SLA_NULL_START_DATE", class: "unknown" },
  { name: "QUERY_MORE_BEGIN", class: "unknown" },
  { name: "QUERY_MORE_END", class: "unknown" },
  { name: "QUERY_MORE_ITERATIONS", class: "unknown" },
  { name: "ENTERING_MANAGED_PKG", class: "unknown" },
  { name: "WF_RULE_EVAL_BEGIN", class: "unknown" },
  { name: "WF_RULE_EVAL_END", class: "unknown" },
  { name: "WF_RULE_FILTER", class: "unknown" },
  { name: "WF_RULE_NOT_EVALUATED", class: "unknown" },
  { name: "WF_SPOOL_ACTION_BEGIN", class: "unknown" },
  { name: "WF_TIME_TRIGGERS_BEGIN", class: "unknown" },
  { name: "WF_ACTION", class: "unknown" },
  { name: "WF_ACTION_TASK", class: "unknown" },
  { name: "WF_FIELD_UPDATE", class: "unknown" },
  { name: "WF_EMAIL_ALERT", class: "unknown" },
  { name: "POP_TRACE_FLAGS", class: "unknown" },
  { name: "PUSH_TRACE_FLAGS", class: "unknown" },
  { name: "SAVEPOINT_SET", class: "unknown" },
  { name: "SAVEPOINT_ROLLBACK", class: "unknown" },
  { name: "VALIDATION_FORMULA", class: "unknown" },
  { name: "VALIDATION_PASS", class: "unknown" },
  { name: "VALIDATION_FAIL", class: "unknown" },
  { name: "VALIDATION_ERROR", class: "exception" },
  { name: "DUPLICATE_DETECTION_BEGIN", class: "unknown" },
  { name: "DUPLICATE_DETECTION_END", class: "unknown" },
  { name: "DUPLICATE_DETECTION_RULE_INVOCATION", class: "unknown" },
];

const REGISTRY_MAP = new Map<string, EventDefinition>(
  EVENT_REGISTRY.map((e) => [e.name, e])
);

export function classifyEvent(eventName: string): EventClass {
  return REGISTRY_MAP.get(eventName)?.class ?? "unknown";
}

export function isKnownEvent(eventName: string): boolean {
  return REGISTRY_MAP.has(eventName);
}
