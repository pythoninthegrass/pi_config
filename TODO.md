# TODO.md

## Qwen model setup (from RTX 6000 Blackwell thread)

- [ ] Bake-off Qwen3.5-122B-A10B (`unsloth` `UD-Q4_K_XL`, GGUF) vs. Qwen3-Coder-Next on real
      coding tasks; if it wins, add a `docker/qwen3.5-122b-a10b/` stack in `wsl_setup` and switch default.
- [ ] Reinforce anti-laziness guardrails in pi prompts (no disabling lint rules, no weakening
      tests to pass) — Qwen3-Coder-Next is confirmed lazy on the same hardware.
- [ ] Tune idle ~24GB VRAM: F16 KV vs. `--quantkv 1`, or Q8_0, or a resident draft/embedding model.
- [ ] Re-test newer KoboldCpp (>v1.113.2) tool/jinja parsing — may shrink/retire `proxy_rewrite.ts`.

See [qwen.md](docs/qwen.md)

## RTK benchmarking

Leg A needs to happen now — remove the symlink, run the three prompts, capture the log lines — before anything else generates sessions with the extension active.

See [rtk-benchmark.md](docs/rtk-benchmark.md#caching-caveat)

Leg A results (studio):

```bash
 lance@studio:…/pi_config on  main [?] 
λ cat /tmp/bench-A-tokens.log
2026-05-06 00:29:07,198 - omlx.scheduler - INFO - [-] - SpecPrefill: draft model set with SSD cache (model_name=/Users/lance/.omlx/models/Qwen3.5-0.8B-MLX-4bit)
2026-05-06 00:29:07,198 - omlx.engine.vlm - INFO - [-] - SpecPrefill: draft model loaded (/Users/lance/.omlx/models/Qwen3.5-0.8B-MLX-4bit)
2026-05-06 00:29:29,038 - omlx.scheduler - INFO - [-] - SpecPrefill: draft model set with SSD cache (model_name=/Users/lance/.omlx/models/Qwen3.5-0.8B-MLX-4bit)
2026-05-06 00:29:29,038 - omlx.engine.vlm - INFO - [-] - SpecPrefill: draft model loaded (/Users/lance/.omlx/models/Qwen3.5-0.8B-MLX-4bit)
```

Move onto [Leg B — rtk active](docs/rtk-benchmark.md#leg-b--rtk-active)
