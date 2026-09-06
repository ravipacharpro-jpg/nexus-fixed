#!/usr/bin/env bash
# Install or update NEXUS from the latest GitHub release.
# Safe update: downloads to a temporary directory, verifies the binary, then atomically replaces nexus.
set -euo pipefail

REPO="${NEXUS_REPO:-ravipacharpro-jpg/Nexus-Agent}"
INSTALL_DIR="${NEXUS_INSTALL_DIR:-${HOME}/.local/bin}"
API="https://api.github.com/repos/${REPO}/releases/latest"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

case "$(uname -s)" in
  Linux) os="linux" ;;
  *) echo "Unsupported OS: $(uname -s). Current release installer supports Linux and Termux." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch="x64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
esac

asset="nexus-${os}-${arch}.tar.gz"
url="$(curl -fsSL "$API" | grep -o '"browser_download_url": "[^"]*'"${asset}"'"' | head -1 | sed 's/.*"\(https[^" ]*\)"/\1/')"
if [ -z "$url" ]; then
  echo "Latest release does not contain ${asset}. Check https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
echo "Downloading NEXUS ${asset}..."
curl -fL --retry 3 --proto '=https' --tlsv1.2 "$url" -o "$TMP/nexus.tar.gz"
tar -xzf "$TMP/nexus.tar.gz" -C "$TMP"
binary="$(find "$TMP" -type f -path '*/bin/nexus' -print -quit)"
[ -n "$binary" ] || { echo "Release archive did not contain bin/nexus" >&2; exit 1; }
chmod 0755 "$binary"
"$binary" --version >/dev/null 2>&1 || { echo "Downloaded NEXUS binary failed its version check" >&2; exit 1; }

# Atomic replacement means an interrupted update leaves the previous install usable.
install -m 0755 "$binary" "$INSTALL_DIR/.nexus.new"
mv -f "$INSTALL_DIR/.nexus.new" "$INSTALL_DIR/nexus"
echo "NEXUS updated successfully: $INSTALL_DIR/nexus"
echo "If 'nexus' is not found, add this to your shell profile:"
echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
