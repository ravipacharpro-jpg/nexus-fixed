import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { Planner } from "@nexus-ai/core/session/orchestrator/planner"
import { ExecutionRules } from "@nexus-ai/core/session/orchestrator/rules"
import { executePlan, phaseOutcomeFromShell } from "@nexus-ai/core/session/orchestrator/executor"
import { runOrchestrated } from "@nexus-ai/core/session/orchestrator/verifier"
import type { PhaseOutcome } from "@nexus-ai/core/session/orchestrator/executor"

class Boom {
  readonly _tag = "Boom"
  constructor(readonly message: string) {}
}

const describeBoom = (error: Boom) => ({ message: error.message })
const ok = (evidence: string): PhaseOutcome => ({ evidence })

describe("Planner.createPlan", () => {
  test("orders inspect first, caller steps as acts, verify last", () => {
    const plan = Planner.createPlan({ goal: "Fix login", steps: ["Patch auth", "Update docs"], files: ["src/auth.ts"] })
    expect(plan.phases.map((phase) => phase.kind)).toEqual(["inspect", "act", "act", "verify"])
    expect(plan.phases[1]?.title).toBe("Patch auth")
    expect(plan.phases[2]?.title).toBe("Update docs")
  })

  test("falls back to inspect + verify when no steps are given", () => {
    const plan = Planner.createPlan({ goal: "Look around" })
    expect(plan.phases.map((phase) => phase.kind)).toEqual(["inspect", "verify"])
  })

  test("skips blank steps and attaches files only to act and verify phases", () => {
    const plan = Planner.createPlan({ goal: "Tidy", steps: ["  ", "Rename"], files: ["a.ts"] })
    expect(plan.phases.map((phase) => phase.kind)).toEqual(["inspect", "act", "verify"])
    expect(plan.phases[0]?.files).toBeUndefined()
    expect(plan.phases[1]?.files).toEqual(["a.ts"])
    expect(plan.phases[2]?.files).toEqual(["a.ts"])
  })

  test("summarizePlan reports goal and phase chain", () => {
    const plan = Planner.createPlan({ goal: "Ship", steps: ["Build"] })
    expect(Planner.summarizePlan(plan)).toBe("Ship [inspect → act → verify]")
  })

  test("attaches governing canonical rules to every phase", () => {
    const plan = Planner.createPlan({ goal: "Ship", steps: ["Build"] })
    for (const phase of plan.phases) expect(phase.rules.length).toBeGreaterThan(0)
    expect(plan.phases[0]?.rules).toContain("inspect-before-edit")
    expect(plan.phases[plan.phases.length - 1]?.rules).toContain("verify-before-success")
    expect(plan.phases[1]?.rules).toContain("no-identical-retry")
  })
})

describe("ExecutionRules", () => {
  test("defines eight stable rules with unique IDs", () => {
    expect(ExecutionRules.RULES.length).toBe(8)
    expect(new Set(ExecutionRules.RULES.map((rule) => rule.id)).size).toBe(8)
  })

  test("covers every phase kind with at least one rule", () => {
    for (const kind of ["inspect", "act", "verify"] as const) {
      expect(ExecutionRules.rulesForPhase(kind).length).toBeGreaterThan(0)
    }
  })

  test("formatRulesSection embeds every rule exactly once", () => {
    const section = ExecutionRules.formatRulesSection()
    expect(section.startsWith("<execution_rules>")).toBe(true)
    expect(section.endsWith("</execution_rules>")).toBe(true)
    for (const rule of ExecutionRules.RULES) {
      expect(section).toContain(rule.text)
    }
  })
})

describe("Executor.executePlan", () => {
  test("completes every phase when the runner succeeds", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One", "Two"] })
    const report = await Effect.runPromise(
      executePlan({ key: "exec-ok", plan, runner: (phase) => Effect.succeed(ok(`did ${phase.title}`)), describe: describeBoom }),
    )
    expect(report.completed.length).toBe(4)
    expect(report.halted).toBeUndefined()
    for (const item of report.completed) {
      expect(item.repaired).toBe(false)
      expect(item.attempts).toBe(1)
    }
  })

  test("halts at the first unrecoverable phase without running later phases", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One", "Two"] })
    const ran: string[] = []
    const report = await Effect.runPromise(
      executePlan({
        key: "exec-halt",
        plan,
        runner: (phase) =>
          Effect.gen(function* () {
            ran.push(phase.id)
            if (phase.kind === "act") return yield* Effect.fail(new Boom("act exploded"))
            return ok("fine")
          }),
        describe: describeBoom,
      }),
    )
    expect(report.completed.length).toBe(1)
    expect(report.halted?.phase.kind).toBe("act")
    expect(report.halted?.blocker).toContain("act exploded")
    expect(ran.some((id) => id.includes("verify"))).toBe(false)
  })
})

