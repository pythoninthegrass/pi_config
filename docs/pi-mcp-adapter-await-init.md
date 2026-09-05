# pi-mcp-adapter session_start await-init patch

## Problem

`pi` talking to `qwen3.8-flash-next:builder` showed a very slow first response
that then sped up dramatically on later turns. Server-side ground truth
(`llama-server`'s own `slot print_timing`, and the Aperture console) showed
prompt caching working correctly — the cost was entirely a *cold* ~32k-token
prefill on the first turn. Investigating why pi's baseline prompt was ~32k
(and why it swung so much across sessions) turned up a race in
`pi-mcp-adapter`, the npm package (not tracked in this repo — see below) that
registers pi's MCP tool servers.

Real session logs (`~/.pi/agent/sessions/.../*.jsonl`, first-turn
`usage.input + usage.cacheRead`) in the *same cwd with the same config*
showed baselines of 15,532 / 32,879 / 32,192 / 33,043 tokens — a ~17k swing.
That gap matches the MCP tool-schema JSON total almost exactly (~59 KB ≈
16,900 tokens, measured from `~/.pi/agent/mcp-cache.json`).

## Root cause

`pi-mcp-adapter/index.ts`'s `session_start` handler kicks off MCP tool
registration (`startInitialization`) but only `await`s it when specific
env-configured direct-tool servers are missing — otherwise it returns
immediately. The `input` handler has its own bounded wait
(`awaitWithTimeout(initPromise, INIT_WAIT_TIMEOUT_MS)`, 30s), but whichever
event — session start finishing vs. the first input arriving — wins the race
determines what tool set attaches to the very first outbound request. Losing
the race means the first request goes out mid-registration with a smaller
(or larger, or different) tool set than steady state, and pays for it as
tokens that can never be cache-hit later.

## Fix

Make `session_start` unconditionally await initialization (bounded by the
same 30s timeout already used elsewhere in the file), instead of only
awaiting in the narrow missing-direct-tools case:

```diff
     const initialization = startInitialization(ctx, owner, oauthRuntime, generation, "stale_session_start");
-    if (envRaw !== undefined && envRaw !== "__none__") {
-      const missingEnvDirectTools = getMissingConfiguredDirectToolServers(
-        earlyConfig,
-        loadMetadataCache(),
-        envDirectToolOverride,
-      );
-      if (missingEnvDirectTools.length > 0) {
-        await initialization;
-      }
-    }
+    await awaitWithTimeout(initialization, INIT_WAIT_TIMEOUT_MS);
   });
```

`startInitialization`'s returned promise already swallows its own errors
internally (never rejects), so this can't turn an init failure into an
unhandled rejection. Bounding it at `INIT_WAIT_TIMEOUT_MS` (rather than an
unbounded `await`) avoids pi's startup hanging indefinitely if MCP init gets
stuck (e.g. a stalled OAuth flow).

## Why this isn't a normal repo patch

`pi-mcp-adapter` is a globally-installed npm package that `pi` manages
itself — resolved directly from source at
`~/.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts` (its `.` export
points straight at `index.ts`; pi runs it under Node's native TS
type-stripping, no build step). It is not git-tracked, and `pi`'s own
updater can silently overwrite this file on the next `pi-mcp-adapter`
version bump.

`scripts/patch_pi_mcp_adapter.py` re-applies the fix idempotently: it's
wired into `~/git/bashrc/.bash_aliases`'s existing pi_config render block
(same place that regenerates `settings.json`/`.mcp.json`/etc. from `.tpl`
sources at shell login), so every new shell re-checks and re-applies it if
needed. It intentionally does **not** overwrite with a frozen copy of
`index.ts` — it matches the exact pre-patch block against whatever is
currently installed and only rewrites that block, so an unrelated update
to a sibling file (`direct-tools.ts`, `types.ts`, etc.) can't be clobbered.
If the expected pre-patch shape no longer matches (i.e. `pi-mcp-adapter`
changed this code path), it prints a warning to stderr and does nothing —
the fix needs to be re-derived by hand against whatever the new code looks
like at that point.
