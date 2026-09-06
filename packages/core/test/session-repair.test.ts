import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { SessionRepair } from "@nexus-ai/core/session/repair"

class Boom {
  readonly _tag = "Boom"
  constructor(readonly message: string) {}
}

const describeBoom = (error: Boom) => ({ message: error.message })

describe("SessionRepair.withRepair", () => {
  test("succeeds on the first attempt with no repairs", async () => {
    const outcome = await Effect.runPromise(
      SessionRepair.withRepair({ key: "first-try", run: () => Effect.succeed("ok"), describe: describeBoom }),
    )
    expect(outcome.repaired).toBe(false)
    expect(outcome.result).toBe("ok")
    expect(outcome.blocker).toBeUndefined()
    expect(outcome.history.attempts.length).toBe(0)
  })

  test("repairs when a later attempt succeeds with a different failure first", async () => {
    let calls = 0
    const outcome = await Effect.runPromise(
      SessionRepair.withRepair({
        key: "flaky",
        run: () =>
          Effect.gen(function* () {
            calls += 1
            if (calls === 1) return yield* Effect.fail(new Boom("transient timeout"))
            return "recovered"
          }),
        describe: describeBoom,
      }),
    )
    expect(outcome.repaired).toBe(true)
    expect(outcome.result).toBe("recovered")
    expect(outcome.history.attempts.length).toBe(1)
  })

  test("stops early instead of repeating an identical failure unchanged", async () => {
    let calls = 0
    const outcome = await Effect.runPromise(
      SessionRepair.withRepair({
        key: "stagnant",
        run: () =>
          Effect.gen(function* () {
            calls += 1
            return yield* Effect.fail(new Boom("EACCES: permission denied"))
          }),
        describe: describeBoom,
      }),
    )
    expect(outcome.result).toBeUndefined()
    expect(calls).toBe(2)
    expect(outcome.history.attempts.length).toBe(2)
    expect(outcome.blocker).toContain("identically")
  })

  test("exhausts the budget on changing failures and reports the exact blocker", async () => {
    const outcome = await Effect.runPromise(
      SessionRepair.withRepair({
        key: "budget",
        maxAttempts: 3,
        step: "bun test",
        run: ({ attempt }) => Effect.fail(new Boom(`failure variant ${attempt}`)),
        describe: describeBoom,
      }),
    )
    expect(outcome.result).toBeUndefined()
    expect(outcome.history.attempts.length).toBe(3)
    expect(outcome.blocker).toContain("Blocked after 3 attempt(s)")
    expect(outcome.blocker).toContain("failure variant 3")
    expect(outcome.blocker).toContain("bun test")
  })

  test("fingerprint is stable for identical failures and differs on change", () => {
    expect(SessionRepair.fingerprint("boom\nsecond line", ["b.ts", "a.ts"])).toBe(
      SessionRepair.fingerprint("boom\nother", ["a.ts", "b.ts"]),
    )
    expect(SessionRepair.fingerprint("boom", [])).not.toBe(SessionRepair.fingerprint("different", []))
  })
})
