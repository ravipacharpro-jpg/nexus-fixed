import { describe, expect, test } from "bun:test"
import { classifyError } from "@nexus-ai/core/session/orchestrator/error-classification"

describe("ErrorClassification.classifyError", () => {
  test("routes credential failures to the user with no retry", () => {
    const result = classifyError("invalid_api_key: key is not valid")
    expect(result.kind).toBe("auth")
    expect(result.retryable).toBe(false)
    expect(result.needsUser).toBe(true)
  })

  test("routes rate limits to retryable backoff", () => {
    const result = classifyError("429 too many requests, slow down")
    expect(result.kind).toBe("rate-limit")
    expect(result.retryable).toBe(true)
    expect(result.needsUser).toBe(false)
  })

  test("routes permission denials to user approval", () => {
    const result = classifyError("EACCES: permission denied, open diary")
    expect(result.kind).toBe("permission")
    expect(result.retryable).toBe(false)
    expect(result.needsUser).toBe(true)
  })

  test("routes destructive refusals to confirmation", () => {
    const result = classifyError("refusing to delete without confirmation required flag")
    expect(result.kind).toBe("destructive")
    expect(result.needsUser).toBe(true)
  })

  test("routes test and type failures to repair loops", () => {
    expect(classifyError("3 tests failed: expected 1 received 2").kind).toBe("test-failure")
    expect(classifyError("error TS2322: Type X is not assignable").kind).toBe("type-error")
    const typed = classifyError("Cannot find module './missing'")
    expect(typed.kind).toBe("type-error")
    expect(typed.retryable).toBe(true)
  })

  test("routes transient faults to backoff retry", () => {
    expect(classifyError("socket hang up after 30000ms timeout").kind).toBe("transient")
    expect(classifyError("request failed with status 503").retryable).toBe(true)
  })

  test("routes missing inputs and unsupported work honestly", () => {
    const missing = classifyError("DATABASE_URL environment variable is not defined")
    expect(missing.kind).toBe("missing-input")
    expect(missing.needsUser).toBe(true)
    const unsupported = classifyError("flight booking is not supported here")
    expect(unsupported.kind).toBe("unsupported")
    expect(unsupported.retryable).toBe(false)
  })

  test("falls back to unknown without retry or user need", () => {
    const result = classifyError("the frobnicate widget wobbled unexpectedly")
    expect(result.kind).toBe("unknown")
    expect(result.retryable).toBe(false)
    expect(result.needsUser).toBe(false)
    expect(result.advice.length).toBeGreaterThan(0)
  })

  test("prefers specific kinds over general ones", () => {
    expect(classifyError("401 unauthorized: invalid api key").kind).toBe("auth")
    expect(classifyError("quota exceeded: rate limit hit").kind).toBe("rate-limit")
  })
})
