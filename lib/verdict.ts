import type { MagiId, PartialResults, Vote } from "../types/magi";

export const UNITS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

export type Verdict = Vote | "DEADLOCK";

export interface VerdictTrace {
  verdict: Verdict | null;
  /** Which rule fired, so the UI can explain a REJECT instead of just showing it. */
  rule: "waiting" | "unanimous-critical" | "abstain-majority" | "majority" | "deadlock";
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  criticalCount: number;
  /** Units that blocked a critical decision — the CASPER-veto audit trail. */
  dissenters: MagiId[];
}

/**
 * MAGI arbitration, unchanged in substance from hirakujira/MAGI-System:
 *   - if >= 2 units flag the matter critical, it needs unanimous APPROVE
 *   - >= 2 ABSTAIN (or a dead link) means the system abstains
 *   - otherwise majority, ties are an explicit DEADLOCK
 * Extracted into a module so the rules can be unit-tested without a browser.
 */
export function computeVerdictTrace(results: PartialResults): VerdictTrace {
  const all = UNITS.map((u) => results[u]).filter(Boolean) as NonNullable<PartialResults[MagiId]>[];
  if (all.length !== UNITS.length) {
    return {
      verdict: null,
      rule: "waiting",
      approveCount: 0,
      rejectCount: 0,
      abstainCount: 0,
      criticalCount: 0,
      dissenters: [],
    };
  }

  const approveCount = all.filter((r) => r.vote === "APPROVE").length;
  const rejectCount = all.filter((r) => r.vote === "REJECT").length;
  const abstainCount = all.filter((r) => r.vote === "ABSTAIN").length;
  const criticalCount = all.filter((r) => r.isCritical).length;
  // Keyed off UNITS rather than r.id so the audit trail survives partial fixtures.
  const dissenters = UNITS.filter((u) => results[u] && results[u]!.vote !== "APPROVE");

  if (criticalCount >= 2) {
    return {
      verdict: all.every((r) => r.vote === "APPROVE") ? "APPROVE" : "REJECT",
      rule: "unanimous-critical",
      approveCount,
      rejectCount,
      abstainCount,
      criticalCount,
      dissenters,
    };
  }
  if (abstainCount >= 2) {
    return { verdict: "ABSTAIN", rule: "abstain-majority", approveCount, rejectCount, abstainCount, criticalCount, dissenters: [] };
  }
  if (approveCount > rejectCount) {
    return { verdict: "APPROVE", rule: "majority", approveCount, rejectCount, abstainCount, criticalCount, dissenters: [] };
  }
  if (rejectCount > approveCount) {
    return { verdict: "REJECT", rule: "majority", approveCount, rejectCount, abstainCount, criticalCount, dissenters: [] };
  }
  return { verdict: "DEADLOCK", rule: "deadlock", approveCount, rejectCount, abstainCount, criticalCount, dissenters: [] };
}

export function computeVerdict(results: PartialResults): Verdict | null {
  return computeVerdictTrace(results).verdict;
}
