"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BootSequence from "@/components/BootSequence";
import IntroModal from "@/components/IntroModal";
import { deliberateMelchior, deliberateBalthasar, deliberateCasper } from "@/app/actions";
import { UNITS, computeVerdictTrace } from "@/lib/verdict";
import type { VerdictTrace } from "@/lib/verdict";
import type { MagiId, MagiResult, PartialResults } from "@/types/magi";

const BASE = process.env.NEXT_PUBLIC_MAGI_BASE_PATH || "";
const ACTIONS = {
  MELCHIOR: deliberateMelchior,
  BALTHASAR: deliberateBalthasar,
  CASPER: deliberateCasper,
} satisfies Record<MagiId, (topic: string) => Promise<MagiResult>>;

interface RoundSnapshot {
  requestId: string;
  topic: string;
  results: PartialResults;
  trace: VerdictTrace;
  completed: boolean;
  error?: string;
}

function reducedMotion() {
  try {
    if (window.localStorage.getItem("magi-motion") === "reduced") return true;
  } catch {
    // Browser privacy settings can disable storage independently of motion preferences.
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function LiveExperience() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<string | null>(null);
  const lastRound = useRef<RoundSnapshot | null>(null);
  const rendererFailed = useRef(false);
  const acceptedRequests = useRef(new Set<string>());
  const bootDone = useRef(false);
  const childReady = useRef(false);
  const startSent = useRef(false);
  const lastContact = useRef(0);
  const motionRef = useRef(false);
  const mounted = useRef(false);
  const [phase, setPhase] = useState<"initializing" | "boot" | "ready">("initializing");
  const [bootKey, setBootKey] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [height, setHeight] = useState(900);
  const [failure, setFailure] = useState<string | null>(null);
  const [results, setResults] = useState<PartialResults>({});
  const [unitErrors, setUnitErrors] = useState<Partial<Record<MagiId, string>>>({});
  const [processing, setProcessing] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<MagiId | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const post = useCallback((message: object) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const start = useCallback(() => {
    if (!bootDone.current || !childReady.current || startSent.current || rendererFailed.current) return;
    startSent.current = true;
    if (lastRound.current) {
      post({ type: "magi:resume", ...lastRound.current });
    } else {
      post({ type: "magi:start", reduced: motionRef.current });
    }
  }, [post]);

  const finishBoot = useCallback(() => {
    bootDone.current = true;
    setPhase("ready");
    start();
  }, [start]);

  const clearResults = useCallback(() => {
    lastRound.current = null;
    setResults({});
    setUnitErrors({});
    setSelectedUnit(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    motionRef.current = reducedMotion();
    lastContact.current = Date.now();
    if (motionRef.current) finishBoot();
    else setPhase("boot");

    const deliberate = async (requestId: string, topic: string) => {
      // The ref is set before any asynchronous work, so same-tick messages cannot overlap.
      activeRequest.current = requestId;
      acceptedRequests.current.add(requestId);
      // Keep duplicate protection bounded across long-lived console sessions.
      if (acceptedRequests.current.size > 100) {
        const oldest = acceptedRequests.current.values().next().value;
        if (oldest !== undefined) acceptedRequests.current.delete(oldest);
      }
      clearResults();
      const settledResults: PartialResults = {};
      const failed: string[] = [];
      lastRound.current = {
        requestId,
        topic,
        results: {},
        trace: computeVerdictTrace({}),
        completed: false,
      };
      setProcessing(true);
      post({ type: "magi:accepted", requestId });
      await Promise.allSettled(UNITS.map(async (unit) => {
        try {
          const result = await ACTIONS[unit](topic);
          settledResults[unit] = result;
          lastRound.current = {
            requestId,
            topic,
            results: { ...settledResults },
            trace: computeVerdictTrace(settledResults),
            completed: false,
            ...(failed.length ? { error: failed.join("\n") } : {}),
          };
          if (!mounted.current) return;
          setResults({ ...settledResults });
          post({ type: "magi:result", requestId, result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Connection lost";
          failed.push(`${unit}: ${message}`);
          lastRound.current = {
            requestId,
            topic,
            results: { ...settledResults },
            trace: computeVerdictTrace(settledResults),
            completed: false,
            error: failed.join("\n"),
          };
          if (mounted.current) setUnitErrors((previous) => ({ ...previous, [unit]: message }));
        }
      }));
      // Keep completed paid results available even after the overlap guard is released.
      const snapshot: RoundSnapshot = {
        requestId,
        topic,
        results: { ...settledResults },
        trace: computeVerdictTrace(settledResults),
        completed: true,
        ...(failed.length ? { error: failed.join("\n") } : {}),
      };
      lastRound.current = snapshot;
      if (!mounted.current) return;
      // A transport failure has no fabricated vote. The actual partial trace stays waiting.
      if (snapshot.error) post({ type: "magi:error", requestId, message: snapshot.error });
      post({ type: "magi:complete", requestId, trace: snapshot.trace });
      activeRequest.current = null;
      setProcessing(false);
    };

    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      const message = data as Record<string, unknown>;
      if (typeof message.type !== "string") return;
      lastContact.current = Date.now();
      switch (message.type) {
        case "magi:ready": {
          childReady.current = true;
          setFrameReady(true);
          if (!rendererFailed.current) setFailure(null);
          start();
          break;
        }
        case "magi:failure":
          rendererFailed.current = true;
          setFailure("EVA 界面运行失败，请进入原版控制台。");
          break;
        case "magi:height":
          if (typeof message.height === "number" && Number.isFinite(message.height)) {
            setHeight(Math.min(5000, Math.max(500, Math.ceil(message.height))));
          }
          break;
        case "magi:proposal": {
          const requestId = typeof message.requestId === "string" ? message.requestId : "";
          if (!requestId.trim() || requestId.length > 128) {
            post({ type: "magi:error", requestId, message: "Invalid request ID." });
            return;
          }
          if (activeRequest.current) {
            post({ type: "magi:error", requestId, message: "A deliberation is already in progress." });
            return;
          }
          if (acceptedRequests.current.has(requestId)) {
            post({ type: "magi:error", requestId, message: "This request has already been submitted." });
            return;
          }
          if (!bootDone.current || !childReady.current || rendererFailed.current) {
            post({ type: "magi:error", requestId, message: "MAGI is still initializing." });
            return;
          }
          if (typeof message.topic !== "string" || !message.topic.trim() || message.topic.trim().length > 500) {
            post({ type: "magi:error", requestId, message: "Enter a topic of 1–500 characters." });
            return;
          }
          void deliberate(requestId, message.topic.trim());
          break;
        }
        case "magi:unit":
          if (UNITS.includes(message.unitId as MagiId)) {
            setHelpOpen(false);
            setSelectedUnit(message.unitId as MagiId);
          }
          break;
        case "magi:classic": {
          const destination = new URL(window.location.href);
          destination.search = "?view=classic";
          destination.hash = "";
          window.location.assign(destination.pathname + destination.search);
          break;
        }
        case "magi:help":
          setSelectedUnit(null);
          setHelpOpen(true);
          break;
        case "magi:clear":
          if (!activeRequest.current) clearResults();
          break;
        case "magi:restart":
          if (activeRequest.current) return;
          clearResults();
          setHelpOpen(false);
          motionRef.current = reducedMotion();
          startSent.current = false;
          bootDone.current = false;
          if (motionRef.current) finishBoot();
          else {
            setBootKey((previous) => previous + 1);
            setPhase("boot");
          }
          break;
      }
    };

    window.addEventListener("message", receive);
    post({ type: "magi:ping" });
    // Ready doubles as a heartbeat, so a missing renderer/runtime has an actionable fallback.
    const watchdog = window.setInterval(() => {
      post({ type: "magi:ping" });
      if (Date.now() - lastContact.current > 20000) {
        setFailure("EVA 界面未响应，请进入原版控制台。");
      }
    }, 3000);
    return () => {
      mounted.current = false;
      window.removeEventListener("message", receive);
      window.clearInterval(watchdog);
    };
  }, [clearResults, finishBoot, post, start]);

  useEffect(() => {
    if (selectedUnit && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selectedUnit]);

  useEffect(() => {
    if (!helpOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [helpOpen]);

  const visible = phase === "ready" && frameReady && !failure;
  const selectedResult = selectedUnit ? results[selectedUnit] : undefined;
  const selectedError = selectedUnit ? unitErrors[selectedUnit] : undefined;

  return (
    <div className="eva-live-root">
      <link rel="stylesheet" href={`${BASE}/eva/fonts.css`} />
      {phase === "boot" && <BootSequence key={bootKey} onComplete={finishBoot} />}
      {!visible && phase !== "boot" && (
        <div className="eva-live-loading" role="status">
          <p>{failure || "MAGI / 正在连接界面…"}</p>
          <a href="?view=classic">进入原版控制台 / CLASSIC CONSOLE</a>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className={`eva-live-frame${visible ? " eva-live-frame-visible" : ""}`}
        title="MAGI EVA 三贤人控制台"
        allowFullScreen
        src={`${BASE}/eva/index.html?v=20261022-live1`}
        style={{ height }}
        inert={!visible || helpOpen || selectedUnit !== null}
        aria-hidden={!visible}
        onLoad={() => {
          rendererFailed.current = false;
          setFailure(null);
          childReady.current = false;
          startSent.current = false;
          setFrameReady(false);
          lastContact.current = Date.now();
          post({ type: "magi:ping" });
        }}
        onError={() => {
          rendererFailed.current = true;
          setFailure("EVA 界面加载失败，请进入原版控制台。");
        }}
      />
      <nav className="eva-live-navigation" aria-label="界面切换" inert={phase !== "ready"}>
        <a href="?view=classic">原版控制台 / CLASSIC CONSOLE</a>
      </nav>
      {helpOpen && (
        <div className="eva-live-help" role="dialog" aria-modal="true" aria-label="MAGI 操作说明"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.classList.contains("modal-overlay")) setHelpOpen(false);
          }}>
          <IntroModal onClose={() => setHelpOpen(false)} />
        </div>
      )}
      {selectedUnit && (
        <dialog ref={dialogRef} className="eva-live-details" aria-labelledby="eva-unit-title"
          onCancel={(event) => { event.preventDefault(); setSelectedUnit(null); }}
          onClick={(event) => { if (event.target === event.currentTarget) setSelectedUnit(null); }}>
          <div className="eva-live-details-content">
            <header className="eva-live-details-header">
              <h2 id="eva-unit-title">{selectedUnit}</h2>
              <button type="button" onClick={() => setSelectedUnit(null)} aria-label="关闭详情">×</button>
            </header>
            {selectedResult ? (
              <>
                <dl className="eva-live-metadata">
                  <div><dt>模型</dt><dd>{selectedResult.model}</dd></div>
                  <div><dt>投票</dt><dd>{selectedResult.vote}</dd></div>
                  <div><dt>推理级别</dt><dd>{selectedResult.reasoningLevel}</dd></div>
                  {selectedResult.isCritical !== undefined && <div><dt>重大议题</dt><dd>{selectedResult.isCritical ? "是" : "否"}</dd></div>}
                  {selectedResult.elapsedMs !== undefined && <div><dt>耗时</dt><dd>{selectedResult.elapsedMs} ms</dd></div>}
                  {selectedResult.credits !== undefined && <div><dt>消耗</dt><dd>{selectedResult.credits}</dd></div>}
                  {selectedResult.sessionId && <div><dt>会话</dt><dd>{selectedResult.sessionId}</dd></div>}
                </dl>
                {selectedResult.error && <p className="eva-live-unit-error" role="alert">{selectedResult.error}</p>}
                <p className="eva-live-reasoning">{selectedResult.reasoning}</p>
              </>
            ) : (
              <p className="eva-live-reasoning">{selectedError || (processing ? "该主机正在审议，收到结果后将在此显示。" : "尚无审议结果。提交议题后可在此查看该主机的真实推理。")}</p>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
