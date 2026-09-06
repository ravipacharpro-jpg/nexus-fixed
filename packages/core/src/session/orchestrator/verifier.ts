export * as Verifier from "./verifier"

import { Effect, FileSystem } from "effect"
import { SessionVerification } from "../verification"
import { Verification } from "@nexus-ai/llm"
import { executePhase } from "./executor"
import type { DescribeFailure, PhaseReport, StepRunner } from "./executor"
import type { Phase, Plan } from "./planner"

/**
 * Web-evidence inspection: evidence records carrying a fetched `url` must
 * also carry readable content. Gated pages (login/captcha/paywall/empty)
 * are walls, not page evidence, and halt the plan like any unverified step.
 */
const webEvidenceBlock = (evidence: unknown): string | undefined => {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return undefined
  const record = evidence as Record<string, unknown>
  if (typeof record["url"] !== "string") return undefined
  const gate = record["gate"]
  if (gate === "login" || gate === "captcha" || gate === "paywall" || gate === "empty") {
    const title = typeof record["title"] === "string" ? ` "${record["title"]}"` : ""
    return `content gate (${gate}) on ${record["url"]}${title} — gated content is not page evidence`
  }
  if (record["output"] === undefined && record["title"] === undefined) {
    return `empty web evidence for ${record["url"]} — no title or readable content`
  }
  return undefined
}

/**
 * Verify one executed phase against the minimum success contract:
 * exit code 0, expected files present on disk, no unresolved error,
 * and real evidence — never assumptions.
 */
export const verifyPhase = Effect.fn("OrchestratorVerifier.verifyPhase")(function* (
  phase: Phase,
  outcome: { readonly exitCode?: number; readonly evidence?: unknown; readonly error?: string },
) {
  const webBlock = webEvidenceBlock(outcome.evidence)
  return yield* SessionVerification.verifyCompletion(
    new SessionVerification.Request({
      exitCode: outcome.exitCode,
      expectedFiles: phase.files ? [...phase.files] : undefined,
      unresolvedErrors: [...(outcome.error ? [outcome.error] : []), ...(webBlock ? [webBlock] : [])],
      evidence: outcome.evidence,
    }),
  )
})

export type PhaseVerification = {
  readonly phase: Phase
  readonly report: PhaseReport
  readonly verified: boolean
  readonly reason: string | undefined
}

export type OrchestratedResult = {
  readonly success: boolean
  readonly plan: Plan
  readonly phases: ReadonlyArray<PhaseVerification>
  readonly blocker: string | undefined
}

/**
 * Full Planner → Executor → Verifier loop. Each phase runs with the
 * standard repair budget, then its evidence is gated before the next
 * phase starts. The first unverified phase halts the plan: later phases
 * never build on unverified work, and success is claimed only when every
 * phase verified.
 */
export const runOrchestrated = Effect.fn("OrchestratorVerifier.runOrchestrated")(function* <E>(input: {
  readonly key: string
  readonly plan: Plan
  readonly runner: StepRunner<E>
  readonly describe: DescribeFailure<E>
}) {
  const phases: PhaseVerification[] = []
  for (const phase of input.plan.phases) {
    const report = yield* executePhase({ key: input.key, phase, runner: input.runner, describe: input.describe })
    if (report.outcome === undefined) {
      phases.push({ phase, report, verified: false, reason: report.blocker })
      return {
        success: false,
        plan: input.plan,
        phases,
        blocker: report.blocker ?? `Phase "${phase.title}" could not be executed.`,
      } satisfies OrchestratedResult
    }
    const verification = yield* verifyPhase(phase, report.outcome)
    const checked: PhaseVerification = {
      phase,
      report,
      verified: verification.success,
      reason: verification.reason,
    }
    phases.push(checked)
    if (!verification.success) {
      return {
        success: false,
        plan: input.plan,
        phases,
        blocker:
          `Phase "${phase.title}" unverified: ${verification.reason ?? "unverified"}. ` +
          `Halting plan instead of building on unverified work. ${Verification.unverifiedReport(verification)}`,
      } satisfies OrchestratedResult
    }
  }
  return { success: true, plan: input.plan, phases, blocker: undefined } satisfies OrchestratedResult
})
