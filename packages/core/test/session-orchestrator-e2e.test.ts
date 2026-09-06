import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { Planner } from "@nexus-ai/core/session/orchestrator/planner"
import { phaseOutcomeFromShell } from "@nexus-ai/core/session/orchestrator/executor"
import { runOrchestrated } from "@nexus-ai/core/session/orchestrator/verifier"

const roots: string[] = []
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
})

const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-orchestrator-e2e-"))
  roots.push(dir)
  return dir
}

const shell = (cwd: string, command: string) => {
  const ran = Bun.spawnSync(["sh", "-c", command], { cwd })
  return { exit: ran.exitCode ?? 1, output: ran.stdout.toString().trim() || "(no output)" }
}

const describeBoom = (error: Error) => ({ message: error.message })

describe("Orchestrator end to end", () => {
  test("real shell command flows plan-execute-verify to verified success", async () => {
    const dir = await scratch()
    const proof = join(dir, "proof.txt")
    const plan = Planner.createPlan({ goal: "E2E proof", files: [proof], steps: ["Create proof file"] })
    const result = await Effect.runPromise(
      runOrchestrated({
        key: "e2e-shell",
        plan,
        runner: (phase) =>
          Effect.succeed(
            phase.kind === "act"
              ? phaseOutcomeFromShell(shell(dir, "echo verified-content > proof.txt && cat proof.txt"))
              : { evidence: `phase ${phase.kind} done` },
          ),
        describe: describeBoom,
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(result.success).toBe(true)
    expect(result.phases.every((item) => item.verified)).toBe(true)
    expect((await readFile(proof, "utf8")).trim()).toBe("verified-content")
  })

  test("gated web evidence halts the plan instead of claiming the read", async () => {
    const plan = Planner.createPlan({ goal: "Read the docs", steps: ["Fetch page"] })
    const result = await Effect.runPromise(
      runOrchestrated({
        key: "e2e-gated",
        plan,
        runner: (phase) =>
          Effect.succeed(
            phase.kind === "act"
              ? {
                evidence: {
                  url: "https://example.com/docs",
                  title: "Secret Docs",
                  gate: "login",
                  output: "Please log in to continue.",
                },
              }
              : { evidence: `phase ${phase.kind} done` },
          ),
        describe: describeBoom,
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(result.success).toBe(false)
    expect(result.blocker).toContain("content gate (login)")
  })

  test("identical shell failures stop instead of retrying unchanged", async () => {
    const plan = Planner.createPlan({ goal: "E2E repair", steps: ["Bad step"] })
    let calls = 0
    const result = await Effect.runPromise(
      runOrchestrated({
        key: "e2e-repair",
        plan,
        runner: (phase) => {
          calls += 1
          if (phase.kind !== "act") return Effect.succeed({ evidence: "ok" })
          return Effect.fail(new Error("boom: connection refused"))
        },
        describe: describeBoom,
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(result.success).toBe(false)
    expect(result.blocker).toContain("identically")
    // inspect once + act twice (initial, one changed-attempt check, then stagnant stop).
    expect(calls).toBe(3)
  })
})
