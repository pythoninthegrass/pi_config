#!/usr/bin/env bash
# Smoke test for the koboldcpp + proxy agentic-coding backend.
#
# Verifies the full chain pi depends on:
#   1. proxy (61519) reachable and a model is served
#   2. a plain completion returns tokens (catches the "empty assistant stop")
#   3. tool-calling works end-to-end via streaming (exercises proxy_rewrite.ts,
#      which only rewrites malformed tool calls on streamed responses)
#
# Run on the host where koboldcpp is local (WSL), or anywhere that can reach the
# proxy. Override the endpoint with KOBOLD_PROXY.
#
#   ./smoke_test.sh
#   KOBOLD_PROXY=http://127.0.0.1:61519 SMOKE_TIMEOUT=180 ./smoke_test.sh
set -euo pipefail

PROXY="${KOBOLD_PROXY:-http://127.0.0.1:61519}"
TIMEOUT="${SMOKE_TIMEOUT:-120}"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }
die() { red "FAIL: $1"; exit 1; }

command -v jq >/dev/null || die "jq not found"
command -v curl >/dev/null || die "curl not found"

# 1. proxy reachable + model id
echo "[1/3] proxy /v1/models @ $PROXY"
models_json="$(curl -sf -m 10 "$PROXY/v1/models")" || die "proxy not reachable at $PROXY"
model_id="$(printf '%s' "$models_json" | jq -r '.data[0].id // empty')"
[ -n "$model_id" ] || die "no model served by proxy"
grn "  ok: $model_id"

# 2. plain completion — model actually generates (not an empty assistant stop)
echo "[2/3] chat completion (non-streaming)"
chat="$(curl -sf -m "$TIMEOUT" "$PROXY/v1/chat/completions" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg m "$model_id" \
    '{model:$m, stream:false, max_tokens:64,
      messages:[{role:"user",content:"Reply with the single word: pong"}]}')")" \
  || die "completion request failed"
reply="$(printf '%s' "$chat" | jq -r '.choices[0].message.content // empty')"
[ -n "$reply" ] || die "empty completion (possible 'empty assistant stop twice')"
grn "  ok: ${reply:0:40}"

# 3. tool call via streaming — exercises the proxy rewrite path.
# koboldcpp is single-slot: a request fired before the previous slot frees makes
# the proxy return a transient 500, so settle briefly and retry. We inspect the
# body for tool_calls rather than trusting the HTTP status.
echo "[3/3] tool call (streaming, via proxy rewrite)"
tool_body="$(jq -n --arg m "$model_id" '{
  model:$m, stream:true, max_tokens:256, tool_choice:"auto",
  messages:[{role:"user",content:"Write the text hello to /tmp/smoke.txt using the write_file tool. Use the tool; do not answer in prose."}],
  tools:[{type:"function",function:{name:"write_file",description:"Write text to a file",
    parameters:{type:"object",properties:{path:{type:"string"},content:{type:"string"}},required:["path","content"]}}}]
}')"

sse=""
for attempt in 1 2 3; do
  sleep 1
  sse="$(curl -s -m "$TIMEOUT" -N "$PROXY/v1/chat/completions" \
    -H 'content-type: application/json' -d "$tool_body" || true)"
  printf '%s' "$sse" | grep -q '"tool_calls"' && break
done

if printf '%s' "$sse" | grep -q '"tool_calls"'; then
  name="$(printf '%s' "$sse" | grep -o '"name": *"[^"]*"' | head -1)"
  grn "  ok: tool_calls emitted (${name:-unknown})"
else
  red "  WARN: no tool_calls after 3 tries — model answered in prose or proxy errored"
  printf '%s\n' "$sse" | tail -3
  exit 2
fi

grn "SMOKE PASS: backend ready for agentic coding"
