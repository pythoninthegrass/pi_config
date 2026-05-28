// Bun proxy: forwards to koboldcpp and rewrites malformed tool call responses
// Handles two cases:
//   1. Model outputs JSON array: [{"type":"function","function":{...}}]
//   2. Model outputs <tool_call>funcname(kwargs)</tool_call> Python-style syntax
const TARGET = "http://127.0.0.1:61515";
const LISTEN = 61519;
// Upstream generation can take minutes; cap the total fetch so a wedged
// koboldcpp doesn't hang forever. Override via PROXY_UPSTREAM_TIMEOUT_MS.
const UPSTREAM_TIMEOUT_MS = Number(
  process.env.PROXY_UPSTREAM_TIMEOUT_MS ?? 600_000
);
// SSE heartbeat interval; must stay under Bun.serve idleTimeout so the client
// connection never idles out while we buffer the upstream stream.
const HEARTBEAT_MS = 5_000;

function isJsonArrayToolCalls(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("[")) return false;
  try {
    const arr = JSON.parse(t);
    return (
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr[0]?.type === "function" &&
      arr[0]?.function?.name
    );
  } catch {
    return false;
  }
}

function toToolCalls(s: string): any[] {
  return (JSON.parse(s.trim()) as any[]).map((item) => ({
    id: item.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
    type: "function",
    function: {
      name: item.function.name,
      arguments:
        typeof item.function.arguments === "string"
          ? item.function.arguments
          : JSON.stringify(item.function.arguments),
    },
  }));
}

// Parse Python-style kwargs: key="val", key=123, key=True
function parseKwargs(argsStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (!argsStr.trim()) return result;

  let pos = 0;

  function skipWs() {
    while (pos < argsStr.length && " \t\n\r".includes(argsStr[pos])) pos++;
  }

  function readQuotedString(q: string): string {
    pos++; // skip opening quote
    let value = "";
    while (pos < argsStr.length) {
      if (argsStr[pos] === "\\" && pos + 1 < argsStr.length) {
        const next = argsStr[pos + 1];
        if (next === "n") value += "\n";
        else if (next === "t") value += "\t";
        else if (next === "r") value += "\r";
        else value += next;
        pos += 2;
      } else if (argsStr[pos] === q) {
        pos++;
        break;
      } else {
        value += argsStr[pos++];
      }
    }
    return value;
  }

  while (pos < argsStr.length) {
    skipWs();
    if (pos >= argsStr.length || argsStr[pos] === ",") { pos++; continue; }

    // Read key
    const keyStart = pos;
    while (pos < argsStr.length && argsStr[pos] !== "=" && argsStr[pos] !== "," && argsStr[pos] !== ")") pos++;
    const key = argsStr.slice(keyStart, pos).trim();
    if (!key) break;

    skipWs();
    if (pos >= argsStr.length || argsStr[pos] !== "=") continue;
    pos++; // skip =
    skipWs();

    // Read value
    if (pos >= argsStr.length) break;
    const ch = argsStr[pos];
    if (ch === '"' || ch === "'") {
      result[key] = readQuotedString(ch);
    } else {
      // unquoted: read until comma
      const start = pos;
      while (pos < argsStr.length && argsStr[pos] !== "," && argsStr[pos] !== ")") pos++;
      const raw = argsStr.slice(start, pos).trim();
      if (raw === "True" || raw === "true") result[key] = true;
      else if (raw === "False" || raw === "false") result[key] = false;
      else if (raw === "None" || raw === "null") result[key] = null;
      else if (raw !== "" && !isNaN(Number(raw))) result[key] = Number(raw);
      else result[key] = raw;
    }
  }

  return result;
}

// Extract tool calls from content that contains <tool_call>funcname(args)</tool_call>
// or <tool_call>{"name":...}</tool_call> that koboldcpp failed to extract.
// Returns null if no <tool_call> blocks found.
function extractTaggedToolCalls(
  content: string
): Array<{ name: string; arguments: string }> | null {
  const results: Array<{ name: string; arguments: string }> = [];
  // Match <tool_call> blocks with or without closing tag
  const tagRegex = /<tool_call>\s*\n?([\s\S]*?)(?:\n?\s*<\/tool_call>|$)/g;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    // Case A: JSON object inside tag ({"name": ..., "arguments": ...})
    if (inner.startsWith("{")) {
      try {
        const obj = JSON.parse(inner);
        if (obj.name) {
          results.push({
            name: obj.name,
            arguments:
              typeof obj.arguments === "string"
                ? obj.arguments
                : JSON.stringify(obj.arguments ?? {}),
          });
          continue;
        }
      } catch {}
    }

    // Case B: Python function call syntax funcname(key=val, ...)
    const pyMatch = inner.match(/^(\w[\w.]*)\s*\(([\s\S]*)\)$/);
    if (pyMatch) {
      const name = pyMatch[1];
      const kwargs = parseKwargs(pyMatch[2]);
      results.push({ name, arguments: JSON.stringify(kwargs) });
      continue;
    }
  }

  return results.length > 0 ? results : null;
}

