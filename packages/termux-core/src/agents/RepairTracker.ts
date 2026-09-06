import { classifyError } from "@nexus-ai/core/session/orchestrator/error-classification"

/**
 * Plain-TS error-repair tracker for non-Effect agents.
 * Mirrors `@nexus-ai/core` SessionRepair semantics: every failure records
 * `{ step, error, filesChanged, attemptNumber }`, retries stop at the
 * attempt budget (default 3) or as soon as a failure repeats identically,
 * and exhaustion produces an exact blocker instead of another retry.
 */
export const DEFAULT_MAX_ATTEMPTS = 3

export type AttemptRecord = {
  attempt: number
  step: string
  error: string
  filesChanged?: string[]
  at: number
}

export type RecordResult = {
  attempt: number
  maxAttempts: number
  canRetry: boolean
  stagnant: boolean
  history: AttemptRecord[]
}

export function fingerprint(error: string, filesChanged?: string[]): string {
  const firstLine = error.split("\n").find((line) => line.trim().length > 0) ?? error
  const files = [...(filesChanged ?? [])].sort().join(",")
  return `${firstLine.trim().slice(0, 240)}|${files}`
}

function isStagnant(history: AttemptRecord[]): boolean {
  if (history.length < 2) return false
  const last = history[history.length - 1]
  const previous = history[history.length - 2]
  if (!last || !previous) return false
  return fingerprint(previous.error, previous.filesChanged) === fingerprint(last.error, last.filesChanged)
}

export function blockerReport(key: string, history: AttemptRecord[], maxAttempts: number): string {
  const last = history[history.length - 1]
  if (!last) return `No attempts recorded for "${key}".`
  const stagnant = isStagnant(history)
  const files = last.filesChanged && last.filesChanged.length > 0 ? last.filesChanged.join(", ") : "none"
  const tried = history.map((item) => `#${item.attempt} ${item.step}: ${item.error.split("\n")[0]?.trim()}`).join("; ")
  const next = stagnant
    ? "Failure repeats identically — automatic repair stopped instead of retrying the same command unchanged. Manual fix needed."
    : `Attempt budget (${maxAttempts}) exhausted. Manual fix needed.`
  const classified = classifyError(last.error)
  return `Blocked after ${history.length} attempt(s) on "${key}". Last error: ${last.error.split("\n")[0]?.trim()}. Failed step: ${last.step}. Files changed: ${files}. Tried: ${tried}. ${next} Likely cause: ${classified.kind} — ${classified.advice}`
}

export class RepairTracker {
  private readonly attempts = new Map<string, AttemptRecord[]>()
  constructor(readonly maxAttempts = DEFAULT_MAX_ATTEMPTS) {}

  record(key: string, entry: { step: string; error: string; filesChanged?: string[] }): RecordResult {
    const history = this.attempts.get(key) ?? []
    const attempt: AttemptRecord = {
      attempt: history.length + 1,
      step: entry.step,
      error: entry.error,
      filesChanged: entry.filesChanged,
      at: Date.now(),
    }
    const next = [...history, attempt]
    this.attempts.set(key, next)
    const stagnant = isStagnant(next)
    return {
      attempt: attempt.attempt,
      maxAttempts: this.maxAttempts,
      canRetry: next.length < this.maxAttempts && !stagnant,
      stagnant,
      history: [...next],
    }
  }

  history(key: string): AttemptRecord[] {
    return [...(this.attempts.get(key) ?? [])]
  }

  summary(key: string): string {
    const history = this.history(key)
    if (history.length === 0) return `No attempts recorded for "${key}".`
    const last = history[history.length - 1]
    if (history.length < this.maxAttempts && !isStagnant(history)) {
      return `Repair attempt ${history.length}/${this.maxAttempts} recorded (${last?.step}): ${last?.error.split("\n")[0]?.trim()}. Re-run to continue repair.`
    }
    return blockerReport(key, history, this.maxAttempts)
  }

  reset(key: string) {
    this.attempts.delete(key)
  }
}

export default RepairTracker
