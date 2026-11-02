import type { MagiId } from "@/types/magi";

/** Presentation durations; votes and arbitration remain owned by the original actions. */
export const MOTION_MS = {
  "boot-link": 480,
  closure: 2400,
  defence: 2200,
  "ready-link": 480,
  acceptance: 3000,
  review: 5400,
  "result-link": 480,
  stamps: 2400,
  "final-link": 480,
  intrusion: 6300,
} as const;

export type ConsolePhase = "boot" | "intro" | "ready" | "complete" | keyof typeof MOTION_MS;
export interface DiagramMotion {
  phase: ConsolePhase;
  elapsed: number;
  enabled: boolean;
}
export interface DefenceClip {
  frames: string[];
  frameTimes: number[];
  frameCount: number;
  duration: number;
  width: number;
  height: number;
}
export const STAMP_ORDER: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const isIntrusion = (topic: string) => ["CODE:666", "使徒入侵", "王勇杰666"].includes(topic.trim());
export const isEntryMotion = (phase: ConsolePhase) =>
  phase === "boot-link" || phase === "closure" || phase === "defence" || phase === "ready-link";

/** Same ranking/sweep as the saved reference reconstruction, inside the original unit clips. */
export function intrusionSweep(elapsed: number) {
  const seconds = elapsed / 1000;
  return seconds < 4.1 ? clamp((seconds - 0.9) / 2.7) : clamp(1 - (seconds - 4.1) / 2.2);
}
