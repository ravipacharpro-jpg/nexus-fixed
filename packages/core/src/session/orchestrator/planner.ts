import { rulesForPhase } from "./rules"

/**
 * Deterministic task planner: turns a goal into explicit inspect → act →
 * verify phases. The planner never executes anything; it only normalizes
 * caller intent into an ordered plan that the executor runs and the
 * verifier gates.
 *
 * This module intentionally has no `effect` runtime import. Non-Effect
 * runtimes (termux-core) cannot resolve the `effect` package from their
 * isolated workspace store, so the planner stays plain TypeScript like
 * `core/power.ts` and is importable from anywhere. Its only runtime
 * import is `./rules`, which itself has zero runtime imports.
 *
 * Strict rules embedded in every plan:
 * - An inspect phase always comes first: never edit before inspecting.
 * - A verify phase always comes last: never claim success without evidence.
 * - Every phase carries its governing canonical rules (`rules.ts`).
 */
export type PhaseKind = "inspect" | "act" | "verify"

export type Phase = {
  readonly id: string
  readonly kind: PhaseKind
  readonly title: string
  readonly detail?: string
  /** Canonical strict rules governing this phase. See `rules.ts`. */
  readonly rules: ReadonlyArray<import("./rules").RuleID>
  readonly files?: ReadonlyArray<string>
  readonly commands?: ReadonlyArray<string>
}

export type Plan = {
  readonly goal: string
  readonly phases: ReadonlyArray<Phase>
}

export type PlanInput = {
  readonly goal: string
  readonly steps?: ReadonlyArray<string>
  readonly files?: ReadonlyArray<string>
}

const INSPECT_DETAIL =
  "Read the relevant files and repository structure before changing anything. Preserve user data and configuration before destructive changes."
const ACT_DETAIL =
  "Perform exactly this step. On failure, repair the first root cause; do not repeat the same failed command unchanged."
const VERIFY_DETAIL =
  "Confirm exit codes, expected files, and test output. Report completed, skipped, and unverified work separately."

const slug = (value: string, fallback: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || fallback

/** Build an ordered plan: inspect first, caller steps as act phases, verify last. */
export function createPlan(input: PlanInput): Plan {
  const goal = input.goal.trim() || "unspecified task"
  const files = input.files && input.files.length > 0 ? [...input.files] : undefined
  const steps = (input.steps ?? []).map((step) => step.trim()).filter((step) => step.length > 0)
  const base = slug(goal, "task")
  // Inspect runs before any action, so expected outputs cannot exist yet:
  // only act and verify phases carry `files` for the verification gate.
  const phases: Phase[] = [
    {
      id: `${base}-inspect`,
      kind: "inspect",
      title: "Inspect relevant files and repository structure",
      detail: INSPECT_DETAIL,
      rules: rulesForPhase("inspect"),
    },
  ]
  steps.forEach((step, index) => {
    phases.push({
      id: `${base}-act-${index + 1}`,
      kind: "act",
      title: step,
      detail: ACT_DETAIL,
      rules: rulesForPhase("act"),
      files,
    })
  })
  phases.push({
    id: `${base}-verify`,
    kind: "verify",
    title: "Verify outputs, tests, and evidence",
    detail: VERIFY_DETAIL,
    rules: rulesForPhase("verify"),
    files,
  })
  return { goal, phases }
}

/** One-line human-readable plan shape for responses and logs. */
export function summarizePlan(plan: Plan): string {
  const chain = plan.phases.map((phase) => phase.kind).join(" → ")
  return `${plan.goal} [${chain}]`
}

export * as Planner from "./planner"
