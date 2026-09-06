import { describe, expect, test } from "bun:test"
import { assertActionAllowed, validateUrl } from "../../src/mcp/browser"

describe("McpBrowser safety helpers", () => {
  test("accepts HTTP(S) URLs and rejects unsafe or credential-bearing URLs", () => {
    expect(validateUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1")
    expect(() => validateUrl("javascript:alert(1)")).toThrow("Unsupported browser URL scheme")
    expect(() => validateUrl("https://user:secret@example.com")).toThrow("embedded credentials")
    expect(() => validateUrl("not a URL")).toThrow("Invalid browser URL")
  })

  test("denies sensitive browser actions", () => {
    expect(() => assertActionAllowed("click", { role: "button", name: "Submit application" })).toThrow(
      "denied by safety policy",
    )
    expect(() => assertActionAllowed("fill", { selector: "input[name=password]" }, "secret")).toThrow(
      "denied by safety policy",
    )
    expect(() => assertActionAllowed("type", { text: "Pay now" })).toThrow("denied by safety policy")
  })

  test("allows ordinary non-sensitive interaction", () => {
    expect(() => assertActionAllowed("click", { role: "button", name: "Next" })).not.toThrow()
    expect(() => assertActionAllowed("fill", { selector: "input[name=search]" }, "browser automation")).not.toThrow()
  })
})