describe("Executor.phaseOutcomeFromShell", () => {
  test("maps exit-zero output to evidence with no error", () => {
    const outcome = phaseOutcomeFromShell({ exit: 0, output: "ok" })
    expect(outcome).toEqual({ exitCode: 0, evidence: "ok", error: undefined })
  })

  test("maps non-zero exits to unresolved errors for the gate", () => {
    const outcome = phaseOutcomeFromShell({ exit: 2, output: "missing file" })
    expect(outcome.exitCode).toBe(2)
    expect(outcome.error).toContain("code 2")
  })

  test("maps timeouts to the conventional timeout exit code", () => {
    const outcome = phaseOutcomeFromShell({ timeout: true, output: "partial" })
    expect(outcome.exitCode).toBe(124)
    expect(outcome.error).toContain("timeout")
  })

  test("flags shell results with no exit code as unverifiable", () => {
    const outcome = phaseOutcomeFromShell({ output: "???" })
    expect(outcome.exitCode).toBeUndefined()
    expect(outcome.error).toContain("no exit code")
  })
})

describe("Verifier.runOrchestrated", () => {
  const runWithFs = <A, E>(effect: Effect.Effect<A, E, import("effect").FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)))

  test("succeeds only when every phase verifies", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One"] })
    const result = await runWithFs(
      runOrchestrated({ key: "orch-ok", plan, runner: (phase) => Effect.succeed(ok(`evidence for ${phase.id}`)), describe: describeBoom }),
    )
    expect(result.success).toBe(true)
    expect(result.blocker).toBeUndefined()
    expect(result.phases.length).toBe(3)
    for (const item of result.phases) expect(item.verified).toBe(true)
  })

  test("halts instead of building on a phase with missing expected files", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One", "Two"], files: ["/definitely/not/here-nexus-verify.txt"] })
    const ran: string[] = []
    const result = await runWithFs(
      runOrchestrated({
        key: "orch-halt",
        plan,
        runner: (phase) =>
          Effect.succeed(ok(`ran ${phase.id}`)).pipe(Effect.tap(() => Effect.sync(() => ran.push(phase.id)))),
        describe: describeBoom,
      }),
    )
    expect(result.success).toBe(false)
    expect(result.phases.length).toBe(2)
    expect(result.phases[0]?.verified).toBe(true)
    expect(result.phases[1]?.verified).toBe(false)
    expect(result.blocker).toContain("unverified")
    expect(result.blocker).toContain("Halting plan")
    expect(ran.length).toBe(2)
  })

  test("recovers a flaky phase through the repair budget and still verifies", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One"] })
    let calls = 0
    const result = await runWithFs(
      runOrchestrated({
        key: "orch-flaky",
        plan,
        runner: () =>
          Effect.gen(function* () {
            calls += 1
            if (calls === 1) return yield* Effect.fail(new Boom("transient"))
            return ok("recovered evidence")
          }),
        describe: describeBoom,
      }),
    )
    expect(result.success).toBe(true)
    expect(result.phases.filter((item) => item.report.repaired).length).toBe(1)
  })

  test("halts on gated web evidence instead of claiming the page was read", async () => {
    const plan = Planner.createPlan({ goal: "Read the docs", steps: ["Fetch page"] })
    const result = await runWithFs(
      runOrchestrated({
        key: "orch-gated",
        plan,
        runner: (phase) =>
          phase.kind === "act"
            ? Effect.succeed({
              evidence: {
                url: "https://example.com/docs",
                title: "Secret Docs",
                gate: "login",
                output: "Please log in to continue.",
              },
            })
            : Effect.succeed(ok(`evidence for ${phase.id}`)),
        describe: describeBoom,
      }),
    )
    expect(result.success).toBe(false)
    expect(result.phases.length).toBe(2)
    expect(result.blocker).toContain("content gate (login)")
    expect(result.blocker).toContain("Halting plan")
  })

  test("passes web evidence carrying title and readable output", async () => {
    const plan = Planner.createPlan({ goal: "Read the docs", steps: ["Fetch page"] })
    const result = await runWithFs(
      runOrchestrated({
        key: "orch-web-ok",
        plan,
        runner: (phase) =>
          phase.kind === "act"
            ? Effect.succeed({
              evidence: {
                url: "https://example.com/docs",
                title: "Public Docs",
                output: "The quick brown fox.",
              },
            })
            : Effect.succeed(ok(`evidence for ${phase.id}`)),
        describe: describeBoom,
      }),
    )
    expect(result.success).toBe(true)
  })

  test("reports the repair blocker when a phase cannot be executed", async () => {
    const plan = Planner.createPlan({ goal: "Do", steps: ["One"] })
    const result = await runWithFs(
      runOrchestrated({
        key: "orch-fail",
        plan,
        runner: (phase) => (phase.kind === "inspect" ? Effect.succeed(ok("seen")) : Effect.fail(new Boom("stuck"))),
        describe: describeBoom,
      }),
    )
    expect(result.success).toBe(false)
    expect(result.blocker).toContain("stuck")
    expect(result.phases.length).toBe(2)
    expect(result.phases[result.phases.length - 1]?.verified).toBe(false)
  })
})
