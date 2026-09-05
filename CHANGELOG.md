# Changelog

## Unreleased

### feat(tui): Browser Adapter with 3 size options

- Add Ctrl+P -> Browser Adapter dialog (`/browser` slash command).
- 3 modes: Minimal (60 MB), Balanced (600 MB), Full Power (1.3 GB).
- New scripts: `scripts/install-browser-minimal.sh`, `install-browser-balanced.sh`, `install-browser-full.sh`.
- Shared helper: `scripts/install-browser-common.sh` (platform detect, disk check, retry).
- Wrapper installed at `~/.local/bin/nexus-browser` for agent use.
- Docs: `docs/BROWSER_ADAPTER.md`.

### chore(assistant): remove autofarm plugin

- Delete `packages/assistant/src/plugins/autofarm/`.
- No code references remain; agent handles web tasks via Browser Adapter.
- `nexus doctor` no longer includes autofarm checks.

### feat(nexus): doctor Browser Adapter check

- Add `Browser Adapter` check to `nexus doctor`.
- Reports ok when wrapper + venv present, skip when not installed.
- Update test to expect 11 checks.
