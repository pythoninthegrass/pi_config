{
  "mcpServers": {
    "honcho": {
      "description": "Persistent memory for Lance; read full server instructions with describeNamespace before use. Workspace lance, peers lance and Assistant.",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer local",
        "X-Honcho-Plugin": "pi",
        "X-Honcho-Workspace-ID": "lance"
      }
    },
    "backlog": {
      "command": "backlog",
      "args": [
        "mcp",
        "start"
      ]
    },
    "context-mode": {
      "command": "context-mode"
    },
    "context7": {
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp"
      ]
    },
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "ide",
        "--project-from-cwd"
      ]
    }
  }
}
