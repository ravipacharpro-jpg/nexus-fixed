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
