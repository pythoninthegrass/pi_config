/**
 * Honcho per-repo memory recorder (Pi extension).
 *
 * Records each repo conversation to Honcho's REST API on loopback :8000.
 * One Honcho session per repo, keyed by the repo path (sanitized to
 * ^[a-zA-Z0-9_-]+$, max 200 chars). Two peers are attached to every session:
 *   - "lance"      (observe_me, observe_others)
 *   - "Assistant"  (observe_others only)
 *
 * Recording strategy:
 *   - session_start  -> ensure the repo session exists + peers attached (PUT,
 *     idempotent; safe on resume/reload/fork).
 *   - message_end    -> upload that single message (POST). Pi fires message_end
 *     once per message for user/assistant/toolResult/custom; we keep only
 *     user + assistant text, so each conversational turn is recorded exactly
 *     once with no cursor bookkeeping.
 *
 * Honcho REST: no auth on this host. Session upsert = PUT /sessions/{id}.
 * Message upload = POST /sessions/{id}/messages with {messages:[{content,peer_id}]}.
 */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const HONCHO = process.env.HONCHO_BASE || "http://127.0.0.1:8000";
const WORKSPACE = "lance";
const PEERS = ["lance", "Assistant"];

function repoSlug(repo: string): string {
  const base = String(repo).split("/").filter(Boolean).pop() || "repo";
  return base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200) || "repo";
}

// Extract text from a Pi AgentMessage: content is a string or an array of
// blocks; only {type:"text", text} blocks carry conversational content.
function messageText(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && (b as { type?: string }).type === "text") {
          return (b as { text?: string }).text ?? "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function api(path: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(`${HONCHO}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HONCHO ${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function ensureSession(sessionId: string, repoPath: string): Promise<void> {
  await api(`/v3/workspaces/${WORKSPACE}/sessions/${sessionId}`, "PUT", {
    id: sessionId,
    metadata: { repo_path: repoPath, repo_name: repoSlug(repoPath), client: "pi", honcho_recorded: true },
    peers: Object.fromEntries(PEERS.map((p) => [p, { observe_me: p === "lance", observe_others: true }])),
  });
}

async function recordMessage(sessionId: string, peerId: string, content: string): Promise<void> {
  await api(`/v3/workspaces/${WORKSPACE}/sessions/${sessionId}/messages`, "POST", {
    messages: [{ peer_id: peerId, content }],
  });
}

export default function honchoRecorder(pi: ExtensionAPI): void {
  let sessionId = "";
  let repoPath = "";

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    repoPath = ctx.cwd;
    sessionId = `pi-${repoSlug(repoPath)}`;
    try {
      await ensureSession(sessionId, repoPath);
    } catch (e) {
      process.stderr.write(`[honcho-record] pi session error: ${(e as Error).message}\n`);
    }
  });

  pi.on("message_end", async (event, _ctx: ExtensionContext) => {
    if (!sessionId) return;
    const role = (event.message as { role?: string }).role;
    if (role !== "user" && role !== "assistant") return;
    const content = messageText(event.message);
    if (!content.trim()) return;
    try {
      await recordMessage(sessionId, role === "assistant" ? "Assistant" : "lance", content);
    } catch (e) {
      process.stderr.write(`[honcho-record] pi message error: ${(e as Error).message}\n`);
    }
  });
}
