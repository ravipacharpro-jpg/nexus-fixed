export * as ToolSafety from "./safety"

/**
 * Advisory shell-command safety classification.
 *
 * This module is deliberately enforcement-free and runtime-free (plain
 * TypeScript, no `effect` import, like `core/power.ts`): the PermissionV2
 * catalog remains the sole execution-authorization boundary, and keeping
 * this module dependency-free lets any runtime (core, nexus CLI, liaison)
 * reuse the same conservative patterns for model guidance and pre-flight
 * advice. Anything flagged here must still pass permission approval.
 */
export type SafetyLevel = "routine" | "confirm"

export type DestructivePattern = {
  readonly name: string
  readonly pattern: RegExp
  readonly advice: string
}

const rmRf: DestructivePattern = {
  name: "recursive-delete",
  pattern:
    /(^|[;&|]\s*|\$\()\s*(sudo\s+)?rm\s+[^|;&]*(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive|--force)|\brmdir\b|\brd\s+\/s/i,
  advice: "Recursive deletion cannot be undone. State the exact paths and wait for explicit confirmation.",
}

const disk: DestructivePattern = {
  name: "disk-destroy",
  pattern: /\bmkfs(\.|$|\s)|:\(\)\s*\{\s*:\|\:&\s*\}\s*;|\bdd\s+[^|;&]*\bof=|\bshred\b|\bformat\s+[a-z]:/i,
  advice: "Disk-level destruction cannot be undone. State the exact command and wait for explicit confirmation.",
}

const gitForce: DestructivePattern = {
  name: "git-force-overwrite",
  pattern: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*|push\s+--force([\s]|$)|branch\s+-D)\b/i,
  advice: "Forced git overwrites discard history or branches. State the exact ref and wait for explicit confirmation.",
}

const remotePipe: DestructivePattern = {
  name: "remote-code-execution",
  pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/i,
  advice: "Piping remote content into a shell executes untrusted code. Fetch and inspect it first, then wait for explicit confirmation.",
}

const deviceTruncate: DestructivePattern = {
  name: "device-truncate",
  pattern: />\s*\/dev\/(sd|hd|nvme|vd)[a-z]*/i,
  advice: "Writing to a block device destroys data. State the exact target and wait for explicit confirmation.",
}

export const DESTRUCTIVE_PATTERNS: ReadonlyArray<DestructivePattern> = [
  rmRf,
  disk,
  gitForce,
  remotePipe,
  deviceTruncate,
]

/** Conservative classification: `confirm` only on high-confidence destructive shapes. */
export function classifyCommand(command: string): SafetyLevel {
  return DESTRUCTIVE_PATTERNS.some((entry) => entry.pattern.test(command)) ? "confirm" : "routine"
}

/** Advisory confirmation text for a destructive command, or undefined when routine. */
export function confirmationAdvice(command: string): string | undefined {
  const hit = DESTRUCTIVE_PATTERNS.find((entry) => entry.pattern.test(command))
  return hit ? `${hit.name}: ${hit.advice}` : undefined
}