function rewriteStreamAsToolCalls(
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>,
  modelId: string,
  reqId: string
): string {
  const ts = Math.floor(Date.now() / 1000);
  const base = {
    id: reqId,
    object: "chat.completion.chunk",
    created: ts,
    model: modelId,
  };
  const lines: string[] = [];

  lines.push(
    `data: ${JSON.stringify({
      ...base,
      choices: [
        {
          index: 0,
          finish_reason: null,
          delta: { role: "assistant", content: null },
        },
      ],
    })}\n\n`
  );

  const tcDelta = toolCalls.map((tc, i) => ({
    index: i,
    id: tc.id,
    type: tc.type,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }));
  lines.push(
    `data: ${JSON.stringify({
      ...base,
      choices: [
        { index: 0, finish_reason: null, delta: { tool_calls: tcDelta } },
      ],
    })}\n\n`
  );

  lines.push(
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, finish_reason: "tool_calls", delta: {} }],
    })}\n\n`
  );
  lines.push(`data: [DONE]\n\n`);

  return lines.join("");
}

// Inspect a fully-buffered SSE response and return the SSE text to forward to
// the client: either the original stream or a tool_calls rewrite of it.
function rewriteBufferedSse(raw: string): string {
  let contentParts: string[] = [];
  let finalFinishReason: string | null = null;
  let requestId = `chatcmpl-proxy-${Date.now()}`;
  let modelId = "koboldcpp";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
    try {
      const j = JSON.parse(trimmed.slice(6));
      const ch = j.choices?.[0];
      if (!ch) continue;
      if (ch.finish_reason) finalFinishReason = ch.finish_reason;
      if (j.id) requestId = j.id;
      if (j.model) modelId = j.model;
      const content = ch.delta?.content;
      if (typeof content === "string") contentParts.push(content);
    } catch {}
  }

  const fullContent = contentParts.join("");
  console.log(
    `[proxy] finish=${finalFinishReason} contentLen=${fullContent.length} starts=${fullContent.trimStart().slice(0, 20).replace(/\n/g, "\\n")}`
  );

  const shouldCheck =
    finalFinishReason === "stop" || finalFinishReason === "tool_calls";

  // Case 1: JSON array tool calls
  if (shouldCheck && isJsonArrayToolCalls(fullContent)) {
    console.log(`[proxy] rewriting JSON-array → tool_calls for ${requestId}`);
    const tcs = toToolCalls(fullContent).map((tc) => ({
      ...tc,
      id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
    }));
    return rewriteStreamAsToolCalls(tcs, modelId, requestId);
  }

  // Case 2: <tool_call> tags with Python-style or JSON content
  if (shouldCheck) {
    const tagged = extractTaggedToolCalls(fullContent);
    if (tagged) {
      console.log(
        `[proxy] rewriting <tool_call> tags → tool_calls for ${requestId}: ${tagged.map((t) => t.name).join(", ")}`
      );
      const tcs = tagged.map((t) => ({
        id: `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: { name: t.name, arguments: t.arguments },
      }));
      return rewriteStreamAsToolCalls(tcs, modelId, requestId);
    }
  }

  // Pass through unchanged
  return raw;
}

Bun.serve({
  port: LISTEN,
  hostname: "127.0.0.1",
  // Heartbeats keep the connection alive; this is a generous ceiling for a
  // wedged generation, backing up the per-request upstream timeout.
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const targetUrl = TARGET + url.pathname + url.search;
    const method = req.method;
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      if (k !== "host") headers[k] = v;
    });

    const bodyText = await req.text();
    let isStream = false;
    try {
      const j = JSON.parse(bodyText);
      isStream = j.stream === true;
    } catch {}

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: bodyText || undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!isStream || !upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
      });
    }

    // We must buffer the whole upstream stream to detect/rewrite malformed tool
    // calls, but the client connection would idle out while we wait. Respond
    // immediately with a stream and emit SSE comment heartbeats until the
    // upstream finishes, then forward the (possibly rewritten) events.
    const upstreamBody = upstream.body;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(": connected\n\n"));
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": keepalive\n\n"));
          } catch {}
        }, HEARTBEAT_MS);

        try {
          const chunks: string[] = [];
          const reader = upstreamBody.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(decoder.decode(value, { stream: true }));
          }
          const raw = chunks.join("");
          clearInterval(heartbeat);
          controller.enqueue(enc.encode(rewriteBufferedSse(raw)));
        } catch (err) {
          clearInterval(heartbeat);
          console.log(`[proxy] upstream error: ${err}`);
          controller.enqueue(
            enc.encode(`data: [DONE]\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
});

console.log(`Proxy listening on http://127.0.0.1:${LISTEN} → ${TARGET}`);
