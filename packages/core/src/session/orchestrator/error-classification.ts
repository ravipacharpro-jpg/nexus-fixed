export * as ErrorClassification from "./error-classification"

/**
 * Error classification for repair decisions. Every failure is mapped to
 * exactly one kind with a retry policy and a next action, so repair loops
 * back off on transient faults, switch providers on rate limits, ask the
 * user for credentials or approvals, and fail fast — with an honest
 * blocker — on anything deterministic.
 *
 * Runtime-free (no `effect` import, like `rules.ts`): usable from Effect
 * core, the nexus CLI, and plain-TS liaison code alike. First matching
 * pattern wins; order below runs from most specific to most general.
 */
export type ErrorKind =
  | "auth"
  | "rate-limit"
  | "permission"
  | "destructive"
  | "test-failure"
  | "type-error"
  | "transient"
  | "missing-input"
  | "unsupported"
  | "unknown"

export type Classification = {
  readonly kind: ErrorKind
  /** Safe to retry automatically (possibly after backoff or failover). */
  readonly retryable: boolean
  /** Only the user can unblock this: credentials, approval, or input. */
  readonly needsUser: boolean
  /** Next action in one line. */
  readonly advice: string
}

type Pattern = {
  readonly kind: Exclude<ErrorKind, "unknown">
  readonly retryable: boolean
  readonly needsUser: boolean
  readonly advice: string
  readonly pattern: RegExp
}

const PATTERNS: ReadonlyArray<Pattern> = [
  {
    kind: "auth",
    retryable: false,
    needsUser: true,
    advice: "Provide a valid credential; automatic retries will not help.",
    pattern:
      /invalid[_ -]?api[_ -]?key|api[_ -]?key.*(?:invalid|not valid)|unauthorized|forbidden|(?:^|[\s(:])(?:401|403)\b|invalid.*credential|missing.*credential|authentication (?:required|failed)/i,
  },
  {
    kind: "rate-limit",
    retryable: true,
    needsUser: false,
    advice: "Back off and retry, or switch provider/model.",
    pattern: /rate.?limit|too many requests|quota exceeded|(?:^|[\s(:])429\b/i,
  },
  {
    kind: "permission",
    retryable: false,
    needsUser: true,
    advice: "Request permission from the user and retry only after approval.",
    pattern: /permission denied|EACCES|operation not permitted|approval (?:denied|rejected)|not permitted/i,
  },
  {
    kind: "destructive",
    retryable: false,
    needsUser: true,
    advice: "State the exact destructive action and wait for explicit confirmation.",
    pattern: /refusing.*delete|confirmation required|destructive|will destroy|irreversible/i,
  },
  {
    kind: "test-failure",
    retryable: true,
    needsUser: false,
    advice: "Diagnose the failing assertion, patch the source, rerun the focused test.",
    pattern: /tests? failed|failing tests?|assertion (?:failed|error)|expected .* received|test .* did not pass/i,
  },
  {
    kind: "type-error",
    retryable: true,
    needsUser: false,
    advice: "Read the full error, fix the source, rerun typecheck.",
    pattern: /TS\d{3,5}|type error|typecheck failed|SyntaxError|Cannot find (?:module|name)|is not assignable/i,
  },
  {
    kind: "transient",
    retryable: true,
    needsUser: false,
    advice: "Back off and retry; escalate only if it repeats identically.",
    pattern:
      /timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network.*unreachable|socket hang up|fetch failed|econnrefused|5\d\d\b|temporarily unavailable/i,
  },
  {
    kind: "missing-input",
    retryable: false,
    needsUser: true,
    advice: "Ask the user one targeted question for the missing input.",
    pattern: /missing.*(?:input|argument|parameter|variable|environment)|required.*missing|not provided|is not defined|no such file/i,
  },
  {
    kind: "unsupported",
    retryable: false,
    needsUser: false,
    advice: "Report an honest blocker; do not retry what cannot work.",
    pattern: /not supported|unsupported|not implemented|cannot be automated/i,
  },
]

const UNKNOWN: Classification = {
  kind: "unknown",
  retryable: false,
  needsUser: false,
  advice: "No known pattern matched; inspect the full error before deciding.",
}

export function classifyError(message: string): Classification {
  const hit = PATTERNS.find((entry) => entry.pattern.test(message))
  return hit
    ? { kind: hit.kind, retryable: hit.retryable, needsUser: hit.needsUser, advice: hit.advice }
    : UNKNOWN
}
