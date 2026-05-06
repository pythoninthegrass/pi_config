# rtk Benchmark: Before vs After

Measures input-token reduction from `extensions/rtk-rewrite.ts` against oMLX server logs and rtk's own accounting.

---

## Setup

These must be true before running either leg:

- oMLX is running on `http://127.0.0.1:8000` with the model loaded and pinned
- `source .env` has been run (or shell startup has set `OMLX_API_KEY`, `OMLX_BASE_URL`)

Verify:

```bash
curl -s http://127.0.0.1:8000/v1/models \
  -H "Authorization: Bearer $OMLX_API_KEY" | python3 -m json.tool | grep '"id"'
```

---

## Caching Caveat

oMLX prefix-caches KV blocks and SpecPrefill fires above 8,192 context tokens. Cache hits make repeated identical prompts look nearly free — contaminating a before/after run that reuses the same prompt.

Mitigations used below:

- **Use different prompts** for baseline (A) and rtk-active (B). Prevents any shared KV prefix.
- **Single run per prompt per leg.** No warm-up run.
- **Check for cache hits** in the log before trusting numbers (see Verification step).

---

## Leg A — Baseline (no rtk)

### 1. Remove the extension symlink

```bash
rm ~/.pi/agent/extensions
```

Confirm it's gone:

```bash
ls ~/.pi/agent/extensions 2>&1   # expect: No such file or directory
```

### 2. Mark the log position

```bash
wc -l ~/.omlx/logs/server.log > /tmp/bench-A-log-start.txt
cat /tmp/bench-A-log-start.txt
```

### 3. Mark rtk gain baseline

```bash
rtk gain 2>&1 | tee /tmp/bench-rtk-before.txt
```

### 4. Run the benchmark prompts

Run each prompt in a fresh pi session (`-p` is non-interactive). Wait for full completion before starting the next.

```bash
time pi -p "Run git log --oneline -30 and list every commit message" \
  2>&1 | tee /tmp/bench-A-p1.log

time pi -p "Run ls -laR themes docs and report the five largest files with sizes" \
  2>&1 | tee /tmp/bench-A-p2.log

time pi -p "Run git diff HEAD~5 HEAD and summarize every changed file" \
  2>&1 | tee /tmp/bench-A-p3.log
```

### 5. Capture log lines for leg A

```bash
START=$(cat /tmp/bench-A-log-start.txt | awk '{print $1}')
tail -n +"$START" ~/.omlx/logs/server.log | \
  grep -E "prompt_tokens|completion_tokens|cached_tokens|SpecPrefill" \
  > /tmp/bench-A-tokens.log
cat /tmp/bench-A-tokens.log
```

---

## Leg B — rtk active

### 1. Restore the extension symlink

```bash
ln -sf ~/git/pi_config/extensions ~/.pi/agent/extensions
ls -la ~/.pi/agent/extensions   # confirm symlink points to repo
```

### 2. Spot-check the rewrite is live

```bash
rtk rewrite "git log --oneline -30"
# expect output: rtk git log --oneline -30 (exit 3)
```

### 3. Mark the log position

```bash
wc -l ~/.omlx/logs/server.log > /tmp/bench-B-log-start.txt
cat /tmp/bench-B-log-start.txt
```

### 4. Run the benchmark prompts (different wording = different KV prefix)

```bash
time pi -p "Show me git log --oneline for the last 30 commits and describe each one" \
  2>&1 | tee /tmp/bench-B-p1.log

time pi -p "List all files under themes and docs recursively with sizes and identify the largest five" \
  2>&1 | tee /tmp/bench-B-p2.log

time pi -p "Diff the last 5 commits against HEAD and explain what changed in each file" \
  2>&1 | tee /tmp/bench-B-p3.log
```

### 5. Capture log lines for leg B

```bash
START=$(cat /tmp/bench-B-log-start.txt | awk '{print $1}')
tail -n +"$START" ~/.omlx/logs/server.log | \
  grep -E "prompt_tokens|completion_tokens|cached_tokens|SpecPrefill" \
  > /tmp/bench-B-tokens.log
cat /tmp/bench-B-tokens.log
```

---

## Results

### rtk accounting (simplest signal)

```bash
rtk gain 2>&1 | tee /tmp/bench-rtk-after.txt
diff /tmp/bench-rtk-before.txt /tmp/bench-rtk-after.txt
```

Lines added to the "after" file represent savings attributed to leg B.

### Token counts from oMLX logs

```bash
echo "=== Leg A ===" && cat /tmp/bench-A-tokens.log
echo "=== Leg B ===" && cat /tmp/bench-B-tokens.log
```

Compare `prompt_tokens` across equivalent turns. Leg B prompt_tokens on turn 2+ (where tool output has been fed back into context) should be lower than leg A's equivalent turns.

### Wall-clock comparison

```bash
grep real /tmp/bench-A-p{1,2,3}.log
grep real /tmp/bench-B-p{1,2,3}.log
```

The hook adds one `spawnSync("rtk", ["rewrite", ...])` per bash call (~10–50ms). Any regression larger than that warrants investigation.

---

## Verification Checks

**Cache hit check.** If leg B shows `cached_tokens` that account for most of `prompt_tokens`, the cache mitigation failed — the KV prefix still matched. Discard that prompt's numbers and re-run with a more distinct prompt.

```bash
grep "cached_tokens" /tmp/bench-B-tokens.log
```

**Rewrite confirmation.** rtk only rewrites commands it recognises. Check which bench commands actually got rewritten:

```bash
rtk rewrite "git log --oneline -30"
rtk rewrite "ls -laR themes docs"
rtk rewrite "git diff HEAD~5 HEAD"
```

If any exits 1 (no output), rtk has no equivalent for that command and leg B won't show savings for it — expected, not a bug.

**SpecPrefill check.** If SpecPrefill fires it skews latency (not token counts). Verify it didn't fire during the benchmark:

```bash
grep "SpecPrefill" /tmp/bench-A-tokens.log /tmp/bench-B-tokens.log
```

SpecPrefill threshold is 8,192 tokens. Short agentic sessions on this repo shouldn't cross it.

---

## Success Criteria

| Signal | Target |
|---|---|
| `prompt_tokens` on turns after first tool result | Lower in leg B |
| Wall-clock time delta | < 200ms per prompt (hook overhead only) |
| `rtk gain` delta | Non-zero savings reported |
| SpecPrefill lines in bench logs | None (didn't fire) |
| `cached_tokens` share of prompt_tokens | < 10% (cache didn't dominate) |
