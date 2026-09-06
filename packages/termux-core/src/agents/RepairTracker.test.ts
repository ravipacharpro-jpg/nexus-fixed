import assert from "node:assert/strict"
import test from "node:test"
import { RepairTracker, blockerReport, fingerprint } from "./RepairTracker"

test("allows retries while budget remains and failure changes", () => {
  const tracker = new RepairTracker(3)
  const first = tracker.record("task", { step: "fix", error: "timeout" })
  assert.equal(first.attempt, 1)
  assert.equal(first.canRetry, true)
  const second = tracker.record("task", { step: "test re-run", error: "different failure" })
  assert.equal(second.attempt, 2)
  assert.equal(second.canRetry, true)
  assert.equal(second.stagnant, false)
})

test("stops early on identical failure instead of repeating unchanged", () => {
  const tracker = new RepairTracker(3)
  tracker.record("task", { step: "fix", error: "EACCES denied" })
  const second = tracker.record("task", { step: "test re-run", error: "EACCES denied" })
  assert.equal(second.canRetry, false)
  assert.equal(second.stagnant, true)
  assert.match(tracker.summary("task"), /identically/)
})

test("exhausts the budget on changing failures with an exact blocker", () => {
  const tracker = new RepairTracker(3)
  tracker.record("task", { step: "fix", error: "error one" })
  tracker.record("task", { step: "test re-run", error: "error two" })
  const third = tracker.record("task", { step: "test re-run", error: "error three" })
  assert.equal(third.canRetry, false)
  const summary = tracker.summary("task")
  assert.match(summary, /Blocked after 3 attempt\(s\)/)
  assert.match(summary, /error three/)
})

test("reset clears history after verified success", () => {
  const tracker = new RepairTracker(3)
  tracker.record("task", { step: "fix", error: "boom" })
  tracker.reset("task")
  assert.deepEqual(tracker.history("task"), [])
})

test("fingerprint is stable for identical failures and differs on change", () => {
  assert.equal(fingerprint("boom\nline2", ["b", "a"]), fingerprint("boom\nother", ["a", "b"]))
  assert.notEqual(fingerprint("boom", []), fingerprint("different", []))
})

test("blockerReport names the key, last error, and tried attempts", () => {
  const report = blockerReport("my-task", [
    { attempt: 1, step: "fix", error: "first boom", at: 1 },
    { attempt: 2, step: "re-run", error: "second boom", at: 2 },
  ], 2)
  assert.match(report, /my-task/)
  assert.match(report, /second boom/)
  assert.match(report, /#1 fix/)
})

test("blocker appends the classified cause and next action", () => {
  const tracker = new RepairTracker(2)
  tracker.record("task", { step: "fetch", error: "429 too many requests" })
  tracker.record("task", { step: "fetch", error: "quota exceeded for now" })
  const summary = tracker.summary("task")
  assert.match(summary, /Likely cause: rate-limit/)
  assert.match(summary, /Back off/)
})
