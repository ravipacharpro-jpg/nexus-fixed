<div align="center">

# NEXUS

**An autonomous coding assistant with a terminal UI, API server, and extensible agent runtime.**

[![NEXUS Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/ravipacharpro-jpg/Nexus-Agent)

</div>

NEXUS is a Bun-based monorepo for an agentic development environment. It includes a terminal interface, a v2 CLI/API server, model and provider integrations, MCP support, project worktrees, and a web application.

> **Project note:** This repository is maintained as `ravipacharpro-jpg/Nexus-Agent`. Some upstream links and translated README files may refer to a different NEXUS distribution; use the commands and links in this README for this repository.

## Requirements

- [Bun](https://bun.sh/) **1.3.14** or a compatible Bun 1.x release
- Git
- A configured model provider for using the assistant (see the provider and model documentation in `packages/web/src/content/docs`)

## Quick start

### Install or update the latest release (Linux/Termux)

The following command downloads the latest matching Linux binary and atomically replaces the previous `nexus` binary. It does not remove your local configuration, API vault, memories, or project data:

```bash
curl -fsSL https://raw.githubusercontent.com/ravipacharpro-jpg/Nexus-Agent/main/scripts/install-latest.sh | bash
```

After installation, reopen your shell or run:

```bash
export PATH="$HOME/.local/bin:$PATH"
nexus --version
```

To update later, run the same installer command again. It always resolves the latest GitHub release for your CPU architecture.

Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/ravipacharpro-jpg/Nexus-Agent.git
cd Nexus-Agent
bun install
```

Start the development TUI:

```bash
bun dev
```

The same development launcher is also available as:

```bash
bun nexus
```

To start NEXUS in a particular project directory:

```bash
bun dev /path/to/project
```

The development entry point is `packages/nexus/src/index.ts`, and the default development command runs it with Bun's browser conditions enabled.

## CLI commands

The v2 CLI is currently a preview. From the repository root, use the development entry point while working from source:

```bash
bun dev --help
```

The published executable is named `nexus`:

```bash
nexus --help
```

| Command | Purpose |
| --- | --- |
| `nexus serve` | Start the v2 API server. |
| `nexus serve --hostname 127.0.0.1 --port 4096` | Start the API server on a specific host and port. |
| `nexus serve --register` | Start the API server and register it with the configured runtime. |
| `nexus api <operation>` | Make an OpenAPI request to a running server. An HTTP method and path may also be supplied. |
| `nexus api <operation> -d <body>` | Send a request body with an API request. |
| `nexus api <operation> -H name:value` | Add a request header. Repeat the flag when needed. |
| `nexus api <operation> --param key=value` | Supply an OpenAPI path or query parameter. |
| `nexus service start` | Start the background server. |
| `nexus service restart` | Restart the background server. |
| `nexus service status` | Show background server status. |
| `nexus service stop` | Stop the background server. |
| `nexus service password [value]` | Get or set the background server password. |
| `nexus debug agents` | List all available agents. |
| `nexus migrate` | Migrate v1 data to v2. |

For command-specific options, append `--help`, for example:

```bash
nexus serve --help
nexus api --help
nexus service --help
```

## Development commands

The root `package.json` contains the following commonly used scripts:

```bash
bun dev                  # Start the TUI from the repository root
bun dev /path/to/project  # Start the TUI in a specific project
bun run dev:web          # Start the web application
bun run dev:desktop      # Start the desktop application
bun run dev:storybook    # Start Storybook
bun run lint             # Run oxlint
bun run typecheck        # Type-check the workspace
bun run typecheck:lowmem # Type-check with one Turbo task at a time
bun run test:lowmem      # Run the low-memory test script
```

The root `test` script intentionally exits with an explanatory message; run the relevant package tests or `bun run test:lowmem` instead.

To work directly on the CLI package:

```bash
bun --cwd packages/cli run dev
bun --cwd packages/cli run typecheck
bun --cwd packages/cli run build
```

## Running the API server and web app

Run the v2 API server from source:

```bash
bun dev serve
```

The server defaults to `127.0.0.1`; pass `--port` and `--hostname` to change the bind address:

```bash
bun dev serve --hostname 127.0.0.1 --port 4096
```

In a second terminal, run the web application:

```bash
bun run dev:web
```

The web app is served by the development tooling on the local URL printed in the terminal.

## Repository layout

| Path | Description |
| --- | --- |
| `packages/nexus` | Core runtime, TUI entry point, v2 CLI commands, server, storage, and agent logic. |
| `packages/cli` | CLI framework and v2 command-line package. |
| `packages/app` | Web application. |
| `packages/desktop` | Desktop application wrapper. |
| `packages/assistant` | Assistant and agent behavior. |
| `packages/llm` | Provider and model integrations. |
| `packages/protocol` | Shared protocol types. |
| `docs` | Architecture, audit, runtime, and implementation notes. |
| `specs` | v2 configuration, provider, session, tool, and storage specifications. |

## Documentation

- [Contributing guide](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)
- [Architecture documentation](docs/)
- [v2 specifications](specs/v2/)
- [Web application documentation](packages/web/README.md)
- [CLI package](packages/cli/)

## Contributing

Before opening a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes focused, run the relevant checks, and include reproduction or verification steps for behavior changes. Pull requests should reference an existing issue and use a conventional title such as `feat:`, `fix:`, or `docs:`.

## License

See the repository's license file and package-specific notices for applicable licensing information.

---

**Repository:** [ravipacharpro-jpg/Nexus-Agent](https://github.com/ravipacharpro-jpg/Nexus-Agent)
