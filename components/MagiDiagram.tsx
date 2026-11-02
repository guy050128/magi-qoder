"use client";

import { useEffect, useId, useState } from "react";
import { MagiId, MagiResult, PartialResults, Vote } from "@/types/magi";
import type { VerdictTrace } from "@/lib/verdict";
import { intrusionSweep, STAMP_ORDER, type DiagramMotion } from "@/lib/console-motion";
import { SignalCard } from "@/components/ConsoleMotion";

type Verdict = Vote | "DEADLOCK";

const COLORS: Record<Verdict, string> = {
  APPROVE: "var(--green-ok)",
  REJECT: "var(--red-ng)",
  ABSTAIN: "var(--blue-info)",
  DEADLOCK: "var(--amber)",
};

const VERDICT_TEXT: Record<Verdict, string> = {
  APPROVE: "承 認",
  REJECT: "否 決",
  ABSTAIN: "棄 権",
  DEADLOCK: "膠 着",
};

function voteBackground(vote: Vote | null): string {
  return COLORS[vote ?? "ABSTAIN"];
}

function verdictText(verdict: Verdict): string {
  return VERDICT_TEXT[verdict];
}

function verdictColor(verdict: Verdict): string {
  return COLORS[verdict];
}

function rand(digits: number) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

interface Props {
  partialResults: PartialResults;
  processingUnits: Set<MagiId>;
  trace: VerdictTrace;
  motion?: DiagramMotion;
  busy?: boolean;
}

function MagiHeading({ normal, intrusion, invading }: { normal: string; intrusion: string; invading: boolean }) {
  const filterId = useId();
  const [morphing, setMorphing] = useState(false);

  return (
    <span className="magi-reference-heading" data-invading={invading}>
      <span className="magi-heading-readable">{invading ? intrusion : normal}</span>
      <span className="magi-heading-ink" aria-hidden="true" style={{ filter: morphing ? `url(#${filterId})` : undefined }}>
        <span
          className="magi-heading-layer magi-heading-normal"
          onTransitionRun={(event) => { if (event.propertyName === "opacity") setMorphing(true); }}
          onTransitionEnd={(event) => { if (event.propertyName === "opacity") setMorphing(false); }}
          onTransitionCancel={(event) => { if (event.propertyName === "opacity") setMorphing(false); }}
        >{normal}</span>
        <span className="magi-heading-layer magi-heading-intrusion">{intrusion}</span>
      </span>
      <svg className="magi-heading-filter" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            {/* Threshold alpha only while dissolving, preserving the original amber ink. */}
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -4" />
          </filter>
        </defs>
      </svg>
    </span>
  );
}

const SHAPES: Array<{ id: MagiId; label: string; cls: string }> = [
  { id: "BALTHASAR", label: "BALTHASAR • 2", cls: "wise-balthasar" },
  { id: "CASPER", label: "CASPER • 3", cls: "wise-casper" },
  { id: "MELCHIOR", label: "MELCHIOR • 1", cls: "wise-melchior" },
];

