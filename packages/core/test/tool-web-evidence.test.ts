import { describe, expect, test } from "bun:test"
import { WebEvidence } from "@nexus-ai/core/tool/web-evidence"

describe("WebEvidence.extractTitleFromHTML", () => {
  test("extracts the first HTML title and ignores empty titles", () => {
    expect(WebEvidence.extractTitleFromHTML("<html><head><title>Example Domain</title></head></html>")).toBe(
      "Example Domain",
    )
    expect(WebEvidence.extractTitleFromHTML("<title>  Spaced  </title><title>Second</title>")).toBe("Spaced")
    expect(WebEvidence.extractTitleFromHTML("<h1>No title here</h1>")).toBeUndefined()
    expect(WebEvidence.extractTitleFromHTML("<title>   </title>")).toBeUndefined()
  })
})

describe("WebEvidence.detectContentGate", () => {
  test("detects login, captcha, paywall, and empty content gates", () => {
    expect(WebEvidence.detectContentGate("Please log in to continue reading.")).toBe("login")
    expect(WebEvidence.detectContentGate("Enter your password to proceed.")).toBe("login")
    expect(WebEvidence.detectContentGate("Just a moment... verifying you are human.")).toBe("captcha")
    expect(WebEvidence.detectContentGate("Complete the reCAPTCHA below.")).toBe("captcha")
    expect(WebEvidence.detectContentGate("Subscribe to continue reading this story.")).toBe("paywall")
    expect(WebEvidence.detectContentGate("Members only content.")).toBe("paywall")
    expect(WebEvidence.detectContentGate("   \n  ")).toBe("empty")
    expect(WebEvidence.detectContentGate("The quick brown fox jumps over the lazy dog.")).toBeUndefined()
  })
})

describe("WebEvidence.gateWarning", () => {
  test("names the page and forbids presenting walls as content", () => {
    expect(WebEvidence.gateWarning({ gate: "login", title: "Secret Docs", url: "https://x.test" })).toContain(
      'Page "Secret Docs" requires login',
    )
    expect(WebEvidence.gateWarning({ gate: "captcha", url: "https://x.test" })).toContain("bot challenge")
    expect(WebEvidence.gateWarning({ gate: "paywall", url: "https://x.test" })).toContain("paywalled")
    expect(WebEvidence.gateWarning({ gate: "empty", url: "https://x.test" })).toContain("no readable content")
  })
})
