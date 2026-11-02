/**
 * Minimal Qoder Cloud Agents (QCA) HTTP client for the MAGI server actions.
 *
 * Contract source (checked 2026-10-22 against the bundled Sites skill reference
 * `references/api.md` and docs.qoder.com/zh/cloud-agents):
 *   GET  /api/v1/cloud/models
 *   POST /api/v1/cloud/agents          { name, model, system, tools, metadata }
 *   POST /api/v1/cloud/environments    { name, config: { type: "cloud" } }
 *   POST /api/v1/cloud/sessions        { agent, environment_id }
 *   POST /api/v1/cloud/sessions/{id}/events   { events: [{ type: "user.message", content: [...] }] }
 *   GET  /api/v1/cloud/sessions/{id}/events?order=asc&limit=100
 *
 * Safety: https only, path allowlist, no redirect following, per-request timeout,
 * bounded response size, and the PAT never leaves the server process.
 */

export const QCA_DEFAULT_ORIGIN = "https://api.qoder.com.cn";
export const QCA_PATH_PREFIX = "/api/v1/cloud";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 256 * 1024;
const ALLOWLIST =
  /^\/api\/v1\/cloud\/(models|agents|environments|sessions)(\/[A-Za-z0-9_-]+(\/(events|archive|cancel))?)?(\?[^\s\\#]*)?$/;

let submissionTail = Promise.resolve();

/** Serialize only session creation and message acknowledgement. The model's
 * judgment and event polling continue independently after admission. */
function submitInOrder<T>(operation: () => Promise<T>): Promise<T> {
  const submitted = submissionTail.then(operation);
  submissionTail = submitted.then(() => {}, () => {});
  return submitted;
}

export type QcaErrorCode =
  | "not_configured"
  | "configuration_invalid"
  | "request_invalid"
  | "request_too_large"
  | "redirect_blocked"
  | "timeout"
  | "response_invalid"
  | "access_denied"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "rejected"
  | "service_unavailable";

export class QcaError extends Error {
  code: QcaErrorCode;
  status?: number;
  diagnosticId: string;

  constructor(code: QcaErrorCode, message: string, status?: number) {
    super(message);
    this.name = "QcaError";
    this.code = code;
    this.status = status;
    this.diagnosticId = crypto.randomUUID();
  }
}

export interface QcaModel {
  id: string;
  name?: string;
  display_name?: string;
  enabled?: boolean;
  [k: string]: unknown;
}

export interface QcaResource {
  id: string;
  type?: string;
  name?: string;
  [k: string]: unknown;
}

export interface QcaEvent {
  id?: string;
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
  [k: string]: unknown;
}

function origin(): string {
  const raw = (process.env.QODER_API_ORIGIN ?? "").trim() || QCA_DEFAULT_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QcaError("configuration_invalid", `QODER_API_ORIGIN is not a URL: ${raw}`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new QcaError("configuration_invalid", `QODER_API_ORIGIN must be a bare https origin: ${raw}`);
  }
  return url.origin;
}

function pat(): string {
  const token = (process.env.QODER_PAT ?? "").trim();
  if (!token || /[\r\n]/.test(token)) {
    throw new QcaError("not_configured", "QODER_PAT is missing. Put it in .env.local (never commit it).");
  }
  return token;
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function request<T>(
  path: string,
  {
    method = "GET",
    body,
    idempotencyKey,
    timeoutMs = 20000,
  }: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {},
): Promise<T> {
  const pathname = path.split("?")[0];
  if (!ALLOWLIST.test(pathname) || /[\s\\#]/.test(path) || !["GET", "POST"].includes(method)) {
    throw new QcaError("request_invalid", `Refusing non-allowlisted request: ${method} ${pathname}`);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${pat()}`,
    Accept: "application/json",
  };
  let encoded: string | undefined;
  if (body !== undefined) {
    encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw new QcaError("request_too_large", "request body too large");
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey !== undefined) {
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) throw new QcaError("request_invalid", "bad Idempotency-Key");
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const url = new URL(path, origin());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url.href, { method, headers, body: encoded, redirect: "manual", signal: controller.signal });
  } catch (err) {
    const aborted = controller.signal.aborted;
    throw new QcaError(aborted ? "timeout" : "service_unavailable", `transport failure on ${pathname}: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    void response.body?.cancel().catch(() => {});
    throw new QcaError("redirect_blocked", `redirect ${response.status} from ${pathname}`, response.status);
  }
  if (!response.ok) {
    const snippet = await response
      .text()
      .then((t) => t.slice(0, 400))
      .catch(() => "");
    const code: QcaErrorCode =
      response.status === 401 || response.status === 403
        ? "access_denied"
        : response.status === 404
          ? "not_found"
          : response.status === 409
            ? "conflict"
            : response.status === 429
              ? "rate_limited"
              : response.status < 500
                ? "rejected"
                : "service_unavailable";
    throw new QcaError(code, `${method} ${pathname} -> ${response.status} ${snippet}`, response.status);
  }
  if (response.status === 204) return null as T;

  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new QcaError("response_invalid", "response exceeded size cap");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new QcaError("response_invalid", `non-JSON response from ${pathname}: ${text.slice(0, 200)}`);
  }
}

interface ListEnvelope<T> {
  data: T[];
  has_more?: boolean;
  next_page?: string | null;
  first_id?: string | null;
  last_id?: string | null;
}

/** Walks every page up to `maxPages` so "not found" is actually proven. */
async function listAll<T>(base: string, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined = undefined;
  for (let page = 0; page < maxPages; page++) {
    const qs: string = cursor ? `?limit=100&after=${encodeURIComponent(String(cursor))}` : "?limit=100";
    const res: ListEnvelope<T> = await request<ListEnvelope<T>>(`${base}${qs}`);
    out.push(...(res.data ?? []));
    if (!res.has_more) return out;
    cursor = res.next_page ?? res.last_id ?? null;
    if (!cursor) return out;
  }
  return out;
}

export async function listModels(): Promise<QcaModel[]> {
  const res = await request<ListEnvelope<QcaModel> | QcaModel[]>(`${QCA_PATH_PREFIX}/models`);
  return Array.isArray(res) ? res : (res.data ?? []);
}

export async function findAgentByMetadata(match: Record<string, string>): Promise<QcaResource | null> {
  const agents = await listAll<QcaResource>(`${QCA_PATH_PREFIX}/agents`);
  return (
    agents.find((a) => {
      const md = (a.metadata ?? {}) as Record<string, string>;
      return Object.entries(match).every(([k, v]) => md[k] === v);
    }) ?? null
  );
}

export async function findEnvironmentByMetadata(match: Record<string, string>): Promise<QcaResource | null> {
  const envs = await listAll<QcaResource>(`${QCA_PATH_PREFIX}/environments`);
  return (
    envs.find((e) => {
      const md = (e.metadata ?? {}) as Record<string, string>;
      return Object.entries(match).every(([k, v]) => md[k] === v);
    }) ?? null
  );
}

export async function createEnvironment(name: string, metadata: Record<string, string> = {}): Promise<QcaResource> {
  return request<QcaResource>(`${QCA_PATH_PREFIX}/environments`, {
    method: "POST",
    body: { name, config: { type: "cloud" }, metadata },
  });
}

export async function createAgent(opts: {
  name: string;
  model: string;
  system: string;
  tools?: unknown[];
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<QcaResource> {
  return request<QcaResource>(`${QCA_PATH_PREFIX}/agents`, {
    method: "POST",
    body: { name: opts.name, model: opts.model, system: opts.system, tools: opts.tools ?? [], metadata: opts.metadata ?? {} },
    idempotencyKey: opts.idempotencyKey,
  });
}

/**
 * Retargets an existing agent. The API uses optimistic concurrency: `version`
 * must match the server-side value or it answers 409, and a successful update
 * bumps the version. Verified against docs (POST /api/v1/cloud/agents/{id}).
 */
export async function updateAgent(
  agentId: string,
  version: number,
  patch: { model?: string; system?: string; name?: string; tools?: unknown[]; metadata?: Record<string, string> },
): Promise<QcaResource> {
  return request<QcaResource>(`${QCA_PATH_PREFIX}/agents/${agentId}`, {
    method: "POST",
    body: { version, ...patch },
    timeoutMs: 30000,
  });
}

export async function createSession(agentId: string, environmentId: string, version?: number): Promise<QcaResource> {
  // Verified against POST /api/v1/cloud/sessions: a top-level `agent_version` is
  // rejected ("json: unknown field"); version pinning goes inside the agent object.
  const body: Record<string, unknown> = {
    agent: version === undefined ? agentId : { id: agentId, type: "agent", version },
    environment_id: environmentId,
  };
  return request<QcaResource>(`${QCA_PATH_PREFIX}/sessions`, { method: "POST", body, timeoutMs: 30000 });
}

export async function getSession(sessionId: string): Promise<QcaResource> {
  return request<QcaResource>(`${QCA_PATH_PREFIX}/sessions/${sessionId}`, { timeoutMs: 20000 });
}

export async function sendUserMessage(sessionId: string, text: string): Promise<QcaEvent[]> {
  const res = await request<{ data?: QcaEvent[] } | QcaEvent[]>(`${QCA_PATH_PREFIX}/sessions/${sessionId}/events`, {
    method: "POST",
    body: { events: [{ type: "user.message", content: [{ type: "text", text }] }] },
    timeoutMs: 30000,
  });
  return Array.isArray(res) ? res : (res.data ?? []);
}

/** Verified: POST /sessions/{id}/cancel returns the transient status "canceling".
 * Used to release a queued session instead of leaving it rescheduling after we give up. */
export async function cancelSession(sessionId: string): Promise<void> {
  try {
    await request<QcaResource>(`${QCA_PATH_PREFIX}/sessions/${sessionId}/cancel`, { method: "POST", timeoutMs: 15000 });
  } catch {
    /* best effort: never fail a deliberation because cleanup failed */
  }
}

export async function listEvents(sessionId: string): Promise<QcaEvent[]> {
  const res = await request<ListEnvelope<QcaEvent>>(
    `${QCA_PATH_PREFIX}/sessions/${sessionId}/events?order=asc&limit=100`,
    { timeoutMs: 20000 },
  );
  return res.data ?? [];
}

/** Pulls every text block out of an event; tolerant because the delta/message shape is not pinned by the docs. */
function eventText(ev: QcaEvent): string {
  const blocks = Array.isArray(ev.content) ? ev.content : [];
  const parts = blocks.filter((b) => typeof b?.text === "string").map((b) => b.text as string);
  if (parts.length) return parts.join("");
  if (typeof ev.delta === "string") return ev.delta;
  if (typeof (ev as { text?: unknown }).text === "string") return (ev as { text: string }).text;
  return "";
}

/**
 * Verified against a live session (2026-10-22): the event stream is
 * session.status_running → user.message → span.model_request_start → agent.thinking
 * → agent.message{content:[{type:"text",text}]} → span.model_request_end
 * → session.thread_status_idle → session.usage → session.status_idle.
 * `agent.thinking` carries no text, so only agent.message is a verdict source.
 */
function isAgentMessage(ev: QcaEvent): boolean {
  const t = String(ev.type ?? "");
  return t === "agent.message" || /agent\.(response|output)/.test(t) || t === "assistant.message";
}

export interface QcaReply {
  text: string;
  /** credits reported by the session, when the API exposes them. */
  credits?: number;
  /** Final text assembled from streaming deltas, or the single message body. */
  fromDeltas: boolean;
  status: string;
  events: QcaEvent[];
  elapsedMs: number;
  timedOut: boolean;
}

/**
 * Sends a prompt and polls the event history until the agent answers or the
 * deadline passes. Polling (not SSE) is deliberate: a MAGI unit returns one
 * structured verdict, so incremental text adds nothing to the UI.
 */
export async function askOnce(opts: {
  agentId: string;
  environmentId: string;
  version?: number;
  prompt: string;
  deadlineMs?: number;
  intervalMs?: number;
  reuseSessionId?: string;
}): Promise<{ reply: QcaReply; sessionId: string }> {
  const deadlineMs = opts.deadlineMs ?? envInt("MAGI_DEADLINE_MS", 150_000);
  const intervalMs = opts.intervalMs ?? envInt("MAGI_POLL_INTERVAL_MS", 1200);
  const startedAt = Date.now();

  const { sessionId, sentAt } = await submitInOrder(async () => {
    const session = opts.reuseSessionId
      ? { id: opts.reuseSessionId }
      : await createSession(opts.agentId, opts.environmentId, opts.version);
    const sessionId = session.id;
    if (!sessionId) throw new QcaError("response_invalid", "session create returned no id");

    try {
      await sendUserMessage(sessionId, opts.prompt);
    } catch (err) {
      if (err instanceof QcaError && err.code === "conflict") {
        // 409 = session still busy; the message was NOT queued.
        throw new QcaError("conflict", `session ${sessionId} is busy, message not queued`, err.status);
      }
      throw err;
    }
    return { sessionId, sentAt: Date.now() };
  });

  let lastSignature = "";
  let consecutiveFailures = 0;
  let lastProviderError = "";
  for (;;) {
    let events: QcaEvent[];
    try {
      events = await listEvents(sessionId);
      consecutiveFailures = 0;
    } catch (err) {
      // One 5xx or timeout must not abort a deliberation that is otherwise fine.
      if (++consecutiveFailures < 4) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      throw err;
    }
    const afterPrompt = events.filter((e) => {
      const ts = Date.parse(String(e.created_at ?? "")) || 0;
      return ts === 0 || ts >= sentAt - 5_000;
    });
    const messages = afterPrompt.filter(isAgentMessage);
    const deltas = afterPrompt.filter((e) => /agent\.(delta|message_delta)/.test(String(e.type ?? "")));
    // Last message only: in persistent session mode the history already holds earlier verdicts.
    const full =
      [...messages]
        .reverse()
        .map(eventText)
        .find((t) => t.trim().length > 0) ?? "";
    const streamed = deltas.map(eventText).join("");

    // Upstream queueing shows up as session.error + a reschedule loop; keep it in the
    // report so a 90s stall reads as "provider overloaded", not as our own bug.
    const errEvent = [...events].reverse().find((e) => String(e.type) === "session.error");
    if (errEvent) {
      const err = (errEvent.error ?? {}) as { type?: string; message?: string; qoder_error_code?: string };
      lastProviderError = `${err.type ?? "session.error"}${err.qoder_error_code ? `(${err.qoder_error_code})` : ""}: ${err.message ?? ""}`.slice(0, 200);
    }

    let status = "unknown";
    let credits: number | undefined;
    try {
      const obj = await getSession(sessionId);
      status = String(obj.status ?? "unknown");
      const usage = obj.usage as { total_credits?: number; model_credits?: number } | undefined;
      const c = usage?.total_credits ?? usage?.model_credits;
      if (typeof c === "number") credits = c;
    } catch {
      /* status is advisory; keep polling on events */
    }

    const elapsed = Date.now() - startedAt;
    const settled = status === "idle" || status === "terminated" || status === "completed";
    if (full || (streamed.length > 0 && settled)) {
      return {
        sessionId,
        reply: {
          text: full || streamed,
          fromDeltas: !full,
          status,
          events,
          elapsedMs: elapsed,
          timedOut: false,
          credits,
        },
      };
    }
    const signature = `${events.length}:${status}:${messages.length}:${streamed.length}`;
    if (settled && signature === lastSignature && elapsed > intervalMs * 3) {
      const seen = [...new Set(events.map((e) => String(e.type)))].join(", ");
      throw new QcaError(
        "response_invalid",
        `session settled with no agent message (status=${status}, events=${events.length}; types: ${seen}${lastProviderError ? `; upstream: ${lastProviderError}` : ""})`,
      );
    }
    lastSignature = signature;
    if (elapsed > deadlineMs) {
      await cancelSession(sessionId);
      return {
        sessionId,
        reply: {
          text: "",
          fromDeltas: false,
          status: lastProviderError ? `${status} <- ${lastProviderError}` : status,
          events,
          elapsedMs: elapsed,
          timedOut: true,
          credits,
        },
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
