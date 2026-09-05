#!/usr/bin/env bash
# install-browser-minimal.sh — NEXUS Browser Adapter (Minimal, ~60 MB).
# Installs chromium-headless-shell + browser-use into ~/.nexus/browser-adapter.
# Covers 90% of tasks: forms, OTP, email, social media, basic scraping.
# Usage: bash scripts/install-browser-minimal.sh
# Safe to re-run. Cross-platform: Termux / Linux / WSL / macOS.

set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/install-browser-common.sh"

MODE="minimal"
REQUIRED_MB=400

main() {
  browser_log "mode: $MODE (~60 MB download)"
  browser_log "platform: $(browser_detect_platform)"
  browser_check_disk_mb "$REQUIRED_MB" || true

  PY="$(browser_ensure_python)"
  browser_log "using python: $PY"
  browser_ensure_venv "$PY"

  browser_pip_install_retry "playwright" "browser-use[cli]"
  browser_playwright_install "chromium-headless-shell"
  browser_write_wrapper
  browser_verify

  cat <<EOF

Browser Adapter (Minimal) installed.
  Mode:    minimal (~60 MB)
  Wrapper: $NEXUS_WRAPPER
  Test:    $NEXUS_WRAPPER --version
  TUI:     Ctrl+P -> Browser Adapter shows Minimal as Installed.

Agent can now use browser for forms, OTP, email, social, scraping.
EOF
}

main "$@"
