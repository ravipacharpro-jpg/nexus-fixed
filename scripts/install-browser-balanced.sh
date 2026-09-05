#!/usr/bin/env bash
# install-browser-balanced.sh — NEXUS Browser Adapter (Balanced, ~600 MB).
# Installs full chromium headless + browser-use into ~/.nexus/browser-adapter.
# Covers 95% of tasks with better site compatibility and stealth.
# Usage: bash scripts/install-browser-balanced.sh
# Safe to re-run. Cross-platform: Termux / Linux / WSL / macOS.

set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/install-browser-common.sh"

MODE="balanced"
REQUIRED_MB=1200

main() {
  browser_log "mode: $MODE (~600 MB download)"
  browser_log "platform: $(browser_detect_platform)"
  browser_check_disk_mb "$REQUIRED_MB" || true

  PY="$(browser_ensure_python)"
  browser_log "using python: $PY"
  browser_ensure_venv "$PY"

  browser_pip_install_retry "playwright" "browser-use[cli]"
  browser_playwright_install "chromium"
  browser_write_wrapper
  browser_verify

  cat <<EOF

Browser Adapter (Balanced) installed.
  Mode:    balanced (~600 MB)
  Wrapper: $NEXUS_WRAPPER
  Test:    $NEXUS_WRAPPER --version
  TUI:     Ctrl+P -> Browser Adapter shows Balanced as Installed.

Agent can now use browser for all minimal tasks + complex sites, stealth, PDF.
EOF
}

main "$@"
