#!/usr/bin/env node
/**
 * Provision the three MAGI supercomputers as Qoder Cloud Agents.
 *
 *   node scripts/bootstrap-qca.mjs            # read-only survey (no writes)
 *   node scripts/bootstrap-qca.mjs --create   # create Environment + 3 Agents, write .magi-state.json
 *
 * Idempotent: resources are matched by metadata {app:"magi-system", unit:<ID>}
 * before anything is created, so re-running does not mint duplicate agents.
 * Costs real Qoder credits — hence the two-step design.
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

const { listModels, createAgent, createEnvironment, findAgentByMetadata, findEnvironmentByMetadata, updateAgent, QcaError } =
  await import("../lib/qca.ts");
const { MELCHIOR_PROMPT, BALTHASAR_PROMPT, CASPER_PROMPT } = await import("../lib/prompts.ts");

const PERSONAS = [
  { id: "MELCHIOR", number: 1, label: "MELCHIOR-1 · scientist", system: MELCHIOR_PROMPT, modelEnv: "MAGI_MODEL_MELCHIOR" },
  { id: "BALTHASAR", number: 2, label: "BALTHASAR-2 · mother", system: BALTHASAR_PROMPT, modelEnv: "MAGI_MODEL_BALTHASAR" },
  { id: "CASPER", number: 3, label: "CASPER-3 · woman", system: CASPER_PROMPT, modelEnv: "MAGI_MODEL_CASPER" },
];

const APP_METADATA = { app: "magi-system" };
const doCreate = process.argv.includes("--create");

/** The list/create response may carry model as a string or as { id, ... }. */
function modelOf(agent) {
  const m = agent?.model;
  if (typeof m === "string") return m;
  if (m && typeof m === "object" && typeof m.id === "string") return m.id;
  return null;
}

function say(...args) {
  console.log(...args);
}

function fail(err) {
  if (err instanceof QcaError) {
    say(`\nQCA ${err.code}${err.status ? ` (HTTP ${err.status})` : ""} #${err.diagnosticId.slice(0, 8)}\n  ${err.message}`);
    if (err.code === "not_configured") say("  → 在 .env.local 里填 QODER_PAT（Qoder 控制台 → 设置 → 个人访问令牌 → 创建令牌）。");
    if (err.code === "access_denied") say("  → PAT 无效/权限不足或区域不匹配。CN 账号的 origin 是 https://api.qoder.com.cn。");
  } else {
    say(`\n${String(err)}`);
  }
  process.exit(1);
}

if (!process.env.QODER_PAT) fail(new QcaError("not_configured", "QODER_PAT missing"));
say(`origin      : ${process.env.QODER_API_ORIGIN ?? "https://api.qoder.com.cn"}`);
say(`mode        : ${doCreate ? "CREATE" : "SURVEY (read-only)"}   pat: ${process.env.QODER_PAT.slice(0, 4)}…${process.env.QODER_PAT.length} chars`);

// 1. models ------------------------------------------------------------------
let models;
try {
  models = await listModels();
} catch (err) {
  fail(err);
}
const enabled = models.filter((m) => m.enabled !== false);
say(`\nmodels (${enabled.length}/${models.length} enabled):`);
for (const m of enabled) say(`  - ${m.id}${m.display_name || m.name ? `  (${m.display_name ?? m.name})` : ""}`);
if (!enabled.length) fail(new QcaError("response_invalid", "no enabled models returned for this account — cannot build the three units"));

function pickModel(index) {
  const override = process.env[PERSONAS[index].modelEnv];
  if (override) return override;
  const pool = enabled.map((m) => m.id);
  if (pool.length >= 3) return pool[index];
  return pool[0];
}
const chosen = PERSONAS.map((_, i) => pickModel(i));
const distinct = new Set(chosen).size;
say(`\nassignment  : ${PERSONAS.map((p, i) => `${p.id}→${chosen[i]}`).join("  ")}`);
if (distinct === 1) {
  say("  ⚠ 三台主机同模型：MAGI 的「异构」没了，共模错误无法互相屏蔽。用 MAGI_MODEL_* 指定不同 id 更好。");
}

// 2. environment -------------------------------------------------------------
let environment;
try {
  environment = await findEnvironmentByMetadata({ ...APP_METADATA, role: "magi-runtime" });
  if (!environment && doCreate) {
    say("  creating environment…");
    environment = await createEnvironment("magi-environment", { ...APP_METADATA, role: "magi-runtime" });
  }
} catch (err) {
  fail(err);
}
say(`\nenvironment : ${environment ? `${environment.id} (${environment.name ?? "unnamed"})` : "ABSENT — run with --create"}`);

// 3. agents ------------------------------------------------------------------
const agents = {};
say("\nunits:");
for (let i = 0; i < PERSONAS.length; i++) {
  const p = PERSONAS[i];
  let agent;
  try {
    agent = await findAgentByMetadata({ ...APP_METADATA, unit: p.id });
    if (agent && doCreate) {
      const current = modelOf(agent);
      if (current && current !== chosen[i]) {
        const version = typeof agent.version === "number" ? agent.version : 1;
        say(`  retargeting ${p.id}: ${current} -> ${chosen[i]} (v${version})…`);
        agent = await updateAgent(agent.id, version, { model: chosen[i] });
      }
    }
    if (!agent && doCreate) {
      say(`  creating ${p.id} (model=${chosen[i]})…`);
      agent = await createAgent({
        name: `magi-${p.id.toLowerCase()}`,
        model: chosen[i],
        system: p.system,
        tools: [],
        metadata: { ...APP_METADATA, unit: p.id, persona: p.label },
        idempotencyKey: `magi-${p.id.toLowerCase()}-v1`,
      });
    }
  } catch (err) {
    fail(err);
  }
  agents[p.id] = agent
    ? {
        id: agent.id,
        model: String(agent.model?.id ?? agent.model ?? chosen[i]),
        name: String(agent.name ?? `magi-${p.id.toLowerCase()}`),
        version: typeof agent.version === "number" ? agent.version : undefined,
      }
    : null;
  say(`  ${p.label.padEnd(24)} ${agent ? `${agent.id}  model=${agents[p.id].model}${agent.version !== undefined ? ` v${agent.version}` : ""}` : "ABSENT — run with --create"}`);
}

const complete = Object.values(agents).every(Boolean);
if (!complete) {
  say("\nNot all three units exist yet. Survey is read-only; run:  npm run bootstrap -- --create");
  process.exit(0);
}

if (!doCreate) {
  say("\nAll three units resolve. Survey wrote nothing (re-run with --create to refresh .magi-state.json).");
  process.exit(0);
}

// 4. state -------------------------------------------------------------------
const state = {
  origin: process.env.QODER_API_ORIGIN ?? "https://api.qoder.com.cn",
  environmentId: environment.id,
  agents,
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(path.resolve(process.cwd(), ".magi-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
say(`\nwrote .magi-state.json${doCreate ? " (created resources)" : " (pointers to existing resources)"}`);
say("next: npm run dev   →  http://localhost:3000");
