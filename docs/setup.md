# Setup

Installation guide for the [pi](https://pi.dev) coding agent on macOS (omlx backend) and Ubuntu/WSL (koboldcpp backend).

## Prerequisites

### Both platforms

- `npm` / Node.js — via [mise](https://mise.jdx.dev): `mise use -g node@lts`
- `uvx` — via mise or `~/.local/bin/uvx`
- `backlog` CLI: `npm install -g backlog.md`
- `envsubst` — ships with `gettext` (`brew install gettext` / `sudo apt install gettext`)
- `~/git/bashrc/.bash_aliases` sourced in your shell (renders templates and exports env vars at startup)

### macOS

- Apple Silicon with 64+ GB RAM
- [oMLX](https://github.com/jundot/omlx) running on port 8000

### WSL (Ubuntu)

- koboldcpp builder and planner containers running — see [koboldcpp.md](../../wsl_setup/docs/koboldcpp.md):
  ```bash
  docker compose -f ~/git/wsl_setup/docker/qwen3.6-27b/docker-compose.yml ps
  ```
  Both `planner` and `builder` should show healthy.

## Install

```bash
# Install pi (skip if `which pi` resolves)
npm install -g @mariozechner/pi-coding-agent

# Clone this repo
git clone https://github.com/pythoninthegrass/pi_config.git ~/git/pi_config
cd ~/git/pi_config

# Symlink configs
mkdir -p ~/.pi/agent
ln -sf $(pwd)/models.json   ~/.pi/agent/models.json
ln -sf $(pwd)/settings.json ~/.pi/agent/settings.json
ln -sf $(pwd)/.mcp.json     ~/.pi/agent/.mcp.json
ln -sf $(pwd)/themes        ~/.pi/agent/themes
ln -sf $(pwd)/extensions    ~/.pi/agent/extensions
```

## Environment

Copy `.env.example` to `.env` and set values for your machine:

```bash
cp .env.example .env
```

**macOS:**

```bash
OMLX_BASE_URL="http://127.0.0.1:8000"
OMLX_API_KEY="<your-omlx-key>"
PI_DEFAULT_PROVIDER="omlx"
PI_DEFAULT_MODEL="Qwen3.6-35B-A3B-bf16"   # or MLX-8bit on MBP
```

**WSL:**

```bash
PI_DEFAULT_PROVIDER="koboldcpp"
PI_DEFAULT_MODEL="qwen3.6-27b-builder"
```

Re-source your shell to render `settings.json` from the template:

```bash
source ~/git/bashrc/.bashrc
```

Or render manually:

```bash
envsubst < settings.json.tpl > settings.json
```

Packages auto-installed by pi on first launch: `pi-mcp-adapter`, `context-mode` (WSL only — stripped on macOS at render time).

## MCP servers

| Server | Prereq | Notes |
|---|---|---|
| backlog | `backlog` CLI | `npm install -g backlog.md` |
| context-mode | auto | WSL only |
| context7 | `npx` | — |
| linear | `npx` | one-time OAuth — see below |
| screencap | uv project | macOS only; set `SCREENCAP_DIR` in `.env` |
| serena | `uvx` | clones on first launch |

### Linear OAuth (first run)

`mcp-remote` runs as a pi subprocess so the OAuth URL isn't visible inside pi. Run it directly in a separate terminal:

```bash
npx -y mcp-remote https://mcp.linear.app/mcp
```

Open the printed URL in a browser and complete the OAuth flow. Token is cached under `~/.mcp-auth/`. Restart pi — mcp-remote connects automatically thereafter.

## Mac → WSL koboldcpp (optional)

To use koboldcpp models from Mac, add SSH port forwards to `~/.ssh/config` under `Host wsl`:

```sshconfig
    LocalForward 61515 127.0.0.1:61515
    LocalForward 61516 127.0.0.1:61516
```

Or open a background tunnel:

```bash
ssh -fN -L 61515:localhost:61515 -L 61516:localhost:61516 wsl
```

**gnhf prerequisite:** the tunnel must be active before running `gnhf`. Install gnhf if not present:

```bash
npm install -g gnhf
```

Then switch to koboldcpp models inside pi with `ctrl+l`. To make koboldcpp the persistent default, update `PI_DEFAULT_PROVIDER` and `PI_DEFAULT_MODEL` in `.env` and re-source. Do not comment out `.env` entirely — unset vars leave literal `${PI_DEFAULT_PROVIDER}` in the rendered `settings.json`.

## Smoke tests

```bash
# Confirm default provider responds
pi -p "Reply with one word: hello"

# Check MCP servers loaded (inside pi)
/mcp
```

**WSL — confirm koboldcpp endpoints:**

```bash
curl -s http://localhost:61515/v1/models | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])"
curl -s http://localhost:61516/v1/models | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])"
```

## Known limitations (koboldcpp)

**Silent stop mid-task**: the builder model occasionally ends its agentic loop early when token budget is exhausted (`compaction.reserveTokens: 8192`). Re-prompt with "continue where you left off" to resume. Split large writes into batches of ≤3 tool calls or ≤100 lines to avoid hitting the limit.
