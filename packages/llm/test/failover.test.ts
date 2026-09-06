import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  AuthenticationReason,
  ContentPolicyReason,
  InvalidRequestReason,
  LLMError,
  ProviderInternalReason,
  RateLimitReason,
  type LLMErrorReason,
} from "../src/schema"
import { FailoverAttempt, FailoverCandidate, failoverExhaustedReport, shouldFailover } from "../src/failover"

const llmError = (reason: LLMErrorReason) => new LLMError({ module: "test", method: "generate", reason })

describe("Failover.shouldFailover", () => {
  test("fails over on typed retryable provider failures", () => {
    expect(shouldFailover(llmError(new RateLimitReason({ message: "429 rate limited" })))).toBe(true)
    expect(shouldFailover(llmError(new ProviderInternalReason({ message: "500", status: 500 })))).toBe(true)
  })

  test("fails fast on deterministic caller failures", () => {
    expect(shouldFailover(llmError(new AuthenticationReason({ message: "bad key", kind: "invalid" })))).toBe(false)
    expect(shouldFailover(llmError(new ContentPolicyReason({ message: "blocked" })))).toBe(false)
    expect(shouldFailover(llmError(new InvalidRequestReason({ message: "bad schema" })))).toBe(false)
  })

  test("never fails over on unknown or plain errors", () => {
    expect(shouldFailover(new Error("boom"))).toBe(false)
    expect(shouldFailover("rate limit")).toBe(false)
    expect(shouldFailover(undefined)).toBe(false)
  })
})

describe("Failover.failoverExhaustedReport", () => {
  test("names the chain, tried attempts, and terminal error", async () => {
    const report = await Effect.runPromise(
      failoverExhaustedReport(
        [new FailoverCandidate({ providerID: "groq", modelID: "m1" }), new FailoverCandidate({ providerID: "openai", modelID: "m2" })],
        [
          new FailoverAttempt({ candidate: new FailoverCandidate({ providerID: "groq", modelID: "m1" }), error: "429 slow down" }),
          new FailoverAttempt({ candidate: new FailoverCandidate({ providerID: "openai", modelID: "m2" }), error: "500 internal" }),
        ],
      ),
    )
    expect(report).toContain("groq/m1 → openai/m2")
    expect(report).toContain("429 slow down")
    expect(report).toContain("Terminal error: 500 internal")
  })
})
