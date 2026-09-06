import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { VerificationInput, requireVerified, unverifiedReport, verifyCompletion } from "../src/verification"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect as Effect.Effect<A, E, never>)

describe("Verification minimum success contract", () => {
  test("passes when evidence is present and nothing failed", async () => {
    const result = await run(verifyCompletion(new VerificationInput({ evidence: "fixed auth.ts" })))
    expect(result.success).toBe(true)
    expect(result.unverified).toBe(false)
  })

  test("fails on non-zero exit code", async () => {
    const result = await run(verifyCompletion(new VerificationInput({ exitCode: 1, evidence: "ran" })))
    expect(result.success).toBe(false)
    expect(result.reason).toContain("non-zero exit code")
  })

  test("fails when an expected file is missing", async () => {
    const result = await run(
      verifyCompletion(new VerificationInput({ missingFiles: ["src/auth.ts"], evidence: "ran" })),
    )
    expect(result.success).toBe(false)
    expect(result.reason).toContain("src/auth.ts")
    expect(result.missingFiles).toEqual(["src/auth.ts"])
  })

  test("fails when attempted tests did not pass", async () => {
    const result = await run(
      verifyCompletion(
        new VerificationInput({ testsAttempted: true, testsPassed: false, evidence: "bun test" }),
      ),
    )
    expect(result.success).toBe(false)
    expect(result.reason).toContain("tests failed")
  })

  test("fails when unresolved errors remain", async () => {
    const result = await run(
      verifyCompletion(new VerificationInput({ unresolvedErrors: ["EACCES: dist/"], evidence: "ran" })),
    )
    expect(result.success).toBe(false)
    expect(result.reason).toContain("unresolved errors")
  })

  test("fails when no evidence is provided", async () => {
    const result = await run(verifyCompletion(new VerificationInput({})))
    expect(result.success).toBe(false)
    expect(result.reason).toContain("no evidence")
  })

  test("requireVerified throws a typed gate error with unverified report", async () => {
    const failure = await run(
      requireVerified(new VerificationInput({})).pipe(Effect.flip),
    )
    expect(failure._tag).toBe("LLM.VerificationGateError")
    const result = await run(verifyCompletion(new VerificationInput({})))
    expect(unverifiedReport(result)).toContain("change made, but not verified")
  })
})
