export type Vote = "APPROVE" | "REJECT" | "ABSTAIN";

export type MagiId = "MELCHIOR" | "BALTHASAR" | "CASPER";

export type ReasoningLevel = "low" | "medium" | "high" | "default" | "qoder";

export interface MagiModelInfo {
  model: string;
  reasoningLevel: ReasoningLevel;
}

export interface MagiResult {
  id: MagiId;
  number: 1 | 2 | 3;
  model: string;
  reasoningLevel: ReasoningLevel;
  reasoning: string;
  vote: Vote;
  isCritical?: boolean;
  error?: string;
  /** wall-clock ms for this unit's deliberation (QCA round trip + polling). */
  elapsedMs?: number;
  /** QCA session id, kept so a verdict can be traced back to the raw event log. */
  sessionId?: string;
  /** Qoder credits consumed by this unit's deliberation, when reported. */
  credits?: number;
}

export type PartialResults = Partial<Record<MagiId, MagiResult>>;

export interface UnitRegistryEntry {
  id: MagiId;
  model: string;
  agentId?: string;
}

/** What the intro panel shows before anyone asks for a verdict. */
export interface UnitRegistry {
  provider: "qoder" | "mock";
  configured: boolean;
  units: UnitRegistryEntry[];
  /** True when all three units resolve to the same model id — MAGI loses its point. */
  homogeneous: boolean;
  note?: string;
}
