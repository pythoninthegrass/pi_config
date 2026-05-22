# pi_config

Configuration for [pi](https://pi.dev/docs/latest) and [omp](https://pi.dev/docs/latest) coding agents backed by a local [oMLX](https://github.com/jundot/omlx) inference server on Apple Silicon, or koboldcpp on WSL.

See **[docs/setup.md](docs/setup.md)** for full installation instructions on macOS and Ubuntu/WSL.

## Quickstart

```bash
# 1. Clone and symlink
git clone https://github.com/pythoninthegrass/pi_config.git ~/git/pi_config
cd ~/git/pi_config
mkdir -p ~/.pi/agent
ln -sf $(pwd)/models.json ~/.pi/agent/models.json
ln -sf $(pwd)/settings.json ~/.pi/agent/settings.json
ln -sf $(pwd)/.mcp.json ~/.pi/agent/.mcp.json
ln -sf $(pwd)/themes ~/.pi/agent/themes
ln -sf $(pwd)/extensions ~/.pi/agent/extensions

# 2. Configure .env (see .env.example)
cp .env.example .env && $EDITOR .env

# 3. Render settings and launch
source ~/git/bashrc/.bashrc && pi
```

## Testing

```bash
# Verify oMLX is reachable and model is loaded
source .env
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
- [rtk](https://github.com/rtk-ai/rtk): CLI proxy that filters/summarizes command output; wired into pi via `extensions/rtk-rewrite.ts`
