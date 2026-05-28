{
  "lastChangelogVersion": "0.73.0",
  "defaultProvider": "${PI_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_DEFAULT_MODEL}",
  "defaultThinkingLevel": "off",
  "collapseChangelog": true,
  "enableInstallTelemetry": false,
  "compaction": {
    "enabled": true,
    "reserveTokens": 8192
  },
  "packages": [
    "git:github.com/pythoninthegrass/pi-subagents@main",
    "git:github.com/pythoninthegrass/pi-omlx-picker@main",
    "npm:@juicesharp/rpiv-ask-user-question",
    "npm:@juicesharp/rpiv-todo",
    "npm:context-mode",
    "npm:pi-hermes-memory",
    "npm:pi-mcp-adapter",
    "npm:pi-lens",
    "npm:pi-tinyfish"
  ],
  "extensions": [
    "~/git/pi_config/extensions/plan-mode"
  ],
  "warnings": {
    "anthropicExtraUsage": false
  },
  "theme": "adventure-time"
}
