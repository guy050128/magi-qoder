#!/usr/bin/env node
/**
 * Measure one real three-unit deliberation, in parallel.
 *
 *   node scripts/probe-qca.mjs ["任意议题"]
 *
 * Prints per-unit wall time, the parsed verdict, and the aggregate ruling — this
 * is the number that decides whether a MAGI-style vote belongs in a hot path.
 * It creates a QCA Session per unit, so it consumes credits.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal(file = ".env.local") {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnvLocal();

const { askOnce, QcaError } = await import("../lib/qca.ts");
const { parseVoteResponse } = await import("../lib/ai-clients.ts");
const { computeVerdictTrace } = await import("../lib/verdict.ts");

const stateFile = path.resolve(process.cwd(), ".magi-state.json");
if (!fs.existsSync(stateFile)) {
  console.error("missing .magi-state.json — run: node scripts/bootstrap-qca.mjs --create");
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const topic = process.argv[2] ?? "NERV 本部是否应立即在第三新东京市启动第三级警戒并出动初号机迎战使徒？";

console.log(`topic: ${topic}`);
console.log(`deadline: ${process.env.MAGI_DEADLINE_MS ?? "240000"}ms  poll: ${process.env.MAGI_POLL_INTERVAL_MS ?? "2500"}ms\n`);

const t0 = Date.now();
const units = await Promise.all(
  ["MELCHIOR", "BALTHASAR", "CASPER"].map(async (id) => {
    const agent = state.agents[id];
    const started = Date.now();
    try {
      const { reply, sessionId } = await askOnce({
        agentId: agent.id,
        environmentId: state.environmentId,
        version: agent.version,
        prompt: topic,
      });
      const parsed = reply.timedOut ? null : parseVoteResponse(reply.text);
      return {
        id,
        model: agent.model,
        sessionId,
        ms: Date.now() - started,
        credits: reply.credits,
        status: reply.status,
        timedOut: reply.timedOut,
        rawText: reply.text,
        parsed,
      };
    } catch (err) {
      const code = err instanceof QcaError ? `${err.code}#${err.diagnosticId.slice(0, 8)}` : "error";
      return { id, model: agent.model, ms: Date.now() - started, error: `${code} ${err.message}`.slice(0, 300), parsed: null };
    }
  }),
);

const results = {};
for (const u of units) {
  const ok = Boolean(u.parsed);
  results[u.id] = {
    id: u.id,
    number: { MELCHIOR: 1, BALTHASAR: 2, CASPER: 3 }[u.id],
    model: u.model,
    reasoningLevel: "qoder",
    reasoning: ok ? u.parsed.reasoning : (u.error ?? `unparsed: ${String(u.rawText).slice(0, 200)}`),
    vote: ok ? u.parsed.vote : "ABSTAIN",
    isCritical: ok ? u.parsed.isCritical : false,
    elapsedMs: u.ms,
    credits: u.credits,
    sessionId: u.sessionId,
    ...(u.error ? { error: u.error } : {}),
  };
  const line = ok
    ? `  ${u.id.padEnd(10)} ${(u.ms / 1000).toFixed(1)}s  ${String(results[u.id].vote).padEnd(8)} critical=${results[u.id].isCritical ? "yes" : "no "} credits=${u.credits ?? "?"}`
    : `  ${u.id.padEnd(10)} ${(u.ms / 1000).toFixed(1)}s  FAILED ${u.error ?? `unparsed reply`}`;
  console.log(line);
  if (ok) console.log(`             ${String(u.parsed.reasoning).replace(/\s+/g, " ").slice(0, 180)}`);
}

const trace = computeVerdictTrace(results);
const ms = units.map((u) => u.ms).sort((a, b) => a - b);
console.log(`\nverdict   : ${trace.verdict ?? "INCOMPLETE"}  (rule=${trace.rule}, A:${trace.approveCount} R:${trace.rejectCount} X:${trace.abstainCount} critical:${trace.criticalCount})`);
if (trace.rule === "unanimous-critical" && trace.dissenters.length) console.log(`veto by   : ${trace.dissenters.join(", ")}`);
console.log(`per-unit  : min ${(ms[0] / 1000).toFixed(1)}s  median ${(ms[1] / 1000).toFixed(1)}s  max ${(ms[2] / 1000).toFixed(1)}s`);
console.log(`wall total: ${((Date.now() - t0) / 1000).toFixed(1)}s  (parallel fan-out: wall ≈ max unit, not sum)`);
const creditSum = units.reduce((acc, u) => acc + (typeof u.credits === "number" ? u.credits : 0), 0);
console.log(`credits   : ${creditSum ? creditSum.toFixed(2) : "?"} total for one 3-unit deliberation${units.every((u) => u.credits === undefined) ? " (API did not report usage)" : ""}`);
console.log(`sessions  : ${units.map((u) => `${u.id}:${u.sessionId ?? "-"}`).join("  ")}`);
