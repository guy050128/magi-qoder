import fs from "node:fs";
import path from "node:path";
import type { MagiId, MagiModelInfo, Vote } from "../types/magi";
import { loadState } from "./state.ts";
import { addUsage, cap, overCap } from "./budget.ts";
import { askOnce, QcaError } from "./qca.ts";

export type Provider = "qoder" | "mock";

export function provider(): Provider {
  return process.env.MAGI_PROVIDER === "mock" ? "mock" : "qoder";
}

export interface UnitVote {
  reasoning: string;
  vote: Vote;
  isCritical: boolean;
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Tolerant version of the upstream parser. QCA agents can wrap the verdict in
 * prose or a code fence, so we extract the first balanced JSON object instead of
 * assuming the whole reply is raw JSON.
 */
export function parseVoteResponse(text: string): UnitVote {
  const candidate = firstJsonObject(text);
  if (!candidate) {
    throw new Error(`no JSON object in reply: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`JSON parse failed: ${String(err)} — payload: ${candidate.slice(0, 160)}`);
  }
  const vote = (["APPROVE", "REJECT", "ABSTAIN"].includes(String(parsed.vote)) ? parsed.vote : "ABSTAIN") as Vote;
  return {
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    vote,
    isCritical: parsed.isCritical === true,
  };
}

export function getMagiModelInfo(id: MagiId): MagiModelInfo {
  if (provider() === "mock") {
    return { model: `mock://${process.env.MAGI_MOCK_MODEL ?? "fake-sage"}`, reasoningLevel: "default" };
  }
  try {
    const state = loadState();
    return { model: state.agents[id].model, reasoningLevel: "qoder" };
  } catch (err) {
    return { model: "未初始化（运行 npm run bootstrap）", reasoningLevel: "default" };
  }
}

function debugDump(id: MagiId, sessionId: string, events: unknown): void {
  if (process.env.MAGI_DEBUG !== "1") return;
  const dir = path.join(process.cwd(), ".magi-debug");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id.toLowerCase()}-${sessionId}.json`), JSON.stringify(events, null, 2), "utf8");
}

function mockVerdict(id: MagiId): UnitVote {
  const order: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];
  const idx = order.indexOf(id);
  const votes = (process.env.MAGI_MOCK_VOTES ?? "APPROVE,REJECT,APPROVE").split(",").map((s) => s.trim().toUpperCase());
  const critical = (process.env.MAGI_MOCK_CRITICAL ?? "0,0,0").split(",").map((s) => s.trim());
  const vote = (["APPROVE", "REJECT", "ABSTAIN"].includes(votes[idx]) ? votes[idx] : "ABSTAIN") as Vote;
  return {
    reasoning: `[mock ${id}] 模拟裁决 ${vote}。真实链路请用 MAGI_PROVIDER=qoder 并先执行 npm run bootstrap。`,
    vote,
    isCritical: critical[idx] === "1",
  };
}

async function queryQoder(id: MagiId, topic: string): Promise<UnitVote & { elapsedMs: number; sessionId: string; credits?: number }> {
  const blocked = overCap();
  if (blocked) {
    throw new Error(`今日额度上限 ${cap()} credits 已用尽（本日 ${blocked.credits} credits / ${blocked.rounds} 轮）。调整 MAGI_DAILY_CREDIT_CAP 可放开。`);
  }
  const state = loadState();
  const agent = state.agents[id];
  const persistent = process.env.MAGI_SESSION_MODE === "persistent";
  const reuse = persistent ? state.sessions?.[id] : undefined;

  const { reply, sessionId } = await askOnce({
    agentId: agent.id,
    environmentId: state.environmentId,
    version: agent.version,
    prompt: topic,
    reuseSessionId: reuse,
  });

  if (reply.timedOut) {
    debugDump(id, sessionId, reply.events);
    throw new Error(`deadline exceeded after ${reply.elapsedMs}ms (status=${reply.status}); raw events saved if MAGI_DEBUG=1`);
  }
  debugDump(id, sessionId, reply.events);
  if (typeof reply.credits === "number") addUsage(reply.credits, id === "CASPER");
  return { ...parseVoteResponse(reply.text), elapsedMs: reply.elapsedMs, sessionId, credits: reply.credits };
}

export async function queryMagi(id: MagiId, topic: string): Promise<UnitVote & { elapsedMs: number; sessionId?: string; credits?: number }> {
  if (provider() === "mock") {
    await new Promise((r) => setTimeout(r, Number.parseInt(process.env.MAGI_MOCK_LATENCY_MS ?? "120", 10) || 0));
    return { ...mockVerdict(id), elapsedMs: Number.parseInt(process.env.MAGI_MOCK_LATENCY_MS ?? "120", 10) || 0 };
  }
  return queryQoder(id, topic);
}

export function describeError(err: unknown): string {
  if (err instanceof QcaError) return `${err.code} (${err.status ?? "-"})#${err.diagnosticId.slice(0, 8)}: ${err.message}`.slice(0, 400);
  return String(err).slice(0, 400);
}

