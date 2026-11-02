"use server";

import { describeError, getMagiModelInfo, provider, queryMagi } from "@/lib/ai-clients";
import { MagiId, MagiResult, UnitRegistry } from "@/types/magi";

const NUMBERS: Record<MagiId, 1 | 2 | 3> = { MELCHIOR: 1, BALTHASAR: 2, CASPER: 3 };

/**
 * One MAGI unit's deliberation. A unit that cannot answer abstains rather than
 * guessing: a dead link must not silently flip the majority.
 */
async function deliberate(id: MagiId, topic: string): Promise<MagiResult> {
  const modelInfo = getMagiModelInfo(id);
  if (!topic.trim()) {
    return {
      id,
      number: NUMBERS[id],
      ...modelInfo,
      reasoning: "SYSTEM ERROR: no topic supplied",
      vote: "ABSTAIN",
      error: "empty topic",
    };
  }
  try {
    const result = await queryMagi(id, topic);
    return {
      id,
      number: NUMBERS[id],
      ...modelInfo,
      reasoning: result.reasoning,
      vote: result.vote,
      isCritical: result.isCritical,
      elapsedMs: result.elapsedMs,
      sessionId: result.sessionId,
      credits: result.credits,
    };
  } catch (err) {
    return {
      id,
      number: NUMBERS[id],
      ...modelInfo,
      reasoning: "SYSTEM ERROR: Connection lost",
      vote: "ABSTAIN",
      error: describeError(err),
    };
  }
}

export async function deliberateMelchior(topic: string): Promise<MagiResult> {
  return deliberate("MELCHIOR", topic);
}

export async function deliberateBalthasar(topic: string): Promise<MagiResult> {
  return deliberate("BALTHASAR", topic);
}

export async function deliberateCasper(topic: string): Promise<MagiResult> {
  return deliberate("CASPER", topic);
}

/**
 * Read-only view of what the three units actually point at, so the operator can
 * see before deliberating whether the trio is heterogeneous.
 */
export async function getUnitRegistry(): Promise<UnitRegistry> {
  const p = provider();
  if (p === "mock") {
    const model = getMagiModelInfo("MELCHIOR").model;
    return {
      provider: "mock",
      configured: true,
      homogeneous: true,
      note: "mock provider — 票型由 MAGI_MOCK_VOTES 决定，不调用任何模型",
      units: (["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]).map((id) => ({ id, model })),
    };
  }
  try {
    const { loadState } = await import("@/lib/state");
    const state = loadState();
    const units = (["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]).map((id) => ({
      id,
      model: state.agents[id].model,
      agentId: state.agents[id].id,
    }));
    const homogeneous = new Set(units.map((u) => u.model)).size === 1;
    return {
      provider: "qoder",
      configured: true,
      units,
      homogeneous,
      ...(homogeneous
        ? { note: "三台主机同模型：MAGI 的异构屏蔽失效，建议用 MAGI_MODEL_* 分开指定" }
        : {}),
    };
  } catch (err) {
    return {
      provider: "qoder",
      configured: false,
      homogeneous: false,
      units: (["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]).map((id) => ({ id, model: "未初始化" })),
      note: describeError(err),
    };
  }
}
