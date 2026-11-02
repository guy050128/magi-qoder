import fs from "node:fs";
import path from "node:path";

/**
 * Daily credit guard. The deployment is public, so a bot could otherwise drive
 * the three units in a loop and drain the account. Everyone may use it — just
 * not without limit. Tune or disable with MAGI_DAILY_CREDIT_CAP (0 = unlimited).
 */
const FILE = path.join(process.cwd(), ".magi-usage.json");

export interface UsageRecord {
  /** Local date (YYYY-MM-DD) the counter belongs to. */
  day: string;
  credits: number;
  rounds: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function cap(): number {
  const raw = Number.parseInt(process.env.MAGI_DAILY_CREDIT_CAP ?? "500", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 500;
}

export function readUsage(): UsageRecord {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as UsageRecord;
    if (parsed.day === today()) return parsed;
  } catch {
    /* first run of the day, or unreadable file: start clean */
  }
  return { day: today(), credits: 0, rounds: 0 };
}

export function overCap(): false | UsageRecord {
  const limit = cap();
  if (limit === 0) return false;
  const usage = readUsage();
  return usage.credits >= limit ? usage : false;
}

export function addUsage(credits: number, completedRound: boolean): UsageRecord {
  const usage = readUsage();
  usage.credits += Number.isFinite(credits) && credits > 0 ? credits : 0;
  if (completedRound) usage.rounds += 1;
  try {
    fs.writeFileSync(FILE, `${JSON.stringify(usage, null, 2)}\n`, "utf8");
  } catch {
    /* accounting must never break a verdict */
  }
  return usage;
}
