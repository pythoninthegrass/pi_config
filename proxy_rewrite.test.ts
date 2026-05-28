import { expect, test } from "bun:test";
import { extractTaggedToolCalls, rewriteBufferedSse } from "./proxy_rewrite";

// Builds a minimal buffered SSE response carrying `content` and a stop finish.
function sse(content: string): string {
  const delta = JSON.stringify({
    id: "chatcmpl-test",
    model: "qwen3-coder-next-builder",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
  const done = JSON.stringify({
    id: "chatcmpl-test",
    model: "qwen3-coder-next-builder",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
  return `data: ${delta}\n\ndata: ${done}\n\ndata: [DONE]\n\n`;
}

// Pull the tool_calls delta out of a rewritten SSE stream.
function toolCallsFrom(sseText: string) {
  for (const line of sseText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data: ") || t === "data: [DONE]") continue;
    const j = JSON.parse(t.slice(6));
    const tc = j.choices?.[0]?.delta?.tool_calls;
    if (tc) return tc;
  }
  return null;
}

// The format qwen3-coder-next-builder actually emitted via pi.
const XML_WRAPPED = `I'll help with that.

<tool_call>
<function=tinyfish_search>
<query>
site:google.com/finance NVDA
</query>
</function>
</tool_call>`;

test("extractTaggedToolCalls parses <function=name> XML with child-tag params", () => {
  const calls = extractTaggedToolCalls(XML_WRAPPED);
  expect(calls).not.toBeNull();
  expect(calls!).toHaveLength(1);
  expect(calls![0].name).toBe("tinyfish_search");
  expect(JSON.parse(calls![0].arguments)).toEqual({
    query: "site:google.com/finance NVDA",
  });
});

test("rewriteBufferedSse rewrites XML function call into tool_calls", () => {
  const out = rewriteBufferedSse(sse(XML_WRAPPED));
  const tc = toolCallsFrom(out);
  expect(tc).not.toBeNull();
  expect(tc[0].function.name).toBe("tinyfish_search");
  expect(JSON.parse(tc[0].function.arguments)).toEqual({
    query: "site:google.com/finance NVDA",
  });
});

test("bare <function=name> without <tool_call> wrapper is rewritten", () => {
  const bare = `<function=get_weather>\n<city>Austin</city>\n<units>metric</units>\n</function>`;
  const tc = toolCallsFrom(rewriteBufferedSse(sse(bare)));
  expect(tc).not.toBeNull();
  expect(tc[0].function.name).toBe("get_weather");
  expect(JSON.parse(tc[0].function.arguments)).toEqual({
    city: "Austin",
    units: "metric",
  });
});

test("explicit <parameter=key> form is parsed", () => {
  const p = `<tool_call><function=foo><parameter=bar>baz</parameter></function></tool_call>`;
  const calls = extractTaggedToolCalls(p);
  expect(calls![0].name).toBe("foo");
  expect(JSON.parse(calls![0].arguments)).toEqual({ bar: "baz" });
});

test("non-tool prose passes through untouched", () => {
  const prose = sse("NVDA is trading around $X today.");
  expect(rewriteBufferedSse(prose)).toBe(prose);
});
