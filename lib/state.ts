import fs from "node:fs";
import path from "node:path";
import type { MagiId } from "../types/magi";

export interface MagiAgentRef {
  id: string;
  model: string;
  name: string;
  version?: number;
}

export interface MagiState {
  origin: string;
  environmentId: string;
  agents: Record<MagiId, MagiAgentRef>;
  /** Only populated when MAGI_SESSION_MODE=persistent. */
  sessions?: Partial<Record<MagiId, string>>;
  createdAt: string;
}

export const STATE_FILE = path.join(process.cwd(), ".magi-state.json");

export function loadState(): MagiState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`Missing ${path.basename(STATE_FILE)} — run: npm run bootstrap`);
  }
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as MagiState;
  for (const id of ["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]) {
    if (!parsed.agents?.[id]?.id) throw new Error(`${path.basename(STATE_FILE)} has no agent for ${id} — re-run: npm run bootstrap`);
  }
  return parsed;
}

export function saveState(state: MagiState): void {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
