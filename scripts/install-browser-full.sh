#!/usr/bin/env bash
# install-browser-full.sh — NEXUS Browser Adapter (Full Power, ~1.3 GB).
# Installs full chromium + deps + browser-use + extras into ~/.nexus/browser-adapter.
# Covers 100%: video, extensions, headed mode, DevTools, WebRTC, GPU.
# Usage: bash scripts/install-browser-full.sh
# Safe to re-run. Cross-platform: Termux / Linux / WSL / macOS.

set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/install-browser-common.sh"

MODE="full"
REQUIRED_MB=2000

main() {
  browser_log "mode: $MODE (~1.3 GB download)"
  browser_log "platform: $(browser_detect_platform)"
  browser_check_disk_mb "$REQUIRED_MB" || true

  PY="$(browser_ensure_python)"
  browser_log "using python: $PY"
  browser_ensure_venv "$PY"

  browser_pip_install_retry "playwright" "browser-use[cli]" "pillow"
  browser_playwright_install "chromium"
  browser_playwright_install "firefox"
  browser_write_wrapper
  browser_verify

  cat <<EOF

Browser Adapter (Full Power) installed.
  Mode:    full (~1.3 GB)
  Wrapper: $NEXUS_WRAPPER
  Test:    $NEXUS_WRAPPER --version
  TUI:     Ctrl+P -> Browser Adapter shows Full Power as Installed.

Agent can now use full browser: video, extensions, headed mode, DevTools.
EOF
}

main "$@"