export default function MagiDiagram({ partialResults, processingUnits, trace, motion, busy = false }: Props) {
  const finalVerdict = trace.verdict;
  const [modalId, setModalId] = useState<MagiId | null>(null);
  const [flickerDelays, setFlickerDelays] = useState<Record<MagiId, string>>({
    BALTHASAR: "0ms", CASPER: "0ms", MELCHIOR: "0ms",
  });
  const [code, setCode] = useState("473");
  const [ext, setExt] = useState("STBY");

  const phase = motion?.phase;
  const transferring = motion?.enabled && phase === "acceptance";
  const isProcessing = !transferring && processingUnits.size > 0;
  const invading = motion?.enabled && phase === "intrusion";
  const showingStamps = motion?.enabled && (phase === "stamps" || phase === "final-link" || phase === "complete");
  const recording = busy && !isProcessing && !invading && !transferring;

  useEffect(() => {
    if (processingUnits.size === 3) {
      // 新しい審議が始まった時だけリセット
      setFlickerDelays({
        BALTHASAR: `${Math.floor(Math.random() * 180)}ms`,
        CASPER: `${Math.floor(Math.random() * 180)}ms`,
        MELCHIOR: `${Math.floor(Math.random() * 180)}ms`,
      });
      setCode(rand(3));
      setExt(rand(4));
    }
  }, [processingUnits.size]);

  useEffect(() => {
    if (!busy && Object.keys(partialResults).length === 0) {
      setCode("473");
      setExt("STBY");
      setModalId(null);
    }
  }, [busy, partialResults]);

  const modalResult: MagiResult | null = !transferring && modalId ? (partialResults[modalId] ?? null) : null;

  return (
    <>
      <div className={`magi-grid${motion?.enabled ? ` console-motion-phase-${phase}` : ""}`}>
        {motion?.enabled && phase && phase !== "acceptance" && <SignalCard key={phase} phase={phase} />}
        <svg className="magi-connections" viewBox="0 0 900 600" aria-hidden="true">
          <path d="M350 331L314 424 M550 331L586 424 M375 494H525" />
        </svg>

        {/* System status */}
        <div className="magi-sys-status">
          <div>CODE:{code}</div>
          <div className="magi-sys-status-inner">
            <div>FILE:MAGI_SYS</div>
            <div>EXT:{ext}</div>
            <div>EX_MODE:OFF</div>
            <div>PRIORITY:AAA</div>
          </div>
        </div>

        {/* Verdict badge */}
        <div
          className={`magi-verdict${isProcessing ? " flicker" : ""}${motion?.enabled && phase === "complete" && finalVerdict ? " console-motion-final" : ""}`}
          style={{
            color: invading ? "#f62920" : isProcessing || recording ? "#f7ca62" : finalVerdict ? verdictColor(finalVerdict) : "#3caee0",
            borderColor: invading ? "#f62920" : isProcessing || recording ? "#f7ca62" : finalVerdict ? verdictColor(finalVerdict) : "#3caee0",
          }}
        >
          <div className="magi-verdict-inner">
            {invading ? "侵 入" : isProcessing ? "審議中" : recording ? "集 計" : finalVerdict ? verdictText(finalVerdict) : "情 報"}
          </div>
        </div>

        {/* Decorative headers */}
        <div className="magi-header-deco left">
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
          <MagiHeading normal="提 訴" intrusion="侵 入" invading={Boolean(invading)} />
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
        </div>
        <div className="magi-header-deco right">
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
          <MagiHeading normal="決 議" intrusion="対 抗" invading={Boolean(invading)} />
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
        </div>

        {/* Three MAGI units */}
        {SHAPES.map(({ id, label, cls }) => {
          const result = transferring ? undefined : partialResults[id];
          const processing = !transferring && processingUnits.has(id);
          const bg = voteBackground(result?.vote ?? null);
          const stampIndex = STAMP_ORDER.indexOf(id);
          const stamped = showingStamps && result && (phase !== "stamps" || (motion?.elapsed ?? 0) >= 180 + stampIndex * 280);
          const columns = id === "BALTHASAR" ? 14 : 20;
          const rows = id === "BALTHASAR" ? 18 : 12;
          const sweep = invading && phase === "intrusion" ? intrusionSweep(motion?.elapsed ?? 0) : 0;
          return (
            <div
              key={id}
              data-proposal-unit={id}
              className={`wise-man ${cls}`}
              onClick={() => result && setModalId(id)}
              style={{ cursor: result ? "pointer" : "default" }}
            >
              <div
                className={`wise-inner${processing ? " flicker-fast" : ""}${invading || stamped ? " console-motion-unit" : ""}`}
                style={{
                  "--wise-bg": bg,
                  animationDelay: processing ? flickerDelays[id] : "0ms",
                } as React.CSSProperties}
              >
                {invading && <svg className="console-motion-cells" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {Array.from({ length: columns * rows }, (_, index) => {
                    const row = Math.floor(index / columns), column = index % columns;
                    const rank = Math.min(.985, (column + (row * 7) % 11) / (columns + 10));
                    return <rect key={index} x={column * 100 / columns} y={row * 100 / rows}
                      width={100 / columns + .15} height={100 / rows + .15}
                      fill="#d90920" stroke="#881726" strokeWidth=".3" opacity={rank < sweep ? .94 : 0} />;
                  })}
                </svg>}
                <span data-proposal-label={id} className={invading || stamped ? "console-motion-unit-label" : undefined}>{label}</span>
                {stamped && result && <span className="console-motion-vote" key={id + result.vote}
                  style={{ color: voteBackground(result.vote) }} aria-label={`${id}: ${result.vote}`}>
                  {verdictText(result.vote)}
                </span>}
              </div>
            </div>
          );
        })}

        <div className="magi-center-title">MAGI</div>
      </div>

      {/* Reasoning modal */}
      {modalResult && (
        <div className="modal-overlay" onClick={() => setModalId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                <span>{modalResult.id} • {modalResult.number}</span>
                <span className="modal-model-info">
                  MODEL: {modalResult.model} • REASONING: {modalResult.reasoningLevel}
                  {modalResult.elapsedMs !== undefined ? ` • ${modalResult.elapsedMs >= 1000 ? `${(modalResult.elapsedMs / 1000).toFixed(1)}s` : `${modalResult.elapsedMs}ms`}` : ""}
                  {modalResult.credits !== undefined ? ` • ${modalResult.credits} credits` : ""}
                </span>
              </span>
              <button className="modal-close" onClick={() => setModalId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modalResult.isCritical && (
                <div className="modal-critical">⚠ CRITICAL MATTER — 重大議題</div>
              )}
              <div
                className="modal-vote"
                style={{
                  color: voteBackground(modalResult.vote),
                  borderColor: voteBackground(modalResult.vote),
                }}
              >
                {verdictText(modalResult.vote)}
              </div>
              <p className="modal-reasoning">{modalResult.reasoning}</p>
              {modalResult.error && (
                <p className="modal-error">ERR: {modalResult.error}</p>
              )}
              {modalResult.sessionId && (
                <p className="modal-session">SESSION: {modalResult.sessionId}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
