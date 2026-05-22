{
  "lastChangelogVersion": "0.73.0",
  "defaultProvider": "${PI_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_DEFAULT_MODEL}",
  "defaultThinkingLevel": "off",
  "enableInstallTelemetry": false,
  "compaction": {
    "enabled": true,
    "reserveTokens": 8192
  },
  "packages": [
    "git:github.com/pythoninthegrass/pi-omlx-picker@main",
    "npm:pi-mcp-adapter",
    "npm:context-mode"
  ],
  "extensions": [
    "~/git/pi_config/extensions/plan-mode"
  ],
  "warnings": {
    "anthropicExtraUsage": false
  },
  "theme": "adventure-time"
}
