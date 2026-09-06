export * as RunnerCompletion from "./completion"

import type { SessionMessage } from "../message"

export type FailedToolCall = {
  readonly id: string
  readonly name: string
  readonly message: string
}

/**
 * Collect unresolved tool errors from session history. Pure and
 * layer-independent so the completion gate and its tests share one
 * definition of "unresolved": only `error` states count; pending,
 * running, and completed calls never do.
 */
export const collectFailedToolCalls = (
  messages: ReadonlyArray<SessionMessage.Message>,
): FailedToolCall[] =>
  messages.flatMap((message) =>
    message.type === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "tool" && part.state.status === "error"
            ? [{ id: part.id, name: part.name, message: part.state.error.message }]
            : [],
        )
      : [],
  )

/**
 * Standard single-line rendering of one failed tool call. This is the
 * shared contract for tool-failure evidence: the completion gate, repair
 * records, and blockers all render through here so the same failure reads
 * identically everywhere.
 */
export const formatToolError = (tool: FailedToolCall): string => `${tool.name}: ${tool.message}`

/**
 * Unresolved failures within one drain window. A failed call counts unless
 * it predates the drain (baseline ID) or a later call with the same tool
 * name completed: a retried-and-recovered step is resolved, not a blocker.
 * Same-name pairing is heuristic — one tool serves many purposes — but a
 * later success is the only in-transcript signal that recovery happened.
 */
export const collectUnresolvedToolCalls = (
  messages: ReadonlyArray<SessionMessage.Message>,
  baselineIds: ReadonlySet<string> | ReadonlyArray<string>,
): FailedToolCall[] => {
  const baseline = baselineIds instanceof Set ? baselineIds : new Set(baselineIds)
  const latest = new Map<string, FailedToolCall>()
  for (const message of messages) {
    if (message.type !== "assistant") continue
    for (const part of message.content) {
      if (part.type !== "tool" || baseline.has(part.id)) continue
      if (part.state.status === "error") {
        latest.set(part.name, { id: part.id, name: part.name, message: part.state.error.message })
      } else if (part.state.status === "completed") {
        latest.delete(part.name)
      }
    }
  }
  return [...latest.values()]
}
