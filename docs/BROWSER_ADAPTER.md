# NEXUS Browser Adapter

Agent + Browser Adapter milkar human-level browser tasks kar sakte hain.
Autofarm plugin hata diya gaya hai — agent ab browser se sab kaam karta hai.

## TUI se install

1. NEXUS TUI kholo
2. Ctrl+P dabao -> `Browser Adapter` select karo (slash: `/browser`)
3. 1 option chuno:

| Mode | Download | Total | Best for |
|------|----------|-------|----------|
| Minimal | 60 MB | ~360 MB | Forms, OTP, email, social, basic scraping |
| Balanced | 600 MB | ~900 MB | Complex sites, stealth, PDF |
| Full Power | 1.3 GB | ~1.6 GB | Video, extensions, headed mode, DevTools |

4. Terminal me script chalao:

```bash
# Minimal (recommended)
bash scripts/install-browser-minimal.sh

# Balanced
bash scripts/install-browser-balanced.sh

# Full Power
bash scripts/install-browser-full.sh
```

5. Verify:

```bash
~/.local/bin/nexus-browser --version
nexus doctor
```

Doctor me `Browser Adapter` ok dikhega jab wrapper + venv present ho.

## Agent kaise use karta hai

- User task deta hai: "Gmail login karke email padho"
- Agent browser adapter via `nexus-browser` call karta hai
- Forms, clicks, screenshots, OTP sab browser se hota hai
- Minimal se kaam na bane to TUI se mode switch karo

## Platform support

- Termux (phone): proot-distro Ubuntu me install hota hai, headless only
- Linux / WSL / macOS: direct native install, headed mode possible (Full)

## Uninstall

```bash
rm -rf ~/.nexus/browser-adapter ~/.local/bin/nexus-browser
```

TUI me dobara mode select karke reinstall kar sakte ho.

## Troubleshooting

- Low disk: `df -h ~` check karo, kam se kam 500 MB free rakho
- pip fail: 3x retry built-in hai, phir bhi fail ho to `pip install playwright browser-use` manually
- Playwright download slow: dobara script chalao (safe to re-run)
- Doctor skip dikhaye: matlab install nahi hua, script chalao
