export * as SuccessContractModule from "./contract"

import { Schema } from "effect"
import type { Plan } from "./planner"

/**
 * Internal success contract: what "done" means for one orchestrated task,
 * decided before execution starts so the agent checks results instead of
 * claiming completion from effort alone.
 *
 * Lives beside the runtime-free planner (which cannot import Effect):
 * callers declare free-text requirements they cannot mechanically verify
 * (`requiredChanges`, `validationCommands`) alongside enforceable facts.
 * The verifier enforces files, tests, errors, and evidence; declared
 * requirements travel with the result for reporting.
 */
export class SuccessContract extends Schema.Class<SuccessContract>("Orchestrator.SuccessContract")({
  goal: Schema.String,
  expectedFiles: Schema.optional(Schema.Array(Schema.String)),
  requiredChanges: Schema.optional(Schema.Array(Schema.String)),
  validationCommands: Schema.optional(Schema.Array(Schema.String)),
  evidenceRequired: Schema.optional(Schema.Boolean),
  destructiveAction: Schema.optional(Schema.Boolean),
}) {}

/** Derive the enforceable half of a contract from a plan. Callers add declared requirements. */
export const deriveContract = (
  plan: Plan,
  extra?: Partial<Pick<typeof SuccessContract.Type, "requiredChanges" | "validationCommands" | "destructiveAction">>,
): typeof SuccessContract.Type => {
  const files = [...new Set(plan.phases.flatMap((phase) => phase.files ?? []))]
  return new SuccessContract({
    goal: plan.goal,
    expectedFiles: files.length > 0 ? files : undefined,
    evidenceRequired: true,
    ...extra,
  })
}
