#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# Canonical Termux entry point. Keep the old filename working while routing
# users to the fixed-release installer that does not require Bun/source builds.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
LOCAL_INSTALLER="$SCRIPT_DIR/install-termux-easy.sh"
REMOTE_INSTALLER="https://raw.githubusercontent.com/ravipacharpro-jpg/nexus-fixed/dev/install-termux-easy.sh"

if [ -f "$LOCAL_INSTALLER" ]; then
  exec bash "$LOCAL_INSTALLER" "$@"
fi

command -v curl >/dev/null 2>&1 || {
  printf '%s\n' 'curl is required. Install it first with: pkg install curl -y' >&2
  exit 1
}

tmp_installer="$(mktemp "${TMPDIR:-/data/data/com.termux/files/usr/tmp}/nexus-easy-installer.XXXXXX")"
trap 'rm -f "$tmp_installer"' EXIT
curl -fsSL --retry 3 "$REMOTE_INSTALLER" -o "$tmp_installer"
chmod 700 "$tmp_installer"
exec bash "$tmp_installer" "$@"
