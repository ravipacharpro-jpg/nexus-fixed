export * as SessionVerification from "./verification"

import { Effect, FileSystem, Schema } from "effect"
import {
  Verification,
  VerificationInput,
  VerificationResult,
} from "@nexus-ai/llm"

/** Input for a filesystem-backed verification check. */
export class Request extends Schema.Class<Request>("Session.VerificationRequest")({
  exitCode: Schema.optional(Schema.Int),
  expectedFiles: Schema.optional(Schema.Array(Schema.String)),
  testsAttempted: Schema.optional(Schema.Boolean),
  testsPassed: Schema.optional(Schema.Boolean),
  testOutput: Schema.optional(Schema.String),
  unresolvedErrors: Schema.optional(Schema.Array(Schema.String)),
  evidence: Schema.optional(Schema.Unknown),
}) {}

const missingFiles = Effect.fn("SessionVerification.missingFiles")(function* (
  expected: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem
  const missing: string[] = []
  for (const path of expected) {
    const exists = yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false))
    if (!exists) missing.push(path)
  }
  return missing
})

/**
 * Verify a completed task against the minimum success contract.
 * Checks exit code, expected files on disk, test results, unresolved
 * errors, and evidence presence — in that order.
 */
export const verifyCompletion = Effect.fn("SessionVerification.verifyCompletion")(function* (
  request: typeof Request.Type,
) {
  const expected = request.expectedFiles ?? []
  const missing = expected.length > 0 ? yield* missingFiles(expected) : []

  return yield* Verification.verifyCompletion(
    new VerificationInput({
      exitCode: request.exitCode,
      expectedFiles: request.expectedFiles,
      missingFiles: missing,
      testsAttempted: request.testsAttempted ?? false,
      testsPassed: request.testsPassed ?? true,
      testOutput: request.testOutput,
      unresolvedErrors: request.unresolvedErrors,
      evidence: request.evidence,
    }),
  )
})

/** Throw VerificationGateError on failure; return the result on success. */
export const requireVerified = Effect.fn("SessionVerification.requireVerified")(function* (
  request: typeof Request.Type,
) {
  const result = yield* verifyCompletion(request)
  if (result.success) return result
  return yield* Verification.requireVerified(
    new VerificationInput({
      exitCode: request.exitCode,
      expectedFiles: request.expectedFiles,
      missingFiles: result.missingFiles,
      testsAttempted: request.testsAttempted ?? false,
      testsPassed: request.testsPassed ?? true,
      testOutput: request.testOutput,
      unresolvedErrors: request.unresolvedErrors,
      evidence: request.evidence,
    }),
  )
})

export type Result = typeof VerificationResult.Type
export const unverifiedReport = Verification.unverifiedReport
