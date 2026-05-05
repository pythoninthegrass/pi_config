providers:
  omlx:
    baseUrl: ${OMLX_BASE_URL}
    api: openai-completions
    auth: none
    headers:
      Authorization: Bearer ${OMLX_API_KEY}
    discovery:
      type: llama.cpp
    models:
      - id: Qwen3.6-35B-A3B-MLX-8bit
        contextWindow: 262144
        maxTokens: 8192
      - id: Qwen3.6-27B-MLX-8bit
        contextWindow: 262144
        maxTokens: 8192
      - id: gemma-4-31B-it-MLX-8bit
        contextWindow: 131072
        maxTokens: 8192
      - id: gemma-4-31b-it-4bit
        contextWindow: 131072
        maxTokens: 8192
      - id: gemma-4-26b-a4b-it-4bit
        contextWindow: 131072
        maxTokens: 8192

  omlx-thinking:
    baseUrl: ${OMLX_BASE_URL}
    api: anthropic-messages
    apiKey: ${OMLX_API_KEY}
    compat:
      supportsEagerToolInputStreaming: false
    models:
      - id: Qwen3.6-35B-A3B-MLX-8bit
        name: Qwen3.6 35B (thinking)
        reasoning: true
        input: [text]
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        contextWindow: 262144
        maxTokens: 8192
