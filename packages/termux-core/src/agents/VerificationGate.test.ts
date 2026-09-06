import assert from "node:assert/strict"
import test from "node:test"
import {
  unverifiedReport,
  verifyCompletion,
  verifyProjectResult,
  verifySeniorDevResult,
} from "./VerificationGate"

test("passes the gate when evidence exists and nothing failed", () => {
  const result = verifyCompletion({ evidence: "fixed auth.ts" })
  assert.equal(result.success, true)
  assert.equal(result.unverified, false)
})

test("fails the gate on exit code, missing files, tests, errors, and empty evidence", () => {
  assert.match(verifyCompletion({ exitCode: 2, evidence: "ran" }).reason ?? "", /non-zero exit code/)
  assert.match(
    verifyCompletion({ missingFiles: ["src/auth.ts"], evidence: "ran" }).reason ?? "",
    /src\/auth\.ts/,
  )
  assert.match(
    verifyCompletion({ testsAttempted: true, testsPassed: false, evidence: "bun test" }).reason ?? "",
    /tests failed/,
  )
  assert.match(
    verifyCompletion({ unresolvedErrors: ["EACCES"], evidence: "ran" }).reason ?? "",
    /unresolved errors/,
  )
  assert.match(verifyCompletion({}).reason ?? "", /no evidence/)
})

test("downgrades SeniorDev results with failed fixes or failed tests", () => {
  const failed = verifySeniorDevResult({
    root: "/repo",
    files: [],
    bugs: [],
    fixes: { fixed: [], failed: [{ bug: { file: "a.ts" } as never, error: "boom" }], skipped: [] },
    summary: "fixed 0",
  })
  assert.equal(failed.success, false)
  assert.match(unverifiedReport(failed), /change made, but not verified/)

  const badTests = verifySeniorDevResult({
    root: "/repo",
    files: [],
    bugs: [],
    fixes: { fixed: [], failed: [], skipped: [] },
    tests: { passed: false, output: "1 failed", testsDetected: true },
    summary: "tests ran",
  })
  assert.equal(badTests.success, false)
})

test("downgrades hollow completed projects to needs-review", () => {
  const delegated = verifyProjectResult({
    taskId: "t",
    size: "small",
    stats: { root: "/", fileCount: 1, totalBytes: 1, totalLines: 1, files: [] },
    modules: [],
    leads: [],
    status: "completed",
    summary: "use solo mode",
  })
  assert.equal(delegated.success, false)
  assert.match(delegated.reason ?? "", /solo mode/)

  const verified = verifyProjectResult({
    taskId: "t",
    size: "medium",
    stats: { root: "/", fileCount: 1, totalBytes: 1, totalLines: 1, files: [] },
    modules: [],
    leads: [{ leadId: "l", module: "m", workers: [], checks: [], status: "done" }],
    status: "completed",
    summary: "team done",
  })
  assert.equal(verified.success, true)
})
