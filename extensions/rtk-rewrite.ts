import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawnSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  // rtk's output condensing starves weak local models: the terse result (e.g.
  // `pytest -v` -> ~48-char "Pytest: 1 passed") gives the model nothing to act
  // on, so it re-issues the identical command -> agentic-loop livelock. Verified
  // by A/B against qwen3-coder-next on koboldcpp (see AGENTS.md "Tool Calling &
  // a Known Livelock"). Disabled by default for this local-model setup; opt back
  // in with PI_RTK_REWRITE=1 when driving a strong cloud model that tolerates
  // condensed tool output.
  if (process.env.PI_RTK_REWRITE !== "1") return;

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const cmd = event.input.command;
    if (typeof cmd !== "string" || cmd.length === 0) return;

    // spawnSync never throws; result.error signals a system failure (rtk missing, timeout)
    const result = spawnSync("rtk", ["rewrite", cmd], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.error) return; // fail-open: rtk unavailable

    const rewritten = result.stdout.trim();
    if (rewritten) event.input.command = rewritten;
  });
}
