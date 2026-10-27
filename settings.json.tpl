{
  "lastChangelogVersion": "0.73.0",
  "defaultProvider": "${PI_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_DEFAULT_MODEL}",
  "defaultThinkingLevel": "off",
  "collapseChangelog": true,
  "enableInstallTelemetry": false,
  "enabledModels": ["github-copilot/claude-opus-4.8", "aperture/local/coding"],
  "modelThinkingLevels": {
    "github-copilot/claude-opus-4.8": "high",
    "aperture/local/coding": "off"
  },
  "subagents": {
    "agentOverrides": {
      "scout": {
        "model": "aperture/local/coding",
        "thinking": "off"
      },
      "worker": {
        "model": "aperture/local/coding",
        "thinking": "off"
      },
      "reviewer": {
        "model": "aperture/local/coding",
        "thinking": "off"
      },
      "delegate": {
        "model": "aperture/local/coding",
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
    "npm:pi-lens",
    "npm:pi-web-access",
    "npm:@sting8k/pi-vcc"
  ],
  "extensions": [
    "~/git/pi_config/extensions/plan-mode",
    "~/git/pi_config/extensions/honcho"
  ],
  "warnings": {
    "anthropicExtraUsage": false
  },
  "theme": "adventure-time"
}
