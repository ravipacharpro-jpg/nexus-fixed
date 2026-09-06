import { describe, expect, test } from "bun:test"
import { ToolResult, fromShell, toPhaseOutcome, toTestCheck, toUnresolvedErrors } from "@nexus-ai/core/session/orchestrator/tool-result"

describe("ToolResult contract", () => {
  test("fromShell maps exit-zero output to success with evidence", () => {
    const result = fromShell({ exit: 0, output: "ok" })
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.output).toBe("ok")
    expect(result.error).toBeUndefined()
    expect(toUnresolvedErrors(result)).toEqual([])
  })

  test("fromShell maps non-zero exits to failed results with errors", () => {
    const result = fromShell({ exit: 2, output: "missing file" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("code 2")
    expect(toUnresolvedErrors(result)).toEqual(["Command exited with code 2."])
  })

  test("fromShell maps timeouts to retryable failures", () => {
    const result = fromShell({ timeout: true, output: "partial" })
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(124)
    expect(result.retryable).toBe(true)
  })

  test("fromShell flags results with no exit code", () => {
    const result = fromShell({ output: "???" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("no exit code")
  })

  test("toPhaseOutcome preserves the gate-relevant fields", () => {
    const outcome = toPhaseOutcome(
      new ToolResult({ success: true, exitCode: 0, evidence: "did it", output: "did it" }),
    )
    expect(outcome).toEqual({ exitCode: 0, evidence: "did it" })
  })

  test("toTestCheck reports attempted and passed flags", () => {
    expect(toTestCheck(new ToolResult({ success: false, testsAttempted: true, testsPassed: false }))).toMatchObject({
      attempted: true,
      passed: false,
    })
    expect(toTestCheck(new ToolResult({ success: true }))).toMatchObject({ attempted: false, passed: true })
  })
})
