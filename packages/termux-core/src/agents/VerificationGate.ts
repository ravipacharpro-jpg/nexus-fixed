import type { ProjectResult } from "./TeamHierarchy"
import type { SeniorDevResult } from "./SeniorDevAgent"

/**
 * Plain-TS adapter of the minimum success contract for non-Effect agents.
 * Mirrors `@nexus-ai/llm` Verification gate (exit code, files, tests,
 * errors, evidence) without requiring an Effect runtime.
 *
 * A task is successful only when:
 * 1. The requested action completed with exit code 0 or valid evidence.
 * 2. Expected files/output/state were verified.
 * 3. Relevant tests or checks passed.
 * 4. No unresolved error remains.
 * 5. The final response reports evidence, not assumptions.
 */
export type GateInput = {
  exitCode?: number
  missingFiles?: string[]
  testsAttempted?: boolean
  testsPassed?: boolean
  unresolvedErrors?: string[]
  evidence?: unknown
}

export type GateResult = {
  success: boolean
  reason?: string
  missingFiles?: string[]
  unverified: boolean
  evidence?: unknown
}

const isEmptyEvidence = (evidence: unknown): boolean => {
  if (evidence === undefined || evidence === null) return true
  if (typeof evidence === "string") return evidence.trim().length === 0
  return false
}

export function verifyCompletion(input: GateInput): GateResult {
  if (input.exitCode !== undefined && input.exitCode !== 0) {
    return { success: false, reason: `non-zero exit code: ${input.exitCode}`, unverified: true }
  }
  const missing = input.missingFiles ?? []
  if (missing.length > 0) {
    return { success: false, reason: `expected file missing: ${missing[0]}`, missingFiles: [...missing], unverified: true }
  }
  if (input.testsAttempted && !input.testsPassed) {
    return { success: false, reason: "tests failed", unverified: true, evidence: input.evidence }
  }
  const errors = input.unresolvedErrors ?? []
  if (errors.length > 0) {
    return { success: false, reason: `unresolved errors (${errors.length}): ${errors[0]}`, unverified: true }
  }
  if (isEmptyEvidence(input.evidence)) {
    return { success: false, reason: "no evidence provided", unverified: true }
  }
  return { success: true, unverified: false, evidence: input.evidence }
}

export function unverifiedReport(result: GateResult): string {
  if (result.success) return "Verified."
  return `change made, but not verified: ${result.reason ?? "unverified"}`
}

/** Map a SeniorDev fix/analyze result onto the gate. */
export function verifySeniorDevResult(result: SeniorDevResult): GateResult {
  const failed = result.fixes?.failed ?? []
  const unresolvedErrors = failed.map((item) => item.error || `fix failed for ${item.bug.file}`)
  const testsAttempted = result.tests !== undefined
  const testsPassed = result.tests?.passed ?? true
  const evidence = [
    result.summary,
    result.fixes ? `fixed=${result.fixes.fixed.length} failed=${failed.length} skipped=${result.fixes.skipped.length}` : undefined,
    result.tests ? `tests=${result.tests.passed ? "passed" : "failed"}${result.tests.command ? ` (${result.tests.command})` : ""}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ")
  return verifyCompletion({ unresolvedErrors, testsAttempted, testsPassed, evidence })
}

/** Map a team ProjectResult onto the gate. Downgrades hollow "completed". */
export function verifyProjectResult(result: ProjectResult): GateResult {
  if (result.status !== "completed") {
    return { success: false, reason: `project status is ${result.status}`, unverified: true, evidence: result.summary }
  }
  if (result.leads.length === 0) {
    return {
      success: false,
      reason: "delegated to solo mode, team execution not verified",
      unverified: true,
      evidence: result.summary,
    }
  }
  const failedLeads = result.leads.filter((lead) => lead.status !== "done").map((lead) => lead.module)
  if (failedLeads.length > 0) {
    return {
      success: false,
      reason: `module(s) not done: ${failedLeads[0]}`,
      unverified: true,
      evidence: result.summary,
    }
  }
  return verifyCompletion({ evidence: result.summary })
}
