# pi_config

Configuration for [pi](https://pi.dev/docs/latest) and [omp](https://pi.dev/docs/latest) coding agents backed by a local [oMLX](https://github.com/jundot/omlx) inference server on Apple Silicon.

## Requirements

- macOS on Apple Silicon (M-series) with 64+ GB RAM
- [oMLX](https://github.com/jundot/omlx) running locally on port 8000
- [mise](https://mise.jdx.dev) for runtime management (`brew install mise`)
- `OMLX_BASE_URL` and `OMLX_API_KEY` set in `~/git/pi_config/.env`
- `envsubst` available (ships with `gettext`: `brew install gettext`)
- `~/git/bashrc/.bash_aliases` sourced in your shell (renders templates at startup)

## Quickstart

```bash
# 1. Clone this repo
git clone <repo-url>
cd pi_config

# 2. Create .env with your oMLX credentials
cat > ~/git/pi_config/.env <<EOF
OMLX_BASE_URL=http://127.0.0.1:8000
OMLX_API_KEY=<your-api-key>
EOF

# 3. Install pi and omp
npm install -g @pi-dev/pi
mise use -g github:can1357/oh-my-pi@14.7.0

# 4. Symlink configs
mkdir -p ~/.omp/agent ~/.pi/agent
ln -sf $(pwd)/models.yml ~/.omp/agent/models.yml
ln -sf $(pwd)/config.yml ~/.omp/agent/config.yml
ln -sf $(pwd)/settings.json ~/.pi/agent/settings.json
ln -sf $(pwd)/.mcp.json ~/.pi/agent/.mcp.json

# 5. Add the .bash_aliases block (renders templates and exports env vars at shell startup)
#    See docs/omlx-agentic-coding.md for the exact block to add

# 6. Open a new shell, then launch
pi      # pi coding agent
omp     # oh-my-pi
```

## Testing

```bash
# Verify oMLX is reachable and model is loaded
source ~/git/pi_config/.env
curl -s http://127.0.0.1:8000/v1/models \
  -H "Authorization: Bearer $OMLX_API_KEY" | python3 -m json.tool

# Benchmark pi
time pi -p "Write a fibonacci sequence in go in /tmp"

# Benchmark omp
time omp -p "Write a fibonacci sequence in go in /tmp"

# Check oMLX logs for cache and SpecPrefill stats
grep -E "SpecPrefill|cached" ~/.omlx/logs/server.log | tail -10
```

Expected results on M4 Max 64GB with `Qwen3.6-35B-A3B-MLX-8bit`:

| Agent | Time | Notes |
|---|---|---|
| pi | ~16s | Minimal system prompt; tool calls dominate |
| omp | ~19–25s | SpecPrefill on large system prompt adds ~10s |

## URLs

- [pi docs](https://pi.dev/docs/latest): preferred agent; smaller system prompt, faster on local models
- [pi providers](https://pi.dev/docs/latest/providers)
- [pi custom models](https://pi.dev/docs/latest/models)
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter): bridges MCP servers to pi's tool interface
- [omp / oh-my-pi](https://github.com/can1357/oh-my-pi): same codebase as pi; heavier default system prompt
- [oMLX](https://github.com/jundot/omlx): local inference server for Apple Silicon
- [oMLX agentic coding guide](docs/omlx-agentic-coding.md): hardware tuning, model profiles, agent config
