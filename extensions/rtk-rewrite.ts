import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawnSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
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
