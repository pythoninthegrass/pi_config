# AGENTS.md

This file provides guidance to LLM agents when working with code in this repository.

## What This Repo Is

Configuration for the `pi` and `omp` coding agents backed by a local oMLX inference server. No build system — the repo is purely config files and docs.

## File Map

| File | Purpose | Managed by |
|---|---|---|
| `settings.json` | pi agent settings (provider, model, theme) | symlinked to `~/.pi/agent/settings.json` |
| `models.json` | pi provider definitions (omlx, omlx-thinking) | symlinked to `~/.pi/agent/models.json` |
| `models.yml` | omp provider definitions (rendered) | symlinked to `~/.omp/agent/models.yml` |
| `config.yml` | omp settings (rendered) | symlinked to `~/.omp/agent/config.yml` |
| `models.yml.tpl` | omp models template (envsubst source) | rendered → `models.yml` at shell startup |
| `config.yml.tpl` | omp config template (envsubst source) | rendered → `config.yml` at shell startup |
| `.mcp.json` | MCP server config for pi | symlinked to `~/.pi/agent/.mcp.json` |
| `themes/` | pi color themes | symlinked to `~/.pi/agent/themes/` |

## Template Rendering

`models.yml` and `config.yml` are rendered from their `.tpl` counterparts via `envsubst` at shell startup (sourced from `~/git/bashrc/.bash_aliases`). The templates interpolate `OMLX_BASE_URL` and `OMLX_API_KEY` from `.env`.

`.yml` files are gitignored — only the `.tpl` sources are tracked. Edit the `.tpl` files, not the rendered output.

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
ln -sf $(pwd)/.mcp.json ~/.pi/agent/.mcp.json
ln -sf $(pwd)/themes ~/.pi/agent/themes
```

## Context7

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

### Libraries

- badlogic/pi-mono
- can1357/oh-my-pi
- jdx/mise
- websites/pi_dev

## Key Constraints

- `models.yml` / `config.yml` must not be committed (gitignored). Only edit their `.tpl` sources.
- `models.json` uses env var names as `apiKey` values — do not substitute literal keys.
- oMLX must be running on `http://127.0.0.1:8000` before launching either agent.
- Active model is `Qwen3.6-35B-A3B-bf16` (Studio, 128GB) / `Qwen3.6-35B-A3B-MLX-8bit` (MBP, 64GB). Both IDs are listed in `models.json` and `models.yml.tpl`; `defaultModel` in `settings.json` must be set to the locally-loaded quant.
- See `docs/omlx-agentic-coding.md` for hardware tuning, model profiles, SpecPrefill config, and thinking controls.
