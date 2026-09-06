import { createMemo, Show } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { useKV } from "../context/kv"
import { TextAttributes } from "@opentui/core"

type BrowserMode = "minimal" | "balanced" | "full"

type BrowserOption = {
  mode: BrowserMode
  title: string
  size: string
  total: string
  speed: string
  features: string
  recommended?: boolean
}

const BROWSER_OPTIONS: BrowserOption[] = [
  {
    mode: "minimal",
    title: "Minimal (60 MB)",
    size: "60 MB download",
    total: "~360 MB total with Ubuntu",
    speed: "Fast install (2-3 min)",
    features: "Forms, OTP, email, social media, basic scraping",
    recommended: true,
  },
  {
    mode: "balanced",
    title: "Balanced (600 MB)",
    size: "600 MB download",
    total: "~900 MB total with Ubuntu",
    speed: "Medium install (15-20 min)",
    features: "All above + better compatibility, stealth, PDF",
  },
  {
    mode: "full",
    title: "Full Power (1.3 GB)",
    size: "1.3 GB download",
    total: "~1.6 GB total with Ubuntu",
    speed: "Slow install (30-60 min)",
    features: "Everything + video, extensions, headed mode, DevTools",
  },
]

export function getBrowserAdapterMode(kv: { get: (key: string, fallback?: unknown) => unknown }): BrowserMode | null {
  const mode = kv.get("browser_adapter_mode", null)
  if (mode === "minimal" || mode === "balanced" || mode === "full") return mode
  return null
}

export function DialogBrowserAdapter() {
  const dialog = useDialog()
  const toast = useToast()
  const kv = useKV()
  const { theme } = useTheme()

  const currentMode = createMemo(() => getBrowserAdapterMode(kv))

  const options = createMemo(() =>
    BROWSER_OPTIONS.map((item) => ({
      value: item.mode,
      title: item.title,
      description: item.size,
      details: [item.total, item.speed, item.features],
      category: item.recommended ? "Recommended" : item.mode === "full" ? "Power users" : "Balanced",
      footer:
        currentMode() === item.mode ? (
          <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Selected</span>
        ) : (
          <span style={{ fg: theme.textMuted }}>○ Not selected</span>
        ),
      onSelect: () => {
        handleSelect(item.mode)
      },
    })),
  )

  function scriptFor(mode: BrowserMode) {
    if (mode === "minimal") return "install-browser-minimal.sh"
    if (mode === "balanced") return "install-browser-balanced.sh"
    return "install-browser-full.sh"
  }

  function handleSelect(mode: BrowserMode) {
    if (currentMode() === mode) {
      toast.show({
        variant: "info",
        message: `Browser Adapter already set to ${mode}. Run bash scripts/${scriptFor(mode)} to install.`,
        duration: 8000,
      })
      dialog.clear()
      return
    }
    kv.set("browser_adapter_mode", mode)
    kv.set("browser_adapter_installed", false)
    toast.show({
      variant: "info",
      title: "Browser Adapter Selected",
      message: `Mode: ${mode}. Run bash scripts/${scriptFor(mode)} in terminal to download, then agent can use browser.`,
      duration: 10000,
    })
    dialog.clear()
  }

  return (
    <DialogSelect
      title="Browser Adapter"
      options={options()}
      onSelect={(option) => {
        handleSelect(option.value as BrowserMode)
      }}
      footer={
        <Show
          when={currentMode()}
          fallback={
            <text fg={theme.textMuted}>
              Agent uses browser for web tasks. Pick a size, then run the script.
            </text>
          }
        >
          {(mode) => (
            <text fg={theme.success}>
              Selected: {mode()} — run bash scripts/{scriptFor(mode() as BrowserMode)} to install.
            </text>
          )}
        </Show>
      }
    />
  )
}
