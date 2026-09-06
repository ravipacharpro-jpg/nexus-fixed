export * as ExecutionRules from "./rules"

import type { PhaseKind } from "./planner"

/**
 * Canonical strict execution rules. Single source of truth: the planner
 * attaches these to phases, prompts embed them via `formatRulesSection`,
 * and the verifier/repair loop enforces them structurally —
 *
 * - planner.createPlan is breakIntoPhases (inspect-first, verify-last),
 * - the inspect phase is inspectFiles,
 * - the verification gate is checkTests plus verify-before-success,
 * - SessionRepair is repair-root-cause plus no-identical-retry,
 * - ToolSafety advisories plus permission approval are preserve-before-destroy.
 *
 * Runtime-free (type-only planner import, like `core/power.ts`) so any
 * runtime — Effect core, nexus CLI, plain-TS liaison — can share them.
 */
export type RuleID =
  | "verify-before-success"
  | "inspect-before-edit"
  | "phase-tasks"
  | "test-after-change"
  | "repair-root-cause"
  | "no-identical-retry"
  | "preserve-before-destroy"
  | "report-separately"

export type Rule = {
  readonly id: RuleID
  readonly text: string
}

export const RULES: ReadonlyArray<Rule> = [
  { id: "verify-before-success", text: "Never claim success without verification: exit code, expected files, tests, and evidence must all check out." },
  { id: "inspect-before-edit", text: "Before editing, inspect the relevant files and repository structure." },
  { id: "phase-tasks", text: "Break multi-step tasks into explicit inspect, act, and verify phases." },
  { id: "test-after-change", text: "After every code change, run focused tests or syntax checks." },
  { id: "repair-root-cause", text: "When a command fails, read the full error and repair the first root cause." },
  { id: "no-identical-retry", text: "Do not repeat the same failed command unchanged." },
  { id: "preserve-before-destroy", text: "Preserve user data and configuration before destructive changes." },
  { id: "report-separately", text: "Report completed, skipped, and unverified work separately — never mix them." },
]

const BY_ID: ReadonlyMap<RuleID, Rule> = new Map(RULES.map((rule) => [rule.id, rule]))

export function rule(id: RuleID): Rule {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown execution rule: ${id}`)
  return found
}

/** Rules governing each phase kind. Every kind gets at least one rule. */
export function rulesForPhase(kind: PhaseKind): ReadonlyArray<RuleID> {
  switch (kind) {
    case "inspect":
      return ["inspect-before-edit", "preserve-before-destroy"]
    case "act":
      return ["repair-root-cause", "no-identical-retry", "preserve-before-destroy", "test-after-change"]
    case "verify":
      return ["verify-before-success", "report-separately", "test-after-change"]
  }
}

/** Compact prompt section embedding every rule. Injected once per session. */
export function formatRulesSection(): string {
  return ["<execution_rules>", ...RULES.map((item) => `- ${item.text}`), "</execution_rules>"].join("\n")
}
