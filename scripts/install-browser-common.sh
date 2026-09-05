#!/usr/bin/env bash
# install-browser-common.sh — shared helpers for NEXUS Browser Adapter installers.
# Sourced by install-browser-minimal.sh / balanced / full. Not meant to run directly.
# Quality: strict mode, platform auto-detect, disk check, retry, clean errors.

# shellcheck disable=SC2034
NEXUS_BROWSER_DIR="${NEXUS_BROWSER_DIR:-$HOME/.nexus/browser-adapter}"
NEXUS_VENV_DIR="$NEXUS_BROWSER_DIR/.venv"
NEXUS_LOCAL_BIN="$HOME/.local/bin"
NEXUS_WRAPPER="$NEXUS_LOCAL_BIN/nexus-browser"

browser_log() { printf '[browser-adapter] %s\n' "$*"; }
browser_fail() { printf '[browser-adapter][error] %s\n' "$*" >&2; return 1; }

browser_detect_platform() {
  local os_raw
  os_raw="$(uname -s 2>/dev/null || echo unknown)"
  case "$os_raw" in
    Linux)
      if [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux ]; then
        printf 'termux'
      elif grep -qi microsoft /proc/version 2>/dev/null; then
        printf 'wsl'
      else
        printf 'linux'
      fi
      ;;
    Darwin) printf 'macos' ;;
    *) printf 'unknown' ;;
  esac
}

browser_is_proot_mode() {
  [ "$(browser_detect_platform)" = "termux" ]
}

browser_check_disk_mb() {
  # $1 = required MB. Warns if free space below requirement.
  local required="$1"
  local free_kb free_mb
  free_kb="$(df -k "$HOME" 2>/dev/null | tail -1 | awk '{print $4}')"
  if [ -z "$free_kb" ] || [ "$free_kb" = "0" ]; then
    browser_log "warning: could not determine free disk space, continuing"
    return 0
  fi
  free_mb=$((free_kb / 1024))
  browser_log "free disk: ${free_mb} MB (need ${required} MB)"
  if [ "$free_mb" -lt "$required" ]; then
    browser_log "warning: low disk space — install may fail"
    return 1
  fi
  return 0
}

browser_ensure_python() {
  local platform py
  platform="$(browser_detect_platform)"
  if command -v python3 >/dev/null 2>&1; then
    py="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    py="$(command -v python)"
  else
    py=""
  fi
  if [ -n "$py" ] && "$py" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
    browser_log "python: $("$py" --version 2>&1)"
    printf '%s' "$py"
    return 0
  fi
  browser_log "installing Python 3.10+"
  case "$platform" in
    termux) pkg update -y && pkg install -y python ;;
    linux|wsl) sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip ;;
    macos) brew install python@3.11 || true ;;
    *) browser_fail "unsupported platform for auto python install" && return 1 ;;
  esac
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$(command -v python3)"
    return 0
  fi
  browser_fail "python install failed"
  return 1
}

browser_ensure_venv() {
  # $1 = python binary
  local py="$1"
  mkdir -p "$NEXUS_BROWSER_DIR"
  if [ ! -d "$NEXUS_VENV_DIR" ]; then
    browser_log "creating venv at $NEXUS_VENV_DIR"
    "$py" -m venv "$NEXUS_VENV_DIR" || return 1
  fi
  "$NEXUS_VENV_DIR/bin/pip" install --quiet --upgrade pip || return 1
  return 0
}

browser_pip_install_retry() {
  # $@ = pip packages. Retries 3x with backoff.
  local attempt=1
  while [ "$attempt" -le 3 ]; do
    browser_log "pip install attempt $attempt/3: $*"
    if "$NEXUS_VENV_DIR/bin/pip" install --quiet "$@"; then
      return 0
    fi
    browser_log "attempt $attempt failed, retrying in 5s"
    sleep 5
    attempt=$((attempt + 1))
  done
  browser_fail "pip install failed after 3 attempts: $*"
  return 1
}

browser_write_wrapper() {
  # Creates ~/.local/bin/nexus-browser wrapper calling venv browser-use.
  mkdir -p "$NEXUS_LOCAL_BIN"
  cat > "$NEXUS_WRAPPER" <<EOF
#!/usr/bin/env bash
# nexus-browser — NEXUS Browser Adapter wrapper (auto-generated).
# Calls browser-use inside the adapter venv.
exec "$NEXUS_VENV_DIR/bin/browser-use" "\$@"
EOF
  chmod +x "$NEXUS_WRAPPER"
  browser_log "wrapper: $NEXUS_WRAPPER"
}

browser_playwright_install() {
  # $1 = playwright browser spec (e.g. chromium-headless-shell or chromium or firefox)
  local spec="$1"
  browser_log "installing playwright browser: $spec (one-time download)"
  if ! "$NEXUS_VENV_DIR/bin/python" -m playwright install --with-deps "$spec" 2>&1 | tail -5; then
    browser_log "retry without --with-deps"
    "$NEXUS_VENV_DIR/bin/python" -m playwright install "$spec" || return 1
  fi
  return 0
}

browser_verify() {
  if "$NEXUS_VENV_DIR/bin/browser-use" --version >/dev/null 2>&1; then
    browser_log "OK: $("$NEXUS_VENV_DIR/bin/browser-use" --version 2>&1 | head -1)"
    return 0
  fi
  browser_fail "browser-use installed but not runnable"
  return 1
}
