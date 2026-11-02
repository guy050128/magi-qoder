import type { MagiId, MagiResult } from "../types/magi";
import { UNITS } from "./verdict.ts";

const BASE = process.env.NEXT_PUBLIC_MAGI_BASE_PATH || "";

/** One browser request; independent unit results arrive from the server stream. */
export async function deliberateTogether(
  topic: string,
  onResult: (result: MagiResult) => void,
  onUnitError: (unit: MagiId) => void,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 210_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const seen = new Set<MagiId>();
  let done = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event?.type === "started") return;
    if (event?.type === "done") { done = true; return; }
    const id = event?.type === "unit" ? event.result?.id : event?.type === "unit-error" ? event.unit : null;
    if (!UNITS.includes(id)) throw new Error("Invalid unit response");
    if (seen.has(id)) return;
    if (event.type === "unit") {
      if (!["APPROVE", "REJECT", "ABSTAIN"].includes(event.result.vote)
        || typeof event.result.reasoning !== "string" || typeof event.result.model !== "string") {
        throw new Error("Invalid unit result");
      }
      seen.add(id); onResult(event.result);
    } else { seen.add(id); onUnitError(id); }
  };
  try {
    const response = await fetch(`${BASE}/api/deliberate`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ topic }), cache: "no-store", signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Deliberation transport failed (${response.status})`);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 4 * 1024 * 1024) throw new Error("Unit response too large");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (chunk.done) break;
    }
    consume(buffer);
    if (!done || seen.size !== UNITS.length) throw new Error("Incomplete deliberation response");
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
