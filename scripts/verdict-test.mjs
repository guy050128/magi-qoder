#!/usr/bin/env node
/**
 * Proves the ported arbitration keeps the upstream semantics: runs all
 * 3^3 votes x 2^3 critical flags (216 cases) plus the incomplete cases against
 * a verbatim copy of hirakujira/MAGI-System's computeVerdict.
 *
 *   npm run test:verdict
 */
import { computeVerdictTrace, UNITS } from "../lib/verdict.ts";

/** Verbatim from the upstream app/page.tsx (a4c20e3). */
function upstreamComputeVerdict(results) {
  const all = UNITS.map((u) => results[u]).filter(Boolean);
  if (all.length !== UNITS.length) return null;
  const isCritical = all.filter((r) => r.isCritical).length >= 2;
  if (isCritical) {
    return all.every((r) => r.vote === "APPROVE") ? "APPROVE" : "REJECT";
  }
  const approveCount = all.filter((r) => r.vote === "APPROVE").length;
  const rejectCount = all.filter((r) => r.vote === "REJECT").length;
  const abstainCount = all.filter((r) => r.vote === "ABSTAIN").length;
  if (abstainCount >= 2) return "ABSTAIN";
  if (approveCount > rejectCount) return "APPROVE";
  if (rejectCount > approveCount) return "REJECT";
  return "DEADLOCK";
}

const VOTES = ["APPROVE", "REJECT", "ABSTAIN"];
let checked = 0;
const failures = [];

for (const a of VOTES)
  for (const b of VOTES)
    for (const c of VOTES)
      for (const ca of [false, true])
        for (const cb of [false, true])
          for (const cc of [false, true]) {
            const results = {
              MELCHIOR: { id: "MELCHIOR", number: 1, vote: a, isCritical: ca },
              BALTHASAR: { id: "BALTHASAR", number: 2, vote: b, isCritical: cb },
              CASPER: { id: "CASPER", number: 3, vote: c, isCritical: cc },
            };
            const want = upstreamComputeVerdict(results);
            const got = computeVerdictTrace(results).verdict;
            checked++;
            if (want !== got) failures.push(`${a}/${b}/${c} crit=${ca}${cb}${cc}: upstream=${want} ported=${got}`);
          }

// Incomplete deliberations must never produce a verdict.
for (const partial of [{}, { MELCHIOR: { vote: "APPROVE", isCritical: false } }, { MELCHIOR: {}, BALTHASAR: {} }]) {
  const results = Object.fromEntries(
    Object.entries(partial).map(([k, v]) => [k, { id: k, number: 1, ...v }]),
  );
  checked++;
  if (computeVerdictTrace(results).verdict !== null) failures.push(`partial ${JSON.stringify(partial)} should be null`);
  if (upstreamComputeVerdict(results) !== null) failures.push(`partial ${JSON.stringify(partial)} upstream non-null`);
}

// The veto audit trail must name the blocking units on a critical matter.
const vetoTrace = computeVerdictTrace({
  MELCHIOR: { vote: "APPROVE", isCritical: true },
  BALTHASAR: { vote: "APPROVE", isCritical: true },
  CASPER: { vote: "REJECT", isCritical: true },
});
checked++;
if (vetoTrace.verdict !== "REJECT" || vetoTrace.rule !== "unanimous-critical" || !vetoTrace.dissenters.includes("CASPER")) {
  failures.push(`critical veto trace wrong: ${JSON.stringify(vetoTrace)}`);
}

if (failures.length) {
  console.error(`FAIL — ${failures.length}/${checked} cases diverged:`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`PASS — ${checked} cases, ported arbitration is behaviourally identical to upstream.`);
console.log("  rule coverage: unanimous-critical (>=2 critical -> 全票), abstain-majority (>=2 ABSTAIN), majority, deadlock, waiting.");
