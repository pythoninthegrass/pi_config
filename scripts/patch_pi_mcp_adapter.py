#!/usr/bin/env python3
"""Re-apply the pi-mcp-adapter session_start await-init fix.

pi-mcp-adapter is a globally-installed npm package pi manages itself (not
git-tracked), resolved directly from source at
~/.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts (no build step -- the
package's "." export points straight at index.ts and pi runs it under
Node's native TS type-stripping). Any pi-mcp-adapter version bump silently
reverts a direct edit to that file.

The bug: session_start starts MCP tool registration but only awaits it when
specific env-configured direct-tool servers are missing; otherwise it
returns immediately, racing the "input" event's own tool-registration wait.
Measured effect: pi's first-turn baseline prompt swung ~15.5k-33k tokens in
the same cwd/config depending on which side of the race won -- the gap
matches the MCP tool-schema JSON size almost exactly. See
docs/pi-mcp-adapter-await-init.md for the full investigation.

This script re-derives the patch against whatever is CURRENTLY installed
rather than overwriting with a frozen copy, so unrelated package updates
(to sibling files) aren't clobbered. If session_start no longer matches the
expected pre-patch shape, it warns instead of guessing.
"""
import pathlib
import sys

TARGET = pathlib.Path.home() / ".pi/agent/npm/node_modules/pi-mcp-adapter/index.ts"

OLD = '''    const initialization = startInitialization(ctx, owner, oauthRuntime, generation, "stale_session_start");
    if (envRaw !== undefined && envRaw !== "__none__") {
      const missingEnvDirectTools = getMissingConfiguredDirectToolServers(
        earlyConfig,
        loadMetadataCache(),
        envDirectToolOverride,
      );
      if (missingEnvDirectTools.length > 0) {
        await initialization;
      }
    }
  });'''

NEW = '''    const initialization = startInitialization(ctx, owner, oauthRuntime, generation, "stale_session_start");
    await awaitWithTimeout(initialization, INIT_WAIT_TIMEOUT_MS);
  });'''


def main() -> int:
    if not TARGET.is_file():
        # Not installed on this machine (or under a different path) -- nothing to do.
        return 0

    text = TARGET.read_text()

    if NEW in text:
        return 0  # already applied, quiet no-op

    count = text.count(OLD)
    if count != 1:
        print(
            f"pi-mcp-adapter: expected exactly 1 match of the pre-patch session_start "
            f"block, found {count} -- package structure changed since this patch was "
            f"written, NOT auto-patching. See docs/pi-mcp-adapter-await-init.md in "
            f"pi_config and re-derive the fix by hand.",
            file=sys.stderr,
        )
        return 0

    TARGET.write_text(text.replace(OLD, NEW, 1))
    print("pi-mcp-adapter: applied session_start await-init patch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
