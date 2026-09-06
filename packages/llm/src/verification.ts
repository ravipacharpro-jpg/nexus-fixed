import { Effect, Schema } from "effect"

/**
 * Minimum success contract shared by every agent task.
 *
 * A task is successful only when:
 * 1. The requested action completed with exit code 0 or valid tool evidence.
 * 2. Expected files/output/state were verified.
 * 3. Relevant tests or checks passed.
 * 4. No unresolved error remains.
 * 5. The final response reports evidence, not assumptions.
 *
 * This module is deliberately session-independent. Filesystem checks happen
 * in the caller (core/session/verification); this module only evaluates the
 * supplied facts so CLI, SDK, TUI and session runners share one gate.
 */
export class VerificationRequirement extends Schema.Class<VerificationRequirement>(
  "LLM.VerificationRequirement",
)({
  exitCode: Schema.optional(Schema.Int),
  expectedFiles: Schema.optional(Schema.Array(Schema.String)),
  tests: Schema.optional(Schema.Array(Schema.String)),
  requireEvidence: Schema.optional(Schema.Boolean),
}) {}

/**
 * Note: `expectedFiles` is informational only. Enforcement uses
 * `missingFiles`, which the caller computes via the filesystem
 * (see core/session/verification). Passing `expectedFiles` without
 * `missingFiles` performs no file check.
 */
export class VerificationInput extends Schema.Class<VerificationInput>("LLM.VerificationInput")({
  exitCode: Schema.optional(Schema.Int),
  expectedFiles: Schema.optional(Schema.Array(Schema.String)),
  missingFiles: Schema.optional(Schema.Array(Schema.String)),
  testsAttempted: Schema.optional(Schema.Boolean),
  testsPassed: Schema.optional(Schema.Boolean),
  testOutput: Schema.optional(Schema.String),
  unresolvedErrors: Schema.optional(Schema.Array(Schema.String)),
  evidence: Schema.optional(Schema.Unknown),
}) {}

export class VerificationResult extends Schema.Class<VerificationResult>("LLM.VerificationResult")({
  success: Schema.Boolean,
  reason: Schema.optional(Schema.String),
  missingFiles: Schema.optional(Schema.Array(Schema.String)),
  unverified: Schema.Boolean,
  evidence: Schema.optional(Schema.Unknown),
}) {}

export class VerificationGateError extends Schema.TaggedErrorClass<VerificationGateError>()(
  "LLM.VerificationGateError",
  {
    reason: Schema.String,
    missingFiles: Schema.optional(Schema.Array(Schema.String)),
    details: Schema.optional(Schema.Unknown),
  },
) {}

const isEmptyEvidence = (evidence: unknown): boolean => {
  if (evidence === undefined || evidence === null) return true
  if (typeof evidence === "string") return evidence.trim().length === 0
  return false
}

const fail = (
  reason: string,
  extra?: Partial<typeof VerificationResult.Type>,
): Effect.Effect<typeof VerificationResult.Type> =>
  Effect.succeed(
    new VerificationResult({
      success: false,
      reason,
      unverified: true,
      ...extra,
    }),
  )

/**
 * Evaluate the minimum success contract against caller-supplied facts.
 * The caller is responsible for filesystem/test probing; this function never
 * touches the filesystem so it stays usable from any runtime.
 */
export const verifyCompletion = Effect.fn("Verification.verifyCompletion")(function* (
  input: typeof VerificationInput.Type,
) {
  if (input.exitCode !== undefined && input.exitCode !== 0) {
    return yield* fail(`non-zero exit code: ${input.exitCode}`)
  }

  const missing = input.missingFiles ?? []
  if (missing.length > 0) {
    return yield* fail(`expected file missing: ${missing[0]}`, { missingFiles: [...missing] })
  }

  const testsAttempted = input.testsAttempted ?? false
  const testsPassed = input.testsPassed ?? true
  if (testsAttempted && !testsPassed) {
    return yield* fail("tests failed", { evidence: input.testOutput })
  }

  const errors = input.unresolvedErrors ?? []
  if (errors.length > 0) {
    return yield* fail(`unresolved errors (${errors.length}): ${errors[0]}`, {
      evidence: { errors },
    })
  }

  if (isEmptyEvidence(input.evidence)) {
    return yield* fail("no evidence provided")
  }

  return new VerificationResult({
    success: true,
    unverified: false,
    evidence: input.evidence,
  })
})

/** Human-facing fallback when the gate fails but work was attempted. */
export const unverifiedReport = (result: typeof VerificationResult.Type): string => {
  if (result.success) return "Verified."
  const reason = result.reason ?? "unverified"
  return `change made, but not verified: ${reason}`
}

/** Throw a typed error when callers need Effect failure instead of a result value. */
export const requireVerified = Effect.fn("Verification.requireVerified")(function* (
  input: typeof VerificationInput.Type,
) {
  const result = yield* verifyCompletion(input)
  if (result.success) return result
  return yield* new VerificationGateError({
    reason: result.reason ?? "unverified",
    missingFiles: result.missingFiles,
    details: result.evidence,
  })
})

export * as Verification from "./verification"
