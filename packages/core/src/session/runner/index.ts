export * as SessionRunner from "./index"

import type { LLMError } from "@nexus-ai/llm"
import { Context, Effect, Schema } from "effect"
import { SessionSchema } from "../schema"
import type { ContextSnapshotDecodeError, MessageDecodeError } from "../error"
import { SessionRunnerModel } from "./model"
import type { SystemContext } from "../../system-context/index"
import type { ToolOutputStore } from "../../tool-output-store"

/**
 * A drain finished its turns but the completion gate failed: new unresolved
 * tool errors remain, so success must not be claimed. Carries the exact
 * blockers instead of failing silently.
 */
export class RunCompletionUnverified extends Schema.TaggedErrorClass<RunCompletionUnverified>()(
  "SessionRunner.RunCompletionUnverified",
  {
    sessionID: SessionSchema.ID,
    reason: Schema.String,
    errors: Schema.Array(Schema.String),
  },
) {}

export type RunError =
  | LLMError
  | SessionRunnerModel.Error
  | MessageDecodeError
  | ContextSnapshotDecodeError
  | SystemContext.InitializationBlocked
  | ToolOutputStore.Error
  | RunCompletionUnverified

/** Runs one local continuation from already-recorded Session history. */
export interface Interface {
  /** Drains eligible durable work. Explicit runs perform one provider attempt even when no work is eligible. */
  readonly run: (input: {
    readonly sessionID: SessionSchema.ID
    readonly force: boolean
  }) => Effect.Effect<void, RunError>
}

export class Service extends Context.Service<Service, Interface>()("@nexus/v2/SessionRunner") {}
