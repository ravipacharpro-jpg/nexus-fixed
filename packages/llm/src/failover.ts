import { Effect, Schema } from "effect"
import { LLMError } from "./schema"

/**
 * Typed model-failover vocabulary.
 *
 * Failover advances to another candidate ONLY for typed retryable provider
 * failures (`LLMError.retryable`: rate limits, quota, provider-internal
 * errors). Authentication, content-policy, and invalid-request failures are
 * deterministic for the caller and fail fast instead of burning the chain.
 * Unknown (non-LLM) failures never fail over: retrying blindly hides
 * defects and credential problems.
 *
 * Session-coupled chains with their own trigger semantics (message-based
 * rotation, key budgets) live with their owners; this module is the shared
 * predicate plus the tried-chain report format.
 */
export class FailoverCandidate extends Schema.Class<FailoverCandidate>("LLM.FailoverCandidate")({
  providerID: Schema.String,
  modelID: Schema.String,
}) {}

export class FailoverAttempt extends Schema.Class<FailoverAttempt>("LLM.FailoverAttempt")({
  candidate: FailoverCandidate,
  error: Schema.optional(Schema.String),
}) {}

/** True only for typed retryable LLM failures. Everything else fails fast. */
export function shouldFailover(error: unknown): boolean {
  return error instanceof LLMError && error.retryable
}

/** Exact blocker naming the tried chain and the terminal error. */
export const failoverExhaustedReport = Effect.fn("Failover.exhaustedReport")(function* (
  candidates: ReadonlyArray<typeof FailoverCandidate.Type>,
  attempts: ReadonlyArray<typeof FailoverAttempt.Type>,
) {
  const chain = candidates.map((candidate) => `${candidate.providerID}/${candidate.modelID}`).join(" → ")
  const last = attempts[attempts.length - 1]
  const tried = attempts
    .map((item) => `${item.candidate.providerID}/${item.candidate.modelID}${item.error ? `: ${item.error.split("\n")[0]?.trim()}` : ""}`)
    .join("; ")
  const terminal = last?.error?.split("\n")[0]?.trim() ?? "unknown error"
  return `No fallback model served the request. Chain: ${chain}. Tried: ${tried || "none"}. Terminal error: ${terminal}.`
})

export * as Failover from "./failover"
