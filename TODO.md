# TODO.md

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
