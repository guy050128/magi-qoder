"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConsoleMotion, MotionBoundary } from "@/components/ConsoleMotion";
import { isEntryMotion, isIntrusion, MOTION_MS, type ConsolePhase } from "@/lib/console-motion";
import BootSequence from "@/components/BootSequence";
import ProposalTransfer from "@/components/ProposalTransfer";
import MagiDiagram from "@/components/MagiDiagram";
import DeliberationInput from "@/components/DeliberationInput";
import IntroModal from "@/components/IntroModal";
import { SystemHeader, SystemFooter } from "@/components/SystemChrome";
import { MagiId, MagiResult, PartialResults } from "@/types/magi";
import { deliberateTogether } from "@/lib/deliberation-client";
import { UNITS, computeVerdictTrace } from "@/lib/verdict";

export default function ClassicConsole({ enhanced = true }: { enhanced?: boolean }) {
  const [phase, setPhase] = useState<ConsolePhase>("boot");
  const [motionEnabled, setMotionEnabled] = useState(enhanced);
  const [clock, setClock] = useState<{ phase: ConsolePhase; elapsed: number }>({ phase: "boot", elapsed: 0 });
  const elapsed = clock.phase === phase ? clock.elapsed : 0;
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [submittedProposal, setSubmittedProposal] = useState("");
  const [processingUnits, setProcessingUnits] = useState<Set<MagiId>>(new Set());
  const [partialResults, setPartialResults] = useState<PartialResults>({});
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef(false);
  const mounted = useRef(false);
  const motion = useRef(enhanced);
  const assetsReady = useRef(false);
  const waits = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());
  const flushWaits = useCallback(() => {
    waits.current.forEach((resolve, timer) => { clearTimeout(timer); resolve(); });
    waits.current.clear();
  }, []);
  const wait = useCallback((duration: number) => new Promise<void>((resolve) => {
    if (!motion.current || !mounted.current) { resolve(); return; }
    const timer = setTimeout(() => { waits.current.delete(timer); resolve(); }, duration);
    waits.current.set(timer, resolve);
  }), []);
  const disableMotion = useCallback(() => {
    motion.current = false;
    setMotionEnabled(false);
    flushWaits();
    setPhase((previous) => isEntryMotion(previous) || previous === "boot" ? "intro" : previous);
  }, [flushWaits]);
  const assetFailure = useCallback(() => {
    // A missing display asset never blocks the original console or erases paid results.
    assetsReady.current = false;
    motion.current = false;
    setMotionEnabled(false);
    flushWaits();
    setPhase((previous) => isEntryMotion(previous) ? "intro" : previous);
  }, [flushWaits]);
  const markAssetsReady = useCallback(() => { assetsReady.current = true; }, []);
  const finishBoot = useCallback(() => {
    setPhase(motion.current && assetsReady.current ? "boot-link" : "intro");
  }, []);

  useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let savedOff = false;
    try { savedOff = localStorage.getItem("magi-motion") === "reduced"; } catch { /* Optional preference. */ }
    motion.current = enhanced && !media.matches && !savedOff;
    setMotionEnabled(motion.current);
    const change = () => { if (media.matches) disableMotion(); };
    media.addEventListener("change", change);
    return () => {
      mounted.current = false;
      flushWaits();
      media.removeEventListener("change", change);
    };
  }, [enhanced, disableMotion, flushWaits]);

  useEffect(() => {
    const next: Partial<Record<ConsolePhase, ConsolePhase>> = {
      "boot-link": "closure", closure: "defence", defence: "ready-link", "ready-link": "intro",
    };
    const following = next[phase];
    if (!following || !isEntryMotion(phase)) return;
    const duration = MOTION_MS[phase as "boot-link" | "closure" | "defence" | "ready-link"];
    const timer = setTimeout(() => setPhase(following), duration);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!motionEnabled || ["boot", "intro", "ready", "complete", "review"].includes(phase)) return;
    let frame = 0;
    const start = performance.now();
    const tick = () => { setClock({ phase, elapsed: performance.now() - start }); frame = requestAnimationFrame(tick); };
    setClock({ phase, elapsed: 0 });
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, motionEnabled]);

  useEffect(() => {
    if (!enhanced || phase !== "boot" && !isEntryMotion(phase)) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") disableMotion(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [enhanced, phase, disableMotion]);

  const isProcessing = busy;
  const entryPhase = phase === "boot" ? "boot" : phase === "intro" ? "intro" : isEntryMotion(phase) ? "motion" : "ready";
  const startupActive = entryPhase === "boot" || entryPhase === "motion";
  const actualTrace = computeVerdictTrace(partialResults);
  // A complete trace is revealed only after presentation; incomplete responses never make a final.
  const verdictTrace = phase === "complete" ? actualTrace : { ...actualTrace, verdict: null };

  const handleDeliberate = async () => {
    const submittedTopic = topic.trim();
    if (!submittedTopic || activeRequest.current || entryPhase !== "ready") return;
    activeRequest.current = true; // Same-tick Enter events cannot start another paid request.
    setBusy(true);
    setPartialResults({});
    setError(null);
    setProcessingUnits(new Set());
    try {
      if (isIntrusion(submittedTopic)) {
        if (motion.current) {
          setPhase("intrusion");
          await wait(MOTION_MS.intrusion);
          if (!mounted.current) return;
        }
        if (mounted.current) { setTopic(""); setPhase("ready"); }
        return;
      }
      const received: PartialResults = {};
      setSubmittedProposal(submittedTopic);
      setProcessingUnits(new Set(UNITS));
      setPhase(motion.current ? "acceptance" : "review");
      const settledUnits = new Set<MagiId>();
      const settle = (unit: MagiId) => {
        settledUnits.add(unit);
        if (mounted.current) setProcessingUnits((previous) => {
          const next = new Set(previous); next.delete(unit); return next;
        });
      };
      const unitError = (unit: MagiId) => {
        if (mounted.current) setError((previous) => [previous, `${unit}: Connection lost`].filter(Boolean).join(" / "));
        settle(unit);
      };
      // One request starts the original three units together on the server.
      const requests = deliberateTogether(submittedTopic, (result: MagiResult) => {
        received[result.id] = result;
        if (mounted.current) setPartialResults((previous) => ({ ...previous, [result.id]: result }));
        settle(result.id);
      }, unitError).catch(() => {
        UNITS.filter((unit) => !settledUnits.has(unit)).forEach(unitError);
      });
      const minimumReview = (async () => {
        await wait(MOTION_MS.acceptance);
        if (!mounted.current) return;
        setPhase("review");
        await wait(MOTION_MS.review);
      })();
      await Promise.all([requests, minimumReview]);
      if (!mounted.current) return;
      if (UNITS.every((unit) => received[unit])) {
        if (motion.current) { setPhase("result-link"); await wait(MOTION_MS["result-link"]); }
        if (!mounted.current) return;
        if (motion.current) { setPhase("stamps"); await wait(MOTION_MS.stamps); }
        if (!mounted.current) return;
        if (motion.current) { setPhase("final-link"); await wait(MOTION_MS["final-link"]); }
        if (mounted.current) setPhase("complete");
      } else {
        setPhase("ready");
      }
    } finally {
      activeRequest.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const toggleMotion = () => {
    const enable = !motion.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { localStorage.setItem("magi-motion", enable ? "full" : "reduced"); } catch { /* Optional preference. */ }
    if (!enable) disableMotion();
    else { motion.current = true; setMotionEnabled(true); }
  };

  return (
    <>
      {startupActive && <div className="console-startup-cover" aria-hidden="true" />}
      {entryPhase === "boot" && <MotionBoundary onFailure={finishBoot}><BootSequence onComplete={finishBoot} /></MotionBoundary>}
      {enhanced && <MotionBoundary onFailure={assetFailure}>
        <ConsoleMotion phase={phase} elapsed={elapsed} enabled={motionEnabled} onAssetReady={markAssetsReady} onFailure={assetFailure} />
      </MotionBoundary>}
      {enhanced && <div className="console-motion-controls" aria-label="动画设置">
        <button type="button" onClick={toggleMotion}>动画：{motionEnabled ? "完整" : "简化"}</button>
        {(entryPhase === "boot" || entryPhase === "motion" || busy && motionEnabled) && <button type="button" onClick={disableMotion}>跳过动画</button>}
      </div>}
      {entryPhase === "intro" && <IntroModal onClose={() => setPhase("ready")} />}
    {phase === "acceptance" && motionEnabled && <MotionBoundary onFailure={disableMotion}>
      <ProposalTransfer topic={submittedProposal} elapsed={elapsed} duration={MOTION_MS.acceptance} onFailure={disableMotion} />
    </MotionBoundary>}
    <main data-console-phase={phase} className="magi-main" hidden={startupActive} inert={entryPhase !== "ready"} aria-hidden={entryPhase !== "ready"}>
      <SystemHeader />
      <div className="magi-console">
      <div className="console-banner">
        <h1>MAGI <span>/ 三賢人システム</span></h1>
        <span className={`console-status${error ? " console-status-error" : isProcessing ? " console-status-active" : ""}`} role="status">
          <span aria-hidden="true">● </span>
          {error ? "CONNECTION ERROR" : phase === "intrusion" ? "COUNTERMEASURE" : isProcessing ? "DELIBERATION IN PROGRESS" : "AWAITING INPUT"}
        </span>
      </div>
      <div className="system-border">
        <MagiDiagram partialResults={partialResults} processingUnits={processingUnits} trace={verdictTrace}
          motion={{ phase, elapsed, enabled: motionEnabled }} busy={busy} />

        {verdictTrace.verdict === "DEADLOCK" && (
          <div className="verdict-note">
            僵着：三台主机的意见对称，系统不强行判决。按空客 A300 的冗余逻辑，出现分歧时把判断权交给指挥官 —— 请人工裁决。
          </div>
        )}
        {verdictTrace.verdict && verdictTrace.rule === "unanimous-critical" && verdictTrace.dissenters.length > 0 && (
          <div className="verdict-note verdict-note-critical">
            重大议题（{verdictTrace.criticalCount}/3 标记 critical）需全票 APPROVE：否决来自 {verdictTrace.dissenters.join(" / ")}。
          </div>
        )}

        {error && (
          <div className="error-panel">
            <span className="error-icon">⚠</span>
            <span>SYSTEM ERROR: {error}</span>
          </div>
        )}

        <DeliberationInput
          topic={topic}
          onTopicChange={setTopic}
          onSubmit={handleDeliberate}
          isProcessing={isProcessing}
        />
      </div>
      </div>
      <SystemFooter>
      <div className="console-footer-right">
      <span className="boot-footer-code">MAGI SYSTEM<br />DELIBERATION CONTROL</span>
      </div>
      </SystemFooter>
    </main>
    </>
  );
}
