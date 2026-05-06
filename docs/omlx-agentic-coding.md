# oMLX Agentic Coding on Apple Silicon

Setup guide for running local LLMs via [oMLX](https://github.com/jundot/omlx) for agentic coding workloads. Covers global server config, per-model tuning, thinking controls, and agent integration (pi, opencode).

---

## Hardware Reference

| Setting | M4 Max 64GB | M4 Max 128GB | Notes |
|---|---|---|---|
| Max Model Memory | model size + 10% | model size + 10% | Headroom for runtime overhead |
| Max Process Memory | 85% | 85% | Leaves room for OS and concurrent processes |
| Hot Cache (in-memory) | 8GB | 12GB | Scale with available memory after model load |
| Cold Cache (SSD) | 4GB | 8GB | Persistent KV blocks across sessions |
| Max Concurrent Requests | 2–3 | 4–6 | Single-user agentic: favour latency over throughput |
| Max Tokens (global default) | 8192 | 8192 | Generation limit — not a context window value |
| Cache Enabled | ON | ON | |
| Memory Guard | ON | ON | Prevents Metal allocation failures |

Set **Max Context Window** to match your model's native context length. The global default (131072) will silently reject prompts from agents that send large file contexts.

---

## Model Profiles

### Current Models

| Model | Size (8bit) | Size (bf16) | Arch | Thinking | SpecPrefill | Context |
|---|---|---|---|---|---|---|
| `Qwen3.6-35B-A3B-MLX-8bit` | ~37GB | ~70GB | MoE | ✓ | ✓ (MoE) | 262144 |
| `gemma-4-31B-it-MLX-8bit` | ~35GB | ~70GB | Dense/VLM | ✓ | check | 131072 |
| `gemma-4-26b-a4b-it-4bit` | ~16GB | — | Dense/VLM | ✓ | check | 131072 |

**64GB constraint:** bf16 (~70GB) does not fit. Use 8bit. On 128GB, bf16 fits and is preferred for dedicated coding machines.

---

### Qwen3.6-35B-A3B

**Draft model for SpecPrefill:** `mlx-community/Qwen3.5-0.8B-4bit` (~400MB)
Qwen3.6 has no small variants (only 27B dense and 35B-A3B MoE exist). Qwen3.5-0.8B shares the tokenizer lineage.

#### Basic Settings

| Setting | Value | Confirmed | Notes |
|---|---|---|---|
| Model Type | LLM | ✓ | Override auto-detect — misidentifies as VLM |
| CTX Window | 262144 | ✓ | Native context length |
| Max Tokens | 8192 | ✓ | Cap generation; 16384 if long file outputs needed |
| TTL | Pinned | ✓ | Keep loaded permanently |
| Trust Remote Code | ON | ✓ | Required; available from oMLX v0.3.8+ |

#### Sampling

| Parameter | Thinking ON | Thinking OFF | Source |
|---|---|---|---|
| Temperature | 0.6 | 0.7 | Qwen3 official |
| Top P | 0.95 | 0.8 | Qwen3 official |
| Top K | 0 (disabled) | 20 | Qwen3 official |
| Min P | 0.0 | 0.0 | |
| Presence Penalty | 1.0 | 1.5 | Higher when not thinking; unsloth recommendation |
| Repetition Penalty | 1.0 | 1.0 | Neutral |

Set model-level defaults to the **Thinking OFF** row.

#### Chat Template Kwargs

```json
{"enable_thinking": false, "preserve_thinking": true}
```

`preserve_thinking` retains reasoning context across turns even when thinking is off by default.

> `thinking_default: true` will still appear in `/v1/models/status` — this is the model's architectural capability, not the active inference state. The chat template kwargs override applies at inference time.

#### Advanced

| Setting | Value | Notes |
|---|---|---|
| TurboQuant KV Cache | ON | |
| Bits Per Channel | 8-bit | Lower only if under cache pressure |
| SpecPrefill | ON | MoE architecture — highest benefit |
| SpecPrefill Draft Model | `Qwen3.5-0.8B-4bit` | Must be in model-dir |
| Keep Rate | 30% | Paper baseline 20%; 30% for code accuracy |
| Threshold Tokens | 8192 | SpecPrefill activates above this prompt length |
| DFlash | OFF | No checkpoint available for this model |

---

### Gemma 4 31B

#### Basic Settings

| Setting | Value | Notes |
|---|---|---|
| Model Type | VLM | Correct — Gemma 4 has vision capability |
| CTX Window | 131072 | Native context length |
| Max Tokens | 8192 | |
| TTL | Pinned | If primary model |

#### Sampling

Gemma 4 uses different recommended parameters — update this section from the official model card when confirmed.

| Parameter | Value | Notes |
|---|---|---|
| Temperature | 1.0 | Gemma default; adjust per use case |
| Top P | 0.95 | |
| Top K | 64 | Gemma recommendation |
| Repetition Penalty | 1.0 | |

#### Advanced

| Setting | Value | Notes |
|---|---|---|
| TurboQuant KV Cache | ON | |
| Bits Per Channel | 8-bit | |
| SpecPrefill | TBD | Gemma 4 uses hybrid attention, not MoE — benefit unclear |
| DFlash | OFF | |

---

## Thinking

### How It Works in oMLX

oMLX applies `chat_template_kwargs` as a hard server-side override — Qwen3's `/think` and `/no_think` message tokens are ignored when `enable_thinking` is explicitly set.

oMLX also returns `reasoning_content` alongside `content` in `/v1/chat/completions` responses when thinking is enabled server-side. Clients that read this field (e.g. pi) will display the reasoning chain without needing the Anthropic Messages API.

### Per-Request Thinking via Anthropic Messages API

Confirmed working — use when you need on-demand thinking control independent of server settings:

```bash
curl -s http://localhost:8000/v1/messages \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<model-id>",
    "max_tokens": 2048,
    "messages": [{"role": "user", "content": "..."}],
    "thinking": {"type": "enabled", "budget_tokens": 4096}
  }' -o /tmp/response.json && python3 -c "
import json
with open('/tmp/response.json', 'r', errors='replace') as f:
    r = json.loads(f.read())
for block in r.get('content', []):
    print(block.get('type'), ':', (block.get('text') or block.get('thinking',''))[:200])
"
```

### Strategies

| Strategy | Chat Template Kwargs | Default | To override |
|---|---|---|---|
| Thinking off | `enable_thinking: false` | Fast, no reasoning | `/v1/messages` with `thinking` param |
| Thinking on | `enable_thinking: true` | Reasoning on every turn | `/v1/messages` with `thinking: disabled` |

For agentic coding, **thinking off** is recommended as the default — most tool calls (read file, apply edit, run test) don't benefit from reasoning. Reserve thinking for planning turns.

---

## Agent Config

### Tested Agents

| Agent | Endpoint | Thinking on demand | Notes |
|---|---|---|---|
| opencode | `/v1/chat/completions` | No | OpenAI-compatible only |
| pi | `/v1/chat/completions` | Via `shift+tab` | Reads `reasoning_content`; see below |
| omp | `/v1/chat/completions` | No | OpenAI-compatible only; large system prompt (~4,600 tokens) |

Confirmed via `~/.omlx/logs/server.log` — requests log as `Chat completion`, not `Anthropic message`.

### pi

pi renders `reasoning_content` from oMLX's `/v1/chat/completions` responses as thinking blocks — no Anthropic Messages API required for thinking display.

**Keybindings:**

- `shift+tab` — cycle thinking level: `off → minimal → low → medium → high → xhigh`
- `ctrl+p` / `shift+ctrl+p` — cycle models (overwrites `settings.json` — avoid if you want a stable default)
- `ctrl+l` — model picker

**`~/.pi/agent/settings.json`**
```json
{
  "defaultProvider": "omlx",
  "defaultModel": "<model-id>",
  "defaultThinkingLevel": "off",
  "compaction": { "enabled": true },
  "warnings": { "anthropicExtraUsage": false }
}
```

**`~/.pi/agent/models.json`** (symlink to `~/git/pi_config/models.json`) — two providers: fast (OpenAI completions) and thinking-capable (Anthropic Messages API):

`apiKey` accepts an env var name; pi resolves it at runtime from the environment.

```json
{
  "providers": {
    "omlx": {
      "baseUrl": "http://127.0.0.1:8000/v1",
      "api": "openai-completions",
      "apiKey": "OMLX_API_KEY",
      "authHeader": true,
      "models": [
        {
          "id": "Qwen3.6-35B-A3B-MLX-8bit",
          "name": "Qwen3.6 35B (fast)",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 8192
        }
      ]
    },
    "omlx-thinking": {
      "baseUrl": "http://127.0.0.1:8000",
      "api": "anthropic-messages",
      "apiKey": "OMLX_API_KEY",
      "authHeader": true,
      "compat": { "supportsEagerToolInputStreaming": false },
      "models": [
        {
          "id": "Qwen3.6-35B-A3B-MLX-8bit",
          "name": "Qwen3.6 35B (thinking)",
          "reasoning": true,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 8192
        }
      ]
    }
  }
}
```

`omlx-thinking` is only needed for per-request thinking control via `/v1/messages`. For always-on or always-off thinking, `omlx` (fast) + server-side `chat_template_kwargs` is sufficient.

**Launch without omlx-cli wrapper:** pi reads `models.json` directly — run `pi` from any directory. `omlx-cli launch pi` is a first-time setup convenience only.

---

### omp

omp (oh-my-pi) uses `models.yml` for provider config and `config.yml` for settings, both in `~/.omp/agent/`. Config is managed via templates in `~/git/pi_config/` rendered by `envsubst` at shell startup.

**`~/.omp/agent/models.yml`** (symlink to `~/git/pi_config/models.yml`):

```yaml
providers:
  omlx:
    baseUrl: http://127.0.0.1:8000/v1
    api: openai-completions
    auth: none
    headers:
      Authorization: Bearer <api-key>
    discovery:
      type: llama.cpp
    models:
      - id: Qwen3.6-35B-A3B-MLX-8bit
        contextWindow: 262144
        maxTokens: 8192
      # add other models with correct contextWindow here

  omlx-thinking:
    baseUrl: http://127.0.0.1:8000
    api: anthropic-messages
    apiKey: <api-key>
    compat:
      supportsEagerToolInputStreaming: false
    models:
      - id: Qwen3.6-35B-A3B-MLX-8bit
        name: Qwen3.6 35B (thinking)
        reasoning: true
        input: [text]
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        contextWindow: 262144
        maxTokens: 8192
```

**`~/.omp/agent/config.yml`** (symlink to `~/git/pi_config/config.yml`):

```yaml
defaultProvider: omlx
defaultModel: Qwen3.6-35B-A3B-MLX-8bit
defaultThinkingLevel: off
compaction:
  enabled: true
warnings:
  anthropicExtraUsage: false
```

**Key notes:**

- `auth: none` + explicit `Authorization: Bearer` header — omp's `apiKey`/`authHeader` pattern does not resolve env var names for custom providers
- `omlx-thinking` uses `apiKey: <literal>` — omp sends it as `x-api-key`, which omlx expects on the Anthropic Messages endpoint
- `discovery.type: llama.cpp` — reads `/v1/models` in OpenAI shape; discovered models default to `contextWindow: 128000`, override per model in the `models` array
- `defaultThinkingLevel: off` — omp's default is `medium`, which adds significant latency on every request
- omp caches discovered models in `~/.omp/agent/models.db` (SQLite); `contextWindow` overrides in `models.yml` apply on next cache refresh

**Model selection:** omp does not always respect `defaultModel` in non-interactive (`-p`) mode without `--model`. Use a shell function wrapper:

```bash
omp() { command omp --model "${OMP_MODEL:-Qwen3.6-35B-A3B-MLX-8bit}" "$@"; }
```

**Keybindings:**

- `shift+tab` — cycle thinking level
- `ctrl+p` / `shift+ctrl+p` — cycle models
- `ctrl+l` — model picker

---

## Performance Benchmarks

Tested on M4 Max 64GB, `Qwen3.6-35B-A3B-MLX-8bit`, prompt: `"Write a fibonacci sequence in go in /tmp"`.

| Agent | Run 1 | Run 2 | Notes |
|---|---|---|---|
| pi | ~16s | ~16s | No SpecPrefill; system prompt ~23 tokens; tool calls dominate |
| omp | ~25s | ~19s | SpecPrefill on ~26k conv tokens; 10s sparse prefill per request |

**Why omp is slower:** omp sends a ~4,600-token system prompt per request. With SpecPrefill threshold at 8,192 tokens, the full prompt (system + conv) triggers SpecPrefill scoring on every turn. The KV cache prefix (`cached: 2048`) does not grow between sessions because the system prompt varies slightly, breaking cache reuse.

**omp cache behaviour:** `draft cache hit` (SpecPrefill draft model cache) improves on repeated identical prompts within a session. Cross-session KV cache reuse is limited by system prompt variance.

---

```bash
# Model status — confirm loaded state, type, context window, max tokens
MODEL="<model-id>"
curl -s http://localhost:8000/v1/models/status \
  -H "Authorization: Bearer <api-key>" -o /tmp/omlx_status.json && python3 -c "
import json
with open('/tmp/omlx_status.json', 'r', errors='replace') as f:
    data = json.loads(f.read())
m = next((m for m in data['models'] if '$MODEL' in m['id']), None)
for k in ['loaded','pinned','model_type','engine_type','thinking_default','preserve_thinking_default','max_context_window','max_tokens']:
    print(f'  {k}: {m[k]}')
print()
print(f'  max_model_memory:     {data[\"max_model_memory\"] / 1e9:.1f} GB')
print(f'  current_model_memory: {data[\"current_model_memory\"] / 1e9:.1f} GB')
"
```

```bash
# Confirm thinking state — bare reply = thinking off; reasoning_content populated = thinking on
curl -s http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$MODEL\", \"messages\": [{\"role\": \"user\", \"content\": \"Reply with one word: hello\"}], \"max_tokens\": 512}" \
  -o /tmp/thinking_check.json && python3 -c "
import json
with open('/tmp/thinking_check.json', 'r', errors='replace') as f:
    r = json.loads(f.read())
msg = r['choices'][0]['message']
print('content:', msg.get('content'))
print('reasoning_content:', 'present' if msg.get('reasoning_content') else 'null')
"
```

```bash
# Confirm on-demand thinking via Anthropic Messages API
curl -s http://localhost:8000/v1/messages \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$MODEL\", \"max_tokens\": 256, \"messages\": [{\"role\": \"user\", \"content\": \"Reply with one word: hello\"}], \"thinking\": {\"type\": \"enabled\", \"budget_tokens\": 512}}" \
  -o /tmp/thinking_test.json && python3 -c "
import json
with open('/tmp/thinking_test.json', 'r', errors='replace') as f:
    r = json.loads(f.read())
for block in r.get('content', []):
    print(block.get('type'), ':', (block.get('text') or block.get('thinking',''))[:100])
"
```

---

## References

- [Qwen3.6 blog post](https://qwen.ai/blog?id=qwen3.6-35b-a3b)
- [Qwen3.6 GitHub](https://github.com/QwenLM/Qwen3.6)
- [walterra.dev setup article](https://walterra.dev/blog/2026-04-18-qwen36-35b-a3b-m4-max-pi-coding-agent)
- [SpecPrefill paper (ICML 2025)](https://arxiv.org/html/2502.02789v2)
- [pi providers docs](https://pi.dev/docs/latest/providers)
- [pi extensions API](https://pi.dev/docs/latest/extensions)
