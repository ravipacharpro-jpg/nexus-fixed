#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO="ravipacharpro-jpg/nexus-fixed"
INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/dev/install.sh"
CURRENT_STEP="starting"

fail() {
  printf '\nNEXUS installer failed during: %s\n' "$CURRENT_STEP" >&2
  printf '%s\n' "$1" >&2
  exit 1
}

trap 'status=$?; if [ "$status" -ne 0 ]; then printf "\nNEXUS installer stopped during: %s (exit %s).\n" "$CURRENT_STEP" "$status" >&2; fi' EXIT

if [ "${PREFIX:-}" != "/data/data/com.termux/files/usr" ] || ! command -v pkg >/dev/null 2>&1; then
  fail "Ye installer native Termux app ke andar run karo."
fi

printf '%s\n' '======================================================='
printf '%s\n' 'NEXUS — EASY TERMUX INSTALLER'
printf '%s\n' '======================================================='
printf '%s\n' 'Source build/bun install ki zaroorat nahi hai; official fixed release install hoga.'
printf '%s\n' '======================================================='

CURRENT_STEP="updating Termux packages"
pkg update -y

CURRENT_STEP="installing download tools"
pkg install -y ca-certificates curl tar unzip

CURRENT_STEP="downloading the fixed Nexus installer"
tmp_installer="$(mktemp "${TMPDIR:-/data/data/com.termux/files/usr/tmp}/nexus-installer.XXXXXX")"
cleanup() { rm -f "$tmp_installer"; }
trap cleanup EXIT
curl -fsSL --retry 3 --connect-timeout 15 "$INSTALLER_URL" -o "$tmp_installer" || fail "Fixed repository ka installer download nahi ho saka. Internet/repository URL check karo."
chmod 700 "$tmp_installer"

CURRENT_STEP="installing the latest fixed release"
bash "$tmp_installer" "$@"

# Keep the installed launcher available in future Termux sessions.
INSTALL_BIN="${NEXUS_INSTALL_DIR:-$HOME/.nexus/bin}"
if [ -d "$INSTALL_BIN" ]; then
  case ":${PATH:-}:" in
    *":$INSTALL_BIN:"*) ;;
    *)
      touch "$HOME/.bashrc"
      if ! grep -Fq "export PATH=\"$INSTALL_BIN:\$PATH\"" "$HOME/.bashrc"; then
        printf '\n# NEXUS Termux\nexport PATH="%s:$PATH"\n' "$INSTALL_BIN" >> "$HOME/.bashrc"
      fi
      export PATH="$INSTALL_BIN:$PATH"
      ;;
  esac
fi

hash -r 2>/dev/null || true
printf '\nNEXUS fixed release installation complete.\n'
if command -v nexus >/dev/null 2>&1; then
  nexus --version || true
else
  printf '%s\n' 'New shell start karo ya run karo: source ~/.bashrc'
fi
printf '%s\n' 'Run: nexus'
