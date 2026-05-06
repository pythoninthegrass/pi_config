# pi Extensions

Pi loads TypeScript extensions from `~/.pi/agent/extensions/` at startup (via [jiti](https://github.com/unjs/jiti) — no compile step). This repo ships its extensions in `extensions/`, symlinked into that directory.

---

## Current Extensions

### `rtk-rewrite.ts`

Intercepts every bash tool call the model issues and rewrites it to its [rtk](https://github.com/rtk-ai/rtk) equivalent before execution. rtk filters and compresses command output, reducing the tokens fed back into context by 30–90% on verbose commands (`git log`, `ls -laR`, `pnpm ls`, etc.).

**How it works**

```text
model issues bash("git log --oneline -20")
  → hook calls `rtk rewrite "git log --oneline -20"`
  → rtk exits 3, stdout = "rtk git log --oneline -20"
  → hook patches event.input.command
  → pi executes "rtk git log --oneline -20"
  → filtered output reaches context (~90% fewer tokens)
```

**Fail-open guarantees**

| Condition | Behaviour |
|---|---|
| rtk has no equivalent for the command | stdout is empty, command runs unchanged |
| rtk binary missing or on PATH | `result.error` is set, command runs unchanged |
| rtk hangs past 2s | `spawnSync` timeout, command runs unchanged |

**Exit code note**: rtk 0.38.0 exits **3** (not 0) on a successful rewrite, despite the help text saying 0. The hook checks `result.stdout` rather than exit code, so it is insensitive to this discrepancy.

**Excluding commands from rewrite**

Add entries to `~/.config/rtk/config.toml`:

```toml
[hooks]
exclude_commands = ["git rebase", "git cherry-pick"]
```

rtk exits 1 with empty stdout for excluded commands; the hook leaves them unchanged.

---

## Writing a New Extension

Place a `.ts` file in `extensions/`. Pi auto-discovers `~/.pi/agent/extensions/*.ts`.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    // event.input.command is mutable — mutate to rewrite, return { block, reason } to block
  });
}
```

Test without symlinking:

```bash
pi -e extensions/my-extension.ts -p "your test prompt"
```

Available events: `tool_call`, `tool_result`, `session_start`, `user_bash`. See [pi extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) for the full API.

---

## Benchmarking

See [docs/rtk-benchmark.md](rtk-benchmark.md) for exact before/after steps measuring token reduction from `rtk-rewrite.ts`.
