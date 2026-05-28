# AGENTS.md

This file provides guidance to LLM agents when working with code in this repository.

## What This Repo Is

Configuration for the `pi` and `omp` coding agents backed by a local oMLX inference server. No build system — the repo is purely config files and docs.

## File Map

| File | Purpose | Managed by |
|---|---|---|
| `settings.json` | pi agent settings (provider, model, theme) (rendered) | symlinked to `~/.pi/agent/settings.json` |
| `settings.json.tpl` | pi settings template (envsubst source) | rendered → `settings.json` at shell startup |
| `models.json` | pi provider definitions (omlx, omlx-thinking) | symlinked to `~/.pi/agent/models.json` |
| `models.yml` | omp provider definitions (rendered) | symlinked to `~/.omp/agent/models.yml` |
| `config.yml` | omp settings (rendered) | symlinked to `~/.omp/agent/config.yml` |
| `models.yml.tpl` | omp models template (envsubst source) | rendered → `models.yml` at shell startup |
| `config.yml.tpl` | omp config template (envsubst source) | rendered → `config.yml` at shell startup |
| `.mcp.json` | MCP server config for pi-mcp-adapter (rendered) | symlinked to `~/.config/mcp/mcp.json` |
| `.mcp.json.tpl` | MCP config template (envsubst source) | rendered → `.mcp.json` at shell startup |
| `themes/` | pi color themes | symlinked to `~/.pi/agent/themes/` |
| `extensions/` | pi extensions (rtk auto-rewrite hook) | symlinked to `~/.pi/agent/extensions/` |
| `agents/` | pi-minimal-subagent agent definitions (`scout`, `reviewer`) | symlinked to `~/.pi/agent/agents/` |
| `model_settings.json` | oMLX per-model server settings (context window, SpecPrefill, TurboQuant, thinking) | symlinked to `~/.omlx/model_settings.json` |

## Template Rendering

`models.yml`, `config.yml`, `settings.json`, and `.mcp.json` are rendered from their `.tpl` counterparts via `envsubst` at shell startup (sourced from `~/git/bashrc/.bash_aliases`).

- `models.yml.tpl` interpolates `OMLX_BASE_URL` and `OMLX_API_KEY`
- `config.yml.tpl` has no variable substitutions (static template)
- `settings.json.tpl` interpolates `OMLX_DEFAULT_MODEL`
- `.mcp.json.tpl` interpolates `$LIGHTPANDA_TOKEN` only; other `${VAR}` placeholders (e.g. `TINYFISH_API_KEY`, `SCREENCAP_DIR`) are left literal for pi-mcp-adapter to resolve at runtime

`.yml` files, `settings.json`, and `.mcp.json` are gitignored — only the `.tpl` sources are tracked. Edit the `.tpl` files, not the rendered output.

`models.json` (pi) uses `apiKey: "OMLX_API_KEY"` — pi resolves env var names at runtime, so no template rendering is needed.

## Linting

```bash
markdownlint -f -c .markdownlint.jsonc .
```

## Symlink Setup

```bash
mkdir -p ~/.omp/agent ~/.pi/agent
ln -sf $(pwd)/models.yml ~/.omp/agent/models.yml
ln -sf $(pwd)/config.yml ~/.omp/agent/config.yml
ln -sf $(pwd)/settings.json ~/.pi/agent/settings.json
ln -sf $(pwd)/models.json ~/.pi/agent/models.json
mkdir -p ~/.config/mcp && ln -sf $(pwd)/.mcp.json ~/.config/mcp/mcp.json
ln -sf $(pwd)/themes ~/.pi/agent/themes
ln -sf $(pwd)/extensions ~/.pi/agent/extensions
ln -sf $(pwd)/agents ~/.pi/agent/agents
ln -sf $(pwd)/model_settings.json ~/.omlx/model_settings.json
```

## Context7

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

### Libraries

- badlogic/pi-mono
- can1357/oh-my-pi
- jdx/mise
- jundot/omlx
- lostruins/koboldcpp
- rtk-ai/rtk
- websites/pi_dev

## Key Constraints

- `models.yml` / `config.yml` must not be committed (gitignored). Only edit their `.tpl` sources.
- `models.json` uses env var names as `apiKey` values — do not substitute literal keys.
- **MCP**: pi core has no native MCP (see pi README "No MCP"); support comes from the `pi-mcp-adapter` package. It reads, in precedence order (shallow merge, later wins): `~/.config/mcp/mcp.json` → `~/.pi/agent/mcp.json` → `<cwd>/.mcp.json` → `<cwd>/.pi/mcp.json`. The legacy `~/.pi/agent/.mcp.json` (dotted) path is **not** read by the adapter. Symlink the rendered `.mcp.json` to `~/.config/mcp/mcp.json` so servers load globally (all repos), not only when launched from this repo.
- **MCP merge is additive-only**: a per-repo `.mcp.json` / `.pi/mcp.json` can ADD or REPLACE (by same name) servers, but cannot REMOVE or disable a server defined in a global source — there is no `disabled`/`enabled` flag. To keep a server out of a repo, omit it from all global sources and opt in per-repo.
- oMLX must be running on `http://127.0.0.1:8000` before launching either agent.
- Active model is `Qwen3.6-35B-A3B-bf16` (Studio, 128GB) / `Qwen3.6-35B-A3B-MLX-8bit` (MBP, 64GB). Both IDs are listed in `models.json` and `models.yml.tpl`; `defaultModel` in `settings.json` is set via `PI_DEFAULT_PROVIDER` / `PI_DEFAULT_MODEL` in `.env` — set per machine.
- **Switching backends (Mac)**: `ctrl+l` inside pi switches provider/model for the current session — no `.env` change needed. To change the persistent default, edit `PI_DEFAULT_PROVIDER` and `PI_DEFAULT_MODEL` in `.env` and re-source the shell. Do not comment out `.env` entirely — unset vars leave literal `${PI_DEFAULT_PROVIDER}` in the rendered `settings.json`.
- **WSL**: `pi-omlx-picker` is automatically stripped from `packages` at render time (uname check in `.bash_aliases`) — omlx entries in `models.json` are inert on WSL.
- See `docs/omlx-agentic-coding.md` for hardware tuning, model profiles, SpecPrefill config, and thinking controls.
- `extensions/rtk-rewrite.ts` requires `rtk` (>= 0.38) on PATH. If rtk is absent the hook fails open — bash still runs, just unrewritten.
- Add `rtk-ai/rtk` to the Context7 libraries list if working with the rtk extension.
- See `docs/extensions.md` for extension architecture, rtk-rewrite internals, and how to write new extensions.
