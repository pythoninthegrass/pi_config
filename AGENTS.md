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
- `settings.json.tpl` interpolates `PI_DEFAULT_PROVIDER` and `PI_DEFAULT_MODEL`; it also carries tuned compaction values (`reserveTokens`, `keepRecentTokens`) — change those here, not in the rendered file
- `.mcp.json.tpl` interpolates `$LIGHTPANDA_TOKEN` only; other `${VAR}` placeholders (e.g. `TINYFISH_API_KEY`, `SCREENCAP_DIR`) are left literal for pi-mcp-adapter to resolve at runtime

`.yml` files, `settings.json`, and `.mcp.json` are gitignored — only the `.tpl` sources are tracked. Edit the `.tpl` files, not the rendered output: edits to a rendered file are silently overwritten at the next shell startup (and never tracked by git).

`models.json` (pi) is **not** rendered from a template — it is tracked and hand-maintained. Newer pi treats a bare `apiKey` string as a **literal** key; to resolve an env var, prefix it (`$OMLX_API_KEY`). Literal keys (koboldcpp's `kobold`) stay bare. pi rewrites bare env-var-style names to `$`-form on startup, so the `$`-form is committed to keep the working tree clean.

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
- `models.json` `apiKey` values: `$`-prefixed for env-var resolution (`$OMLX_API_KEY`, `$LLAMACPP_API_KEY`), bare for literal keys (koboldcpp's `kobold`). Do not convert the `$`-form back to bare names — newer pi re-migrates them to `$`-form on startup, re-dirtying the tree.
- **MCP**: pi core has no native MCP (see pi README "No MCP"); support comes from the `pi-mcp-adapter` package. It reads, in precedence order (shallow merge, later wins): `~/.config/mcp/mcp.json` → `~/.pi/agent/mcp.json` → `<cwd>/.mcp.json` → `<cwd>/.pi/mcp.json`. The legacy `~/.pi/agent/.mcp.json` (dotted) path is **not** read by the adapter. Symlink the rendered `.mcp.json` to `~/.config/mcp/mcp.json` so servers load globally (all repos), not only when launched from this repo.
- **MCP merge is additive-only**: a per-repo `.mcp.json` / `.pi/mcp.json` can ADD or REPLACE (by same name) servers, but cannot REMOVE or disable a server defined in a global source — there is no `disabled`/`enabled` flag. To keep a server out of a repo, omit it from all global sources and opt in per-repo.
- **pi binary location (WSL is the primary host; macOS is secondary)**: pi is installed through a mise-managed `node` runtime (`~/.local/share/mise/installs/node/<ver>/bin/pi`). In an interactive WSL shell mise puts `pi` on PATH (`which pi` resolves it). Over a non-interactive `ssh wsl …` mise is not activated, so `pi`, `mise`, and even `node` are all off PATH: `ssh wsl pi …` gives `command not found`, and calling pi's full path also fails (its shebang can't find `node`). The reliable automation form is `ssh wsl '~/.local/bin/mise exec -- pi …'` — full mise path, then `mise exec` to set up the node env.
- The active inference backend must be running before launching either agent: `omlx` on `http://127.0.0.1:8000`, or `koboldcpp` on its configured ports (`models.json` lists `61516`–`61519`; `qwen3-coder-next-*` on `61519`).
- Active default is set per machine via `PI_DEFAULT_PROVIDER` / `PI_DEFAULT_MODEL` in `.env`, rendered into `settings.json` at shell startup. Current defaults: `koboldcpp` + `qwen3-coder-next-builder` (80B-A3B, no-think), or `omlx` + `Qwen3.6-35B-A3B-bf16` (Studio, 128GB) / `Qwen3.6-35B-A3B-MLX-8bit` (MBP, 64GB). All model IDs are listed in `models.json` / `models.yml.tpl`.
- **Model routing**: use `qwen3-coder-next-builder` (no-think) for greenfield and scoped edits; switch to `qwen3-coder-next-planner` (`reasoning: true`, `ctrl+l`) for non-trivial bugfixes and multi-file refactors that need a reasoning/investigation pass. Keep agentic turns short and watch `contextRatio` on long refactors — long turns on the 35B-A3B MoE can trip the "empty assistant stop twice" failure (mitigations in `docs/omlx-agentic-coding.md`: fall back to `Qwen3.6-27B-MLX-8bit`).
- **Multimodal**: `qwen3-coder-next` and the koboldcpp Qwen3.6 builders are text-only (`input: ["text"]`). For screenshot/vision tasks switch to the omlx `Qwen3.6-35B-A3B` provider (VLM — see `docs/omlx-agentic-coding.md` Verification).
- **Switching backends (Mac)**: `ctrl+l` inside pi switches provider/model for the current session — no `.env` change needed. To change the persistent default, edit `PI_DEFAULT_PROVIDER` and `PI_DEFAULT_MODEL` in `.env` and re-source the shell. Do not comment out `.env` entirely — unset vars leave literal `${PI_DEFAULT_PROVIDER}` in the rendered `settings.json`.
- **WSL**: `pi-omlx-picker` is automatically stripped from `packages` at render time (uname check in `.bash_aliases`) — omlx entries in `models.json` are inert on WSL.
- See `docs/omlx-agentic-coding.md` for hardware tuning, model profiles, SpecPrefill config, and thinking controls.
- `extensions/rtk-rewrite.ts` requires `rtk` (>= 0.38) on PATH. If rtk is absent the hook fails open — bash still runs, just unrewritten.
- Add `rtk-ai/rtk` to the Context7 libraries list if working with the rtk extension.
- See `docs/extensions.md` for extension architecture, rtk-rewrite internals, and how to write new extensions.

## Harbor Evaluation

Install (pin `supabase<3` — 3.x alpha drops the `_async` subpackage harbor requires):

```bash
uv tool install harbor --with 'supabase<3'
```

Run pi against a dataset with a local koboldcpp model:

```bash
harbor run \
  -a pi \
  -m openai/<model-label> \
  --ae OPENAI_API_KEY=dummy \
  --ae OPENAI_BASE_URL=http://host.docker.internal:<port>/v1 \
  -d livecodebench/livecodebench \
  -n 1
```

On WSL, if `host.docker.internal` doesn't resolve inside the harbor container, substitute `172.17.0.1` (default Docker bridge gateway).

### Model → port map

All models live in `~/git/wsl_setup/docker/`. Only one stack occupying port 61515 can run at a time.

| Model label | Port | Thinking | Compose dir |
|---|---|---|---|
| `qwen3-coder-next` | 61519 | off (proxy rewrite) | `qwen3-coder-next` |
| `qwen3-coder-next-direct` | 61515 | off | `qwen3-coder-next` |
| `scout` | 61518 | off | `qwen3-coder-next` |
| `qwen3.6-27b-builder` | 61515 | off | `qwen3.6-27b` |
| `qwen3.6-27b-planner` | 61514 | on (server-side) | `qwen3.6-27b` |
| `qwen3.6-35b-a3b-builder` | 61517 | off | `qwen3.6-35b-a3b` |
| `qwen3.6-35b-a3b-planner` | 61516 | on (server-side) | `qwen3.6-35b-a3b` |

### Examples

```bash
# qwen3-coder-next (no-think, proxy)
harbor run -a pi -m openai/qwen3-coder-next \
  --ae OPENAI_API_KEY=dummy \
  --ae OPENAI_BASE_URL=http://host.docker.internal:61519/v1 \
  -d livecodebench/livecodebench -n 1

# qwen3.6-35b-a3b builder (no-think)
harbor run -a pi -m openai/qwen3.6-35b-a3b-builder \
  --ae OPENAI_API_KEY=dummy \
  --ae OPENAI_BASE_URL=http://host.docker.internal:61517/v1 \
  -d livecodebench/livecodebench -n 1

# qwen3.6-35b-a3b planner (thinking enabled at server)
harbor run -a pi -m openai/qwen3.6-35b-a3b-planner \
  --ae OPENAI_API_KEY=dummy \
  --ae OPENAI_BASE_URL=http://host.docker.internal:61516/v1 \
  -d livecodebench/livecodebench -n 1
```
