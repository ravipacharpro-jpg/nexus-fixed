export * as ToolResultContract from "./tool-result"

import { Schema } from "effect"
import type { PhaseOutcome, ShellLikeOutput } from "./executor"

/**
 * Common tool-result contract. Every tool outcome flowing into the
 * verifier is normalized to this shape first, so the gate never guesses
 * from tool-specific output formats whether a command succeeded.
 */
export class ToolResult extends Schema.Class<ToolResult>("Orchestrator.ToolResult")({
  success: Schema.Boolean,
  exitCode: Schema.optional(Schema.Int),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  filesChanged: Schema.optional(Schema.Array(Schema.String)),
  filesCreated: Schema.optional(Schema.Array(Schema.String)),
  filesMissing: Schema.optional(Schema.Array(Schema.String)),
  testsAttempted: Schema.optional(Schema.Boolean),
  testsPassed: Schema.optional(Schema.Boolean),
  retryable: Schema.optional(Schema.Boolean),
  evidence: Schema.optional(Schema.Unknown),
}) {}

/** Normalize a shell-tool output into the contract. */
export const fromShell = (output: ShellLikeOutput): typeof ToolResult.Type => {
  if (output.timeout) {
    return new ToolResult({
      success: false,
      exitCode: 124,
      output: typeof output.output === "string" ? output.output : undefined,
      error: "Command exceeded timeout before completion.",
      retryable: true,
      evidence: output.output ?? "Command exceeded timeout.",
    })
  }
  if (output.exit === undefined) {
    return new ToolResult({
      success: false,
      output: typeof output.output === "string" ? output.output : undefined,
      error: "Shell result carried no exit code.",
      evidence: output.output,
    })
  }
  return new ToolResult({
    success: output.exit === 0,
    exitCode: output.exit,
    output: typeof output.output === "string" ? output.output : undefined,
    error: output.exit === 0 ? undefined : `Command exited with code ${output.exit}.`,
    evidence: output.output,
  })
}

/** Project a contract result onto a phase outcome for the verifier. */
export const toPhaseOutcome = (result: typeof ToolResult.Type): PhaseOutcome => ({
  exitCode: result.exitCode,
  evidence: result.evidence,
  ...(result.error ? { error: result.error } : {}),
})

/** Unresolved-error lines for the verification gate. */
export const toUnresolvedErrors = (result: typeof ToolResult.Type): string[] =>
  !result.success && result.error ? [result.error] : []

/** Fail the gate input when tests ran but did not pass. */
export const toTestCheck = (
  result: typeof ToolResult.Type,
): { readonly attempted: boolean; readonly passed: boolean; readonly output?: string } => ({
  attempted: result.testsAttempted ?? false,
  passed: result.testsPassed ?? true,
  output: result.output,
})
