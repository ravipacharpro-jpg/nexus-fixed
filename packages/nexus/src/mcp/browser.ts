import { LayerNode } from "@nexus-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { existsSync } from "node:fs"
import open from "open"

export interface LaunchOptions {
  readonly id?: string
  readonly headless?: boolean
  readonly executablePath?: string
  readonly channel?: string
  readonly args?: readonly string[]
}

export interface BrowserSession {
  readonly id: string
  readonly reused: boolean
  readonly url: string
}

export interface NavigateResult {
  readonly url: string
  readonly status: number | null
  readonly title: string
}

export type LocatorTarget =
  | string
  | {
      readonly role?: string
      readonly name?: string
      readonly text?: string
      readonly selector?: string
      readonly exact?: boolean
    }

export interface ScreenshotOptions {
  readonly path?: string
  readonly type?: "png" | "jpeg"
  readonly fullPage?: boolean
}

export interface ScreenshotMetadata {
  readonly path?: string
  readonly mimeType: "image/png" | "image/jpeg"
  readonly bytes: number
  readonly url: string
  readonly capturedAt: string
  readonly fullPage: boolean
}

export interface Interface {
  readonly open: (url: string) => Effect.Effect<void, Error>
  readonly launch: (options?: LaunchOptions) => Effect.Effect<BrowserSession, Error>
  readonly navigate: (id: string, url: string) => Effect.Effect<NavigateResult, Error>
  readonly accessibilitySnapshot: (id: string) => Effect.Effect<unknown, Error>
  readonly click: (id: string, target: LocatorTarget) => Effect.Effect<void, Error>
  readonly fill: (id: string, target: LocatorTarget, value: string) => Effect.Effect<void, Error>
  readonly type: (id: string, target: LocatorTarget, value: string) => Effect.Effect<void, Error>
  readonly screenshot: (id: string, options?: ScreenshotOptions) => Effect.Effect<ScreenshotMetadata, Error>
  readonly close: (id?: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@nexus/McpBrowser") {}

/** Playwright's types are intentionally structural so this package can start without Playwright installed. */
interface PlaywrightLocator {
  click(): Promise<void>
  fill(value: string): Promise<void>
  pressSequentially(value: string): Promise<void>
  ariaSnapshot?(): Promise<string>
}
interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<{ status(): number | null } | null>
  url(): string
  title(): Promise<string>
  locator(selector: string): PlaywrightLocator
  getByRole(role: string, options?: { name?: string; exact?: boolean }): PlaywrightLocator
  getByText(text: string, options?: { exact?: boolean }): PlaywrightLocator
  screenshot(options?: { path?: string; type?: "png" | "jpeg"; fullPage?: boolean }): Promise<Uint8Array>
  accessibility?: { snapshot(options?: { interestingOnly?: boolean }): Promise<unknown> }
}
interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}
interface PlaywrightModule {
  chromium: {
    launch(options?: {
      headless?: boolean
      executablePath?: string
      channel?: string
      args?: readonly string[]
    }): Promise<PlaywrightBrowser>
  }
}
interface BrowserHandle {
  readonly browser: PlaywrightBrowser
  readonly page: PlaywrightPage
}

const DEFAULT_SESSION_ID = "default"
const NAVIGATION_TIMEOUT = 30_000
const DEFAULT_CHROMIUM_PATH = "/usr/bin/chromium"
const SENSITIVE_ACTION =
  /\b(?:log[ -]?in|sign[ -]?in|signin|password|passcode|otp|one[ -]?time(?: password| code)?|captcha|recaptcha|2fa|mfa|verification code|credit card|card number|cvv|cvc|payment|checkout|purchase|buy now|place order|submit|confirm order|authorize payment)\b/i
const sessions = new Map<string, BrowserHandle>()

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Accept only navigable web URLs; credentials and executable URL schemes are never passed to a browser. */
export function validateUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid browser URL: ${value}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported browser URL scheme: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error("Browser URLs must not contain embedded credentials")
  }
  return url.toString()
}

/** Conservative deny-by-default guard for credentials, challenges, payments, and consequential submissions. */
export function assertActionAllowed(action: string, target?: LocatorTarget, value?: string): void {
  const description = `${action} ${typeof target === "string" ? target : JSON.stringify(target ?? {})} ${value ?? ""}`
  if (SENSITIVE_ACTION.test(description)) {
    throw new Error(
      `Browser action denied by safety policy: ${action} targets a login, OTP/CAPTCHA, payment, or final-submission flow. Complete that step yourself in the browser.`,
    )
  }
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("playwright-core")) as unknown as PlaywrightModule
  } catch (error) {
    throw new Error(
      `Browser automation unavailable: optional dependency "playwright-core" is not installed (${asError(error).message}). Install playwright-core and a compatible browser binary.`,
    )
  }
}

function requireSession(id: string): BrowserHandle {
  const session = sessions.get(id)
  if (!session) throw new Error(`Browser session not found: ${id}`)
  return session
}

function targetLocator(page: PlaywrightPage, target: LocatorTarget): PlaywrightLocator {
  if (typeof target === "string") return page.locator(target)
  if (target.role) return page.getByRole(target.role, { name: target.name, exact: target.exact })
  if (target.text) return page.getByText(target.text, { exact: target.exact })
  if (target.selector) return page.locator(target.selector)
  throw new Error("A browser locator requires a CSS selector, role, or text target")
}

