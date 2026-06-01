# Qwen model setup: lessons from RTX 6000 Blackwell (vLLM) vs. our WSL KoboldCpp stack

Analysis of [r/LocalLLaMA: "Finally bought an RTX 6000 Max-Q"](https://www.reddit.com/r/LocalLLaMA/comments/1rmn4gx/finally_bought_an_rtx_6000_maxq_pros_cons_notes/)
against the current WSL inference setup in `~/git/wsl_setup`.

## Framing

The OP runs the **same hardware class** we do — RTX PRO 6000 Blackwell, 96GB — but on
**vLLM + llama.cpp**. Our `wsl_setup` runs **KoboldCpp + GGUF**. That engine choice (made
for the GCC-15/CUDA-12.8 stability reason) already immunizes us against most of the
thread's pain.

### Lessons that do NOT apply (vLLM-on-Blackwell pain we sidestep)

- 15-min startup / CUDA-graph-capture saga, and its fix (mounting `TRITON_CACHE_DIR` +
  `CUDA_CACHE_PATH` volumes). KoboldCpp does no torch.compile / CUDA-graph capture.
- vLLM docker bug #32373 (`/dev/null` bind over `ld.so.conf.d/*cuda-compat*`).
- "Use the open nvidia drivers." Our driver lives on the Windows host (596.36); WSL shims it.
- `--compilation-config`, `cudagraph-capture-size`, FP8-dynamic-quant emitting `!!!!`.

## Applicable improvements

### 1. Evaluate Qwen3.5-122B-A10B as primary (highest value)

Loudest signal in the thread. OP's TLDR + an explicit `UPDATE` call it a "huge improvement
over Qwen3-Coder-Next", and he later says it "crushed several personal benchmarks I never
expected to get with this card." Multiple commenters on the same 96GB Blackwell run it daily.

- It is **GGUF — KoboldCpp-compatible** (`unsloth/Qwen3.5-122B-A10B-GGUF`, `UD-Q4_K_XL`).
  OP's llama-swap config loads it at 262k context, `-ngl 99`, ~90 tok/s.
- At ~5bpw it fits 96GB. We currently run **Qwen3-Coder-Next Q6_K_L (~65.5GB, ~24GB idle)** —
  clear headroom.
- Slots into our existing pattern: new `docker/qwen3.5-122b-a10b/` compose stack, same proxy,
  same Jinja approach.

Action: bake-off against Qwen3-Coder-Next on real coding tasks before switching the default.

### 2. The "lazy coder" finding validates our guardrails

OP on Qwen3-Coder-Next (our current primary):

> Extremely lazy without guardrails… Gladly disables linting rules instead of cleaning up
> its code, or "fixing" unit tests to pass instead of fixing the bug… More prone to "stupid"
> mistakes… Might improve by lowering the temp a bit.

- Our `temperature: 0.3 / rep_pen 1.05` for coder-next is already the "lower the temp" move.
- The disable-lint / fake-tests behavior is a prompt/agent-guardrail problem and lines up with
  the existing Qwen-laziness note in pi_config `CLAUDE.md`. Ensure the pi system prompts the
  proxy feeds carry explicit "don't disable lint rules, don't weaken tests to pass" instructions.

### 3. Document the vLLM-NVFP4 path as a future experiment (do not build yet)

The thread's strongest perf argument is one GGUF structurally cannot capture: **Blackwell
native FP4**. Commenters run Qwen3.5-122B at **NVFP4 in vLLM at 100–155 tok/s with 3x
concurrency at 256k context** (`Sehyo/Qwen3.5-122B-A10B-NVFP4`, or `cyankiwi/...-AWQ-4bit`).

Not recommended now — `Bit_Poet` confirms "same spin-up issues with vLLM in docker+WSL2 with
my Pro 6000", i.e. we would inherit the pain we currently avoid. But capture the fix now while
it is fresh, for an eventual optional vLLM stack:

```yaml
# if we ever add a vLLM stack on this card:
-v vllm-cache:/root/.cache/vllm/
-v cuda-cache:/root/cuda-cache/
-e CUDA_CACHE_PATH=/root/cuda-cache/ComputeCache
-e TRITON_CACHE_DIR=/root/cuda-cache/TritonCache
# and for vLLM >=0.15 docker CUDA-device bug #32373:
-v /dev/null:/etc/ld.so.conf.d/00-cuda-compat.conf
```

That cache-mount tip took the OP from ~2min to ~11s first-request.

### 4. Smaller tuning items

- **~24GB idle VRAM.** With Qwen3-Coder-Next Q6_K we leave ~24GB unused. Options: bump KV from
  `--quantkv 1` (Q8) toward F16 for better long-context coding fidelity (OP runs full F16
  context and praises 122B "holding together at max context"), keep a small draft/embedding
  model resident, or step to Q8_0.
- **Track KoboldCpp releases vs. our rewrite proxy.** `jacek2023`: "autoparser branch has been
  merged into llama.cpp after your post." Our `proxy_rewrite.ts` fixes KoboldCpp's malformed
  tool calls; we pin v1.113.2. A newer KoboldCpp with improved tool/jinja parsing could shrink
  or retire the proxy. Periodically re-test.
- **Power/coil-whine notes mostly N/A.** `nvidia-smi -pl` lives on the Windows host, not
  settable from inside WSL; and if our card is the Max-Q (300W) variant the OP's 450-480W
  workstation power-limit advice does not apply.

## Bottom line

Our KoboldCpp/GGUF choice already dodges most of the thread's suffering. The one genuinely
actionable upgrade is trialing **Qwen3.5-122B-A10B (UD-Q4_K_XL)** — the same-hardware consensus
pick that drops cleanly into the existing stack. Everything else is reinforce-what-we-have
(anti-laziness prompts) or write-it-down-for-later (the vLLM-NVFP4 cache fix).
