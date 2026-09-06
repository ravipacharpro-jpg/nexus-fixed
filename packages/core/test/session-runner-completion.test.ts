import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionMessage } from "@nexus-ai/core/session/message"
import { collectFailedToolCalls, formatToolError } from "@nexus-ai/core/session/runner/completion"

const decode = Schema.decodeUnknownSync(SessionMessage.Message)

const text = (id: string, textValue: string) => ({ type: "text" as const, id, text: textValue })

const tool = (
  id: string,
  name: string,
  state:
    | { status: "pending" }
    | { status: "running" }
    | { status: "completed" }
    | { status: "error"; message: string },
) => ({
  type: "tool" as const,
  id,
  name,
  state:
    state.status === "error"
      ? {
        status: "error" as const,
        input: {},
        content: [],
        structured: {},
        error: { type: "unknown" as const, message: state.message },
      }
      : state.status === "completed"
        ? { status: "completed" as const, input: {}, content: [], structured: {} }
        : state.status === "pending"
          ? { status: "pending" as const, input: "{}" }
          : { status: "running" as const, input: {}, structured: {}, content: [] },
  time: { created: 1 },
})

const assistant = (id: string, content: ReturnType<typeof text | typeof tool>[]) =>
  decode({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "test-model", providerID: "test-provider" },
    content,
    time: { created: 1 },
  })

describe("RunnerCompletion.collectFailedToolCalls", () => {
  test("returns nothing when no tool failed", () => {
    expect(collectFailedToolCalls([])).toEqual([])
    expect(
      collectFailedToolCalls([
        assistant("msg_1", [text("t1", "hello")]),
        assistant("msg_2", [tool("c1", "read", { status: "completed" })]),
      ]),
    ).toEqual([])
  })

  test("ignores pending and running calls", () => {
    expect(
      collectFailedToolCalls([
        assistant("msg_1", [tool("c1", "bash", { status: "pending" }), tool("c2", "bash", { status: "running" })]),
      ]),
    ).toEqual([])
  })

  test("collects error calls with id, name, and message", () => {
    expect(
      collectFailedToolCalls([
        assistant("msg_1", [
          tool("c1", "bash", { status: "error", message: "exit 127" }),
          tool("c2", "read", { status: "completed" }),
          tool("c3", "write", { status: "error", message: "denied" }),
        ]),
      ]),
    ).toEqual([
      { id: "c1", name: "bash", message: "exit 127" },
      { id: "c3", name: "write", message: "denied" },
    ])
  })

  test("formats every failed call through the shared contract", () => {
    expect(formatToolError({ id: "c1", name: "bash", message: "exit 127" })).toBe("bash: exit 127")
  })

  test("supports baseline filtering so pre-existing failures stay out", () => {
    const baseline = new Set(
      collectFailedToolCalls([assistant("msg_1", [tool("c1", "bash", { status: "error", message: "old" })])]).map(
        (toolCall) => toolCall.id,
      ),
    )
    const current = collectFailedToolCalls([
      assistant("msg_1", [tool("c1", "bash", { status: "error", message: "old" })]),
      assistant("msg_2", [tool("c2", "bash", { status: "error", message: "new" })]),
    ]).filter((toolCall) => !baseline.has(toolCall.id))
    expect(current).toEqual([{ id: "c2", name: "bash", message: "new" }])
  })
})
