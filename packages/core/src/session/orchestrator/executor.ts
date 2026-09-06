export * as Executor from "./executor"

import { Effect } from "effect"
import { SessionRepair } from "../repair"
import type { Phase, Plan } from "./planner"

/**
 * Phase outcome produced by a step runner. Runners close over their own
 * dependencies (services, permissions, filesystem handles) at construction
 * time, so execution here stays dependency-free.
 */
export type PhaseOutcome = {
  readonly exitCode?: number
  readonly evidence?: unknown
  readonly filesChanged?: ReadonlyArray<string>
  readonly error?: string
}

export type StepContext = {
  readonly attempt: number
  readonly previous: ReadonlyArray<SessionRepair.FailureRecord>
}

export type StepRunner<E> = (phase: Phase, context: StepContext) => Effect.Effect<PhaseOutcome, E>

export type DescribeFailure<E> = (error: E) => {
  readonly message: string
  readonly filesChanged?: ReadonlyArray<string>
}

export type PhaseReport = {
  readonly phase: Phase
  readonly repaired: boolean
  readonly attempts: number
  readonly outcome: PhaseOutcome | undefined
  readonly blocker: string | undefined
}

/** Shell-tool output shape shared by core bash leaves. */
export type ShellLikeOutput = {
  readonly exit?: number
  readonly output?: unknown
  readonly timeout?: boolean
}

/**
 * Standardized shell → phase-outcome mapping so every orchestrated shell
 * call feeds the verification gate uniformly: exit code preserved, output
 * as evidence, non-zero or timed-out runs as unresolved errors.
 */
export function phaseOutcomeFromShell(output: ShellLikeOutput): PhaseOutcome {
  if (output.timeout) {
    return {
      exitCode: 124,
      evidence: output.output ?? "Command exceeded timeout.",
      error: "Command exceeded timeout before completion.",
    }
  }
  if (output.exit === undefined) {
    return { evidence: output.output, error: "Shell result carried no exit code." }
  }
  return {
    exitCode: output.exit,
    evidence: output.output,
    error: output.exit === 0 ? undefined : `Command exited with code ${output.exit}.`,
  }
}

export type ExecutionReport = {
  readonly completed: ReadonlyArray<PhaseReport>
  readonly halted: PhaseReport | undefined
}

/** Run one phase with the standard repair budget. Typed errors never escape; defects and interruptions propagate. */
export const executePhase = Effect.fn("OrchestratorExecutor.executePhase")(function* <E>(input: {
  readonly key: string
  readonly phase: Phase
  readonly runner: StepRunner<E>
  readonly describe: DescribeFailure<E>
}) {
  const repair = yield* SessionRepair.withRepair({
    key: `${input.key}:${input.phase.id}`,
    step: input.phase.title,
    run: (context) => input.runner(input.phase, context),
    describe: (error) => {
      const described = input.describe(error)
      return { message: described.message, filesChanged: described.filesChanged }
    },
  })
  return {
    phase: input.phase,
    repaired: repair.repaired,
    attempts: repair.history.attempts.length + (repair.result !== undefined ? 1 : 0),
    outcome: repair.result,
    blocker: repair.blocker,
  } satisfies PhaseReport
})

/**
 * Run every phase in order, stopping at the first phase the repair loop
 * could not recover. Later phases never run on a halted foundation.
 */
export const executePlan = Effect.fn("OrchestratorExecutor.executePlan")(function* <E>(input: {
  readonly key: string
  readonly plan: Plan
  readonly runner: StepRunner<E>
  readonly describe: DescribeFailure<E>
}) {
  const completed: PhaseReport[] = []
  for (const phase of input.plan.phases) {
    const report = yield* executePhase({ key: input.key, phase, runner: input.runner, describe: input.describe })
    if (report.outcome === undefined) return { completed, halted: report } satisfies ExecutionReport
    completed.push(report)
  }
  return { completed, halted: undefined } satisfies ExecutionReport
})