const layer = Layer.succeed(
  Service,
  Service.of({
    open: Effect.fn("McpBrowser.open")(function* (url: string) {
      const safeUrl = validateUrl(url)
      const subprocess = yield* Effect.tryPromise({
        try: () => open(safeUrl),
        catch: asError,
      })
      yield* Effect.callback<void, Error>((resume) => {
        const timer = setTimeout(() => resume(Effect.void), 500)
        subprocess.on("error", (error) => {
          clearTimeout(timer)
          resume(Effect.fail(asError(error)))
        })
        subprocess.on("exit", (code) => {
          if (code === null || code === 0) return
          clearTimeout(timer)
          resume(Effect.fail(new Error(`Browser open failed with exit code ${code}`)))
        })
      })
    }),
    launch: Effect.fn("McpBrowser.launch")(function* (options: LaunchOptions = {}) {
      const id = options.id?.trim() || DEFAULT_SESSION_ID
      const existing = sessions.get(id)
      if (existing) return { id, reused: true, url: existing.page.url() } satisfies BrowserSession
      const playwright = yield* Effect.tryPromise({ try: loadPlaywright, catch: asError })
      const executablePath =
        options.executablePath ??
        process.env.NEXUS_BROWSER_EXECUTABLE ??
        (existsSync(DEFAULT_CHROMIUM_PATH) ? DEFAULT_CHROMIUM_PATH : undefined)
      const browser = yield* Effect.tryPromise({
        try: () =>
          playwright.chromium.launch({
            headless: options.headless ?? true,
            executablePath,
            channel: options.channel,
            args: options.args,
          }),
        catch: (error) =>
          new Error(
            `Browser launch failed: ${asError(error).message}. Playwright-core does not download browsers; install a compatible Chromium/Chrome binary or provide executablePath.`,
          ),
      })
      try {
        const page = yield* Effect.tryPromise({ try: () => browser.newPage(), catch: asError })
        sessions.set(id, { browser, page })
        return { id, reused: false, url: page.url() } satisfies BrowserSession
      } catch (error) {
        yield* Effect.tryPromise(() => browser.close()).pipe(Effect.ignore)
        return yield* Effect.fail(asError(error))
      }
    }),
    navigate: Effect.fn("McpBrowser.navigate")(function* (id: string, url: string) {
      const session = requireSession(id)
      const response = yield* Effect.tryPromise({
        try: () => session.page.goto(validateUrl(url), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT }),
        catch: asError,
      })
      const title = yield* Effect.tryPromise({ try: () => session.page.title(), catch: asError })
      return { url: session.page.url(), status: response?.status() ?? null, title } satisfies NavigateResult
    }),
    accessibilitySnapshot: Effect.fn("McpBrowser.accessibilitySnapshot")(function* (id: string) {
      const page = requireSession(id).page
      if (page.accessibility?.snapshot) {
        return yield* Effect.tryPromise({
          try: () => page.accessibility!.snapshot({ interestingOnly: false }),
          catch: asError,
        })
      }
      const body = page.locator("body")
      if (body.ariaSnapshot) return yield* Effect.tryPromise({ try: () => body.ariaSnapshot!(), catch: asError })
      return yield* Effect.fail(new Error("Accessibility snapshots are not supported by this Playwright runtime"))
    }),
    click: Effect.fn("McpBrowser.click")(function* (id: string, target: LocatorTarget) {
      assertActionAllowed("click", target)
      yield* Effect.tryPromise({ try: () => targetLocator(requireSession(id).page, target).click(), catch: asError })
    }),
    fill: Effect.fn("McpBrowser.fill")(function* (id: string, target: LocatorTarget, value: string) {
      assertActionAllowed("fill", target, value)
      yield* Effect.tryPromise({
        try: () => targetLocator(requireSession(id).page, target).fill(value),
        catch: asError,
      })
    }),
    type: Effect.fn("McpBrowser.type")(function* (id: string, target: LocatorTarget, value: string) {
      assertActionAllowed("type", target, value)
      yield* Effect.tryPromise({
        try: () => targetLocator(requireSession(id).page, target).pressSequentially(value),
        catch: asError,
      })
    }),
    screenshot: Effect.fn("McpBrowser.screenshot")(function* (id: string, options: ScreenshotOptions = {}) {
      const page = requireSession(id).page
      const type = options.type ?? "png"
      const image = yield* Effect.tryPromise({
        try: () => page.screenshot({ path: options.path, type, fullPage: options.fullPage ?? false }),
        catch: asError,
      })
      return {
        ...(options.path ? { path: options.path } : {}),
        mimeType: type === "png" ? "image/png" : "image/jpeg",
        bytes: image.byteLength,
        url: page.url(),
        capturedAt: new Date().toISOString(),
        fullPage: options.fullPage ?? false,
      } satisfies ScreenshotMetadata
    }),
    close: Effect.fn("McpBrowser.close")(function* (id?: string) {
      const handles = id ? [[id, sessions.get(id)] as const] : [...sessions.entries()]
      for (const [sessionId, session] of handles) {
        if (!session) continue
        yield* Effect.tryPromise({ try: () => session.browser.close(), catch: asError })
        sessions.delete(sessionId)
      }
    }),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })

export * as McpBrowser from "./browser"
