import type { MagiId, MagiResult } from "../types/magi";
import { UNITS } from "./verdict.ts";
import { isIntrusion } from "./console-motion.ts";

export class DeliberationInputError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Same-origin admission matches the protection of the existing server actions. */
export async function readDeliberationTopic(request: Request): Promise<string> {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const supplied = new URL(origin || "");
    sameOrigin = supplied.origin === origin && supplied.host.toLowerCase() === host.toLowerCase()
      && supplied.protocol === `${protocol}:`;
  } catch { /* Missing, opaque and malformed origins are rejected. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new DeliberationInputError("Same-origin requests only", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new DeliberationInputError("JSON required", 415);
  }
  if (Number(request.headers.get("content-length")) > 8192) throw new DeliberationInputError("Input too large", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 8192) throw new DeliberationInputError("Input too large", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new DeliberationInputError("Invalid JSON", 400); }
  const topic = body && typeof body === "object" && !Array.isArray(body) && "topic" in body ? body.topic : null;
  if (typeof topic !== "string" || !topic.trim() || topic.trim().length > 500) {
    throw new DeliberationInputError("Topic must contain 1–500 characters", 400);
  }
  if (isIntrusion(topic)) throw new DeliberationInputError("Easter egg is handled locally", 400);
  return topic.trim();
}

/** The map starts all three real requests before awaiting any of them.
 * Responses are emitted on completion, never on a simulated timer. */
export function createDeliberationStream(
  topic: string,
  runUnit: (id: MagiId, topic: string) => Promise<MagiResult>,
): ReadableStream<Uint8Array> {
  let closed = false;
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { closed = true; }
      };
      send({ type: "started", units: UNITS });
      const requests = UNITS.map(async (id) => {
        try {
          const result = await runUnit(id, topic);
          if (!result || result.id !== id) throw new Error("Missing unit result");
          send({ type: "unit", result });
        } catch {
          send({ type: "unit-error", unit: id, message: "Connection lost" });
        }
      });
      void Promise.all(requests).then(() => {
        send({ type: "done" });
        if (!closed) { closed = true; controller.close(); }
      });
    },
    cancel() { closed = true; },
  });
}
