{
  "lastChangelogVersion": "0.73.0",
  "defaultProvider": "${PI_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_DEFAULT_MODEL}",
  "defaultThinkingLevel": "off",
  "collapseChangelog": true,
  "enableInstallTelemetry": false,
  "enabledModels": ["github-copilot/claude-opus-4.8", "aperture/qwen3.8-flash-next-iq4:builder", "aperture/qwen3.5-9b"],
  "modelThinkingLevels": {
    "github-copilot/claude-opus-4.8": "high",
    "aperture/qwen3.8-flash-next-iq4:builder": "off",
    "aperture/qwen3.5-9b": "off"
  },
  "subagents": {
    "agentOverrides": {
      "scout": {
        "model": "aperture/qwen3.5-9b",
        "thinking": "off"
      },
      "worker": {
        "model": "aperture/qwen3.8-flash-next-iq4:builder",
        "thinking": "off"
      },
      "reviewer": {
        "model": "aperture/qwen3.8-flash-next-iq4:builder",
        "thinking": "off"
      },
      "delegate": {
        "model": "aperture/qwen3.8-flash-next-iq4:builder",
        "thinking": "off"
      }
    }
  },
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "packages": [
    "git:github.com/nicobailon/pi-subagents@main",
    "git:github.com/pythoninthegrass/pi-omlx-picker@main",
    "npm:@juicesharp/rpiv-ask-user-question",
    "npm:context-mode",
    "npm:pi-hermes-memory",
    "npm:pi-mcp-adapter",
    "npm:pi-lens",
    "npm:pi-web-access"
  ],
  "extensions": [
    "~/git/pi_config/extensions/plan-mode"
  ],
  "warnings": {
    "anthropicExtraUsage": false
  },
  "theme": "adventure-time"
}
