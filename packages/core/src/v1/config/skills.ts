export * as ConfigSkillsV1 from "./skills"

import { Schema } from "effect"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
  auto: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean).annotate({
        description: "Automatically discover and load matching skills for each task",
      }),
      urls: Schema.optional(Schema.Array(Schema.String)).annotate({
        description: "Trusted skill indexes used only for task-scoped automatic downloads",
      }),
      maxSkills: Schema.optional(Schema.Number).annotate({
        description: "Maximum number of automatically selected skills per task",
      }),
      retainOnFailure: Schema.optional(Schema.Boolean).annotate({
        description: "Keep task-scoped downloaded skills after a failed task for debugging",
      }),
    }),
  ),
})
export type Info = Schema.Schema.Type<typeof Info>
