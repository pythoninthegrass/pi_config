#!/usr/bin/env node
/**
 * Honcho per-repo memory recorder.
 *
 * One script, shared conceptually by all three clients, configured per
 * config-repo (each hook passes its own --client). Two modes:
 *
 *   --mode start  create the repo session + attach peers (idempotent).
 *                 Called on every session start; safe to call repeatedly.
 *   --mode end    read the transcript (stdin JSON array OR --transcript <path>)
 *                 and upload its messages once, at turn end.
 *
 * Honcho REST API is on loopback :8000 and needs no auth on this host.
 * Honcho session_id must match ^[a-zA-Z0-9_-]+$, so repo paths are sanitized.
 *
 * Message content is extracted defensively: accepts content/text/value/message
 * .{content,text}, or arrays of parts/content with a text-bearing element.
 */
import { readFileSync } from "node:fs";

const HONCHO = process.env.HONCHO_BASE || "http://127.0.0.1:8000";
const WORKSPACE = process.env.HONCHO_WS || "lance";
const PEERS = ["lance", "Assistant"];

function args() {
  const out = {};
  for (let i = 0; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (!v.startsWith("--")) continue;
    const key = v.replace(/^--/, "");
    const next = process.argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function sanitize(id) {
  const s = String(id).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200);
  return s || "repo";
}

function repoSlug(repo) {
  const base = String(repo).split("/").filter(Boolean).pop() || "repo";
  return sanitize(base);
}

function extractText(m) {
  if (typeof m === "string") return m;
  if (!m || typeof m !== "object") return "";
  if (typeof m.content === "string") return m.content;
  if (typeof m.text === "string") return m.text;
  if (typeof m.value === "string") return m.value;
  const mc = m.message && (m.message.content ?? m.message.text);
  if (typeof mc === "string") return mc;
  const arr = Array.isArray(m.content) ? m.content : Array.isArray(m.parts) ? m.parts : null;
  if (arr) return arr.map((p) => extractText(p)).filter(Boolean).join("\n");
  return "";
}

async function api(path, method, body) {
  const res = await fetch(`${HONCHO}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HONCHO ${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`);
  }
  try { return await res.json(); } catch { return null; }
}

async function ensureSession(sessionId, repoPath, client) {
  // PUT /sessions/{id} is the get-or-create/upsert endpoint.
  await api(`/v3/workspaces/${WORKSPACE}/sessions/${sessionId}`, "PUT", {
    id: sessionId,
    metadata: {
      repo_path: repoPath,
      repo_name: repoSlug(repoPath),
      client,
      honcho_recorded: true,
    },
    peers: Object.fromEntries(PEERS.map((p) => [p, {
      observe_me: p === "lance",
      observe_others: true,
    }])),
  });
  return sessionId;
}

async function record(sessionId, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return { uploaded: 0 };
  const clean = messages
    .map((m) => ({ peer_id: m.peer_id || "lance", content: extractText(m) }))
    .filter((m) => m.content && m.content.trim())
    .slice(0, 100);
  // POST /sessions/{id}/messages accepts {messages:[{content,peer_id}]} (batch).
  await api(`/v3/workspaces/${WORKSPACE}/sessions/${sessionId}/messages`, "POST", { messages: clean });
  return { uploaded: clean.length };
}

// Parse a Claude Code transcript JSONL into {peer_id, content} pairs.
function parseTranscript(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    // Claude transcript: {type:"user"|"assistant", message:{role,content:[{type:"text",text}]}, ...}
    const role = o.role || o.type || (o.message && o.message.role);
    if (role !== "user" && role !== "assistant") continue;
    let content = "";
    if (o.message && Array.isArray(o.message.content)) {
      content = o.message.content.map((p) => (typeof p === "string" ? p : p && p.text)).filter(Boolean).join("\n");
    } else if (typeof o.message?.content === "string") {
      content = o.message.content;
    } else if (typeof o.content === "string") {
      content = o.content;
    }
    if (!content.trim()) continue;
    out.push({ peer_id: role === "assistant" ? "Assistant" : "lance", content });
  }
  return out;
}

async function main() {
  const o = args();
  const mode = o.mode || "end";
  const repo = o.repo || process.env.HONCHO_REPO || process.cwd();
  const client = o.client || "generic";
  const sessionId = o["session-id"] || o.sessionId || repoSlug(repo);

  if (mode === "start") {
    await ensureSession(sessionId, repo, client);
    process.stderr.write(`[honcho-record] start client=${client} repo=${repoSlug(repo)} session=${sessionId}\n`);
    return;
  }

  // end mode: prefer explicit transcript file, else stdin JSON.
  let messages;
  if (o.transcript) {
    messages = parseTranscript(readFileSync(o.transcript, "utf8"));
  } else {
    const raw = readFileSync(0, "utf8").trim();
    messages = raw ? JSON.parse(raw) : [];
  }
  const { uploaded } = await record(sessionId, messages);
  process.stderr.write(`[honcho-record] end client=${client} repo=${repoSlug(repo)} session=${sessionId} uploaded=${uploaded}\n`);
}

main().catch((e) => {
  process.stderr.write(`[honcho-record] ERROR ${e.message}\n`);
  process.exit(1);
});
