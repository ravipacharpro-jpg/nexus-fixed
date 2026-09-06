# Task-scoped automatic skills

NEXUS can optionally discover skills before a task starts, download matching skill bundles into a temporary cache directory, expose only the selected skills to the agent, and remove the temporary files after the task finishes. Existing user-owned skills are never deleted.

Enable it only with trusted skill indexes in `nexus.json`:

```json
{
  "skills": {
    "auto": {
      "enabled": true,
      "urls": [
        "https://your-trusted-domain.example/.well-known/skills/"
      ],
      "maxSkills": 3,
      "retainOnFailure": false
    }
  }
}
```

Each URL must expose the NEXUS/Agent Skills discovery shape: an `index.json` containing skill entries and downloadable file names, including `SKILL.md`. The agent matches the task text against skill names and descriptions, loads at most `maxSkills` permitted matches, and cleans up the task scope after completion. The limit is clamped to a safe range of one to eight skills.

Automatic downloads are deliberately not enabled from an arbitrary marketplace by default. A downloaded `SKILL.md` is instruction content, not executable authority. NEXUS still applies the agent's `skill` permission rules; shell, network, file, Git, and MCP permissions remain controlled by the normal tool/permission system. Do not add a source unless you trust its maintainers and review its update policy. Set `retainOnFailure` only while debugging a failed task.

The Vercel `skills` CLI and `skills.sh` catalog can be used to discover candidate skills, but their marketplace API is not itself an Agent Skills `index.json` source. Prefer a trusted mirrored/well-known index or install a reviewed skill into the normal project/global skill directories.

## Optional local model routers

NEXUS also supports optional OpenAI-compatible local routers:

| Router | Base URL | Model | Credential |
|---|---|---|---|
| OmniRoute | `http://127.0.0.1:20128/v1` | `auto` | Optional local gateway; provider access depends on OmniRoute configuration |
| FreeLLMAPI | `http://127.0.0.1:3001/v1` | `auto` | Unified key from the local FreeLLMAPI dashboard |

These routers pool only the provider credentials and access that the user has configured. They do not create anonymous provider access or bypass provider terms.
