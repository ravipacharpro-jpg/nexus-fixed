export * as WebEvidence from "./web-evidence"

import { Parser } from "htmlparser2"

/**
 * Pure web-evidence helpers: page-title extraction and content-gate
 * detection for fetched pages.
 *
 * Runtime-free except the HTML parser (like `tool/safety.ts`): no Effect,
 * no services, so unit tests and any runtime can use these without the
 * tool-registry dependency chain. Gate detection is advisory and biased
 * toward flagging walls — a false positive costs a re-check, but an
 * unflagged login wall lets the model present it as the requested page.
 */
export type ContentGate = "login" | "captcha" | "paywall" | "empty"

export function extractTitleFromHTML(html: string): string | undefined {
  let title = ""
  let inTitle = false
  let done = false
  const parser = new Parser({
    onopentag(name) {
      if (!done && name === "title") inTitle = true
    },
    ontext(input) {
      if (inTitle && !done) title += input
    },
    onclosetag(name) {
      if (name === "title") {
        inTitle = false
        done = true
      }
    },
  })
  parser.write(html)
  parser.end()
  const trimmed = title.trim()
  return trimmed ? trimmed : undefined
}

const GATE_SIGNALS: ReadonlyArray<{ gate: Exclude<ContentGate, "empty">; pattern: RegExp }> = [
  {
    gate: "captcha",
    pattern:
      /just a moment|attention required|cf-challenge|verify you are human|i(?:'| a)m not a robot|recaptcha|select all images|enter the characters/i,
  },
  {
    gate: "login",
    pattern:
      /log in to continue|sign in to continue|login to continue|enter your password|enter password|one-time|verification code|sign in with|log in with/i,
  },
  {
    gate: "paywall",
    pattern:
      /subscribe to continue|become a member|members only|paywall|start your subscription|subscription required|premium subscription|continue reading with|metered limit/i,
  },
]

export function detectContentGate(content: string): ContentGate | undefined {
  if (!content.trim()) return "empty"
  return GATE_SIGNALS.find((signal) => signal.pattern.test(content))?.gate
}

export function gateWarning(output: { gate?: ContentGate; title?: string; url: string }): string {
  const page = output.title ? `Page "${output.title}"` : `Page ${output.url}`
  switch (output.gate) {
    case "login":
      return `${page} requires login — the content below is a login wall, not the requested page. Do not claim its contents as the page's information.`
    case "captcha":
      return `${page} is behind a bot challenge (CAPTCHA) — the content below is a challenge wall, not the requested page. Do not claim its contents as the page's information.`
    case "paywall":
      return `${page} is paywalled — the content below is a subscription wall, not the requested page. Do not claim its contents as the page's information.`
    default:
      return `${page} returned no readable content. Do not claim the page was read.`
  }
}
