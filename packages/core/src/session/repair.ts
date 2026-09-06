export * as SessionRepair from "./repair"

import { Effect } from "effect"

/**
 * Error-repair loop for fallible tasks.
 *
 * Every failure records `{ failedCommand, exitCode, stderr, currentStep,
 * filesChanged, attemptNumber, nextRepair }`. A repair is attempted only
 * while attempt budget remains AND the failure signature changed since the
 * previous attempt — the same failed command is never repeated unchanged.
 * After the budget is exhausted (or the failure repeats identically) the
 * caller gets an exact blocker report instead of another retry.
 */
export const DEFAULT_MAX_ATTEMPTS = 3

export type FailureRecord = {
  readonly attempt: number
  readonly fingerprint: string
  readonly message: string
  readonly step?: string
  readonly filesChanged?: ReadonlyArray<string>
}

export type RepairHistory = {
  readonly key: string
  readonly maxAttempts: number
  readonly attempts: ReadonlyArray<FailureRecord>
}

export type RepairOutcome<A> = {
  /** True when the task succeeded after at least one recorded failure. */
  readonly repaired: boolean
  readonly result: A | undefined
  readonly history: RepairHistory
  /** Exact blocker when no result could be produced. Always set on failure. */
  readonly blocker: string | undefined
}

export type RepairTask<A, E> = {
  readonly key: string
  readonly maxAttempts?: number
  readonly step?: string
  readonly run: (context: {
    readonly attempt: number
    readonly previous: ReadonlyArray<FailureRecord>
  }) => Effect.Effect<A, E>
  readonly describe: (error: E) => {
    readonly message: string
    readonly filesChanged?: ReadonlyArray<string>
  }
}

/** Stable signature of a failure used to detect stagnant (identical) retries. */
export function fingerprint(message: string, filesChanged?: ReadonlyArray<string>): string {
  const firstLine = message.split("\n").find((line) => line.trim().length > 0) ?? message
  const files = [...(filesChanged ?? [])].sort().join(",")
  return `${firstLine.trim().slice(0, 240)}|${files}`
}

/** Exact blocker report from a repair history. */
export function blockerReport(history: RepairHistory): string {
  const count = history.attempts.length
  const last = history.attempts[count - 1]
  if (!last) return `No attempts recorded for "${history.key}".`
  const stagnant = count > 1 && history.attempts[count - 2]?.fingerprint === last.fingerprint
  const files = last.filesChanged && last.filesChanged.length > 0 ? last.filesChanged.join(", ") : "none"
  const tried = history.attempts.map((item) => `#${item.attempt} ${item.step ?? "attempt"}: ${item.message.split("\n")[0]?.trim()}`).join("; ")
  const next = stagnant
    ? "Failure repeats identically — automatic repair stopped instead of retrying the same command unchanged. Manual fix needed."
    : `Attempt budget (${history.maxAttempts}) exhausted. Manual fix needed.`
  return `Blocked after ${count} attempt(s) on "${history.key}". Last error: ${last.message.split("\n")[0]?.trim()}. Failed step: ${last.step ?? "unknown"}. Files changed: ${files}. Tried: ${tried}. ${next}`
}

const historyFor = (key: string, maxAttempts: number, attempts: ReadonlyArray<FailureRecord>): RepairHistory => ({
  key,
  maxAttempts,
  attempts,
})

/**
 * Run a fallible task with a bounded repair budget. The task receives its
 * attempt number plus all previous failures so each attempt can differ from
 * the last; when it does not (identical fingerprint) the loop stops early.
 * Typed errors are recorded, never thrown; defects and interruptions
 * propagate untouched.
 */
export const withRepair = <A, E>(task: RepairTask<A, E>): Effect.Effect<RepairOutcome<A>> =>
  Effect.gen(function* () {
    const maxAttempts = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    const failures: FailureRecord[] = []
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const settled = yield* task
        .run({ attempt, previous: failures })
        .pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
        )
      if (settled.ok) {
        return {
          repaired: attempt > 1,
          result: settled.value,
          history: historyFor(task.key, maxAttempts, [...failures]),
          blocker: undefined,
        }
      }
      const described = task.describe(settled.error)
      const record: FailureRecord = {
        attempt,
        fingerprint: fingerprint(described.message, described.filesChanged),
        message: described.message,
        step: task.step,
        filesChanged: described.filesChanged,
      }
      const previous = failures[failures.length - 1]
      const stagnant = previous !== undefined && previous.fingerprint === record.fingerprint
      failures.push(record)
      if (attempt >= maxAttempts || stagnant) {
        const history = historyFor(task.key, maxAttempts, [...failures])
        return { repaired: false, result: undefined, history, blocker: blockerReport(history) }
      }
    }
    const history = historyFor(task.key, maxAttempts, [...failures])
    return { repaired: false, result: undefined, history, blocker: blockerReport(history) }
  })
