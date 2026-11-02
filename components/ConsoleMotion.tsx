"use client";

import { Component, useEffect, useId, useState, type ReactNode } from "react";
import { clamp, isEntryMotion, MOTION_MS, type ConsolePhase, type DefenceClip } from "@/lib/console-motion";

const BASE = process.env.NEXT_PUBLIC_MAGI_BASE_PATH || "";
type ClipWindow = Window & { MAGI_CLIPS?: { defence?: DefenceClip } };

export class MotionBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Loads only the existing data asset, never the independent HTML app or its runtime. */
export function ConsoleMotion({ phase, elapsed, enabled, onAssetReady, onFailure }: {
  phase: ConsolePhase;
  elapsed: number;
  enabled: boolean;
  onAssetReady: () => void;
  onFailure: () => void;
}) {
  const [clip, setClip] = useState<DefenceClip | null>(null);
  const maskId = useId().replace(/:/g, "");
  useEffect(() => {
    let alive = true;
    const pendingImages: HTMLImageElement[] = [];
    const script = document.createElement("script");
    const fail = () => { if (alive) onFailure(); };
    const timeout = window.setTimeout(fail, 6000);
    const read = async () => {
      try {
        const data = (window as ClipWindow).MAGI_CLIPS?.defence;
        if (!data || data.frameCount !== 22 || data.frames.length !== 22 || data.frameTimes.length !== 22
          || !data.frames.every((src) => src.startsWith("data:image/"))
          || !data.frameTimes.every((time, i) => Math.abs(time - i * 0.1) < 0.0001)) {
          fail(); return;
        }
        await Promise.all(data.frames.map((src) => new Promise<void>((resolve, reject) => {
          const image = new Image();
          pendingImages.push(image);
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Reference frame unavailable"));
          image.src = src;
        })));
        if (!alive) return;
        window.clearTimeout(timeout);
        setClip(data);
        onAssetReady();
      } catch { fail(); }
    };
    script.async = true;
    script.src = `${BASE}/eva/frame-data.js`;
    script.onload = () => { void read(); };
    script.onerror = fail;
    if ((window as ClipWindow).MAGI_CLIPS?.defence) void read();
    else document.head.appendChild(script);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      pendingImages.forEach((image) => { image.onload = null; image.onerror = null; });
    };
  }, [onAssetReady, onFailure]);

  // Prime the first frame beneath boot's fade; loading never removes the opaque layer.
  if (!enabled || phase !== "boot" && !isEntryMotion(phase)) return null;
  const running = phase === "defence" || phase === "ready-link";
  const frame = phase === "ready-link" ? 21 : phase === "defence"
    ? Math.min(21, Math.floor(elapsed / 100)) : 0;
  const transition = phase === "boot-link" || phase === "ready-link";
  const progress = transition ? clamp(elapsed / MOTION_MS[phase]) : 0;
  const open = progress < .61 ? .12 : progress < .73 ? .38 : progress < .85 ? .7 : 1;
  return (
    <div className={`console-motion-entry console-motion-${phase}`} role="status" aria-label="防壁接入动画" aria-hidden={phase === "boot" || undefined}>
      {clip && <svg viewBox="0 0 640 358" preserveAspectRatio="xMidYMid meet" aria-label="666 防壁参考帧；启动闭合为参考重建"
        style={transition && progress >= .5 ? { clipPath: `inset(${(1 - open) * 50}% 0)` } : undefined}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="358">
            <rect width="640" height="358" fill="black" />
            <path d="M0 0H640V358H0ZM320 11a168 168 0 1 0 0 336a168 168 0 1 0 0-336Z" fill="white" fillRule="evenodd" />
            {Array.from({ length: 9 }, (_, i) => {
              const p = running ? 1 : phase === "closure" ? clamp((elapsed / 1000 - i * .11) / 1.32) : 0;
              return <circle key={i} cx="320" cy="179" r={44 + i * 14.5} fill="none" stroke="white"
                strokeWidth="16" pathLength="1" strokeDasharray={`${p * .5} ${(1 - p) * .5}`} strokeDashoffset=".25" />;
            })}
            <g fill="white">
              <rect width="213" height="59" /><rect x="433" width="207" height="60" />
              <rect y="291" width="213" height="67" /><rect x="433" y="291" width="207" height="67" />
              <path d="M230 58H296L349 150H460L427 215H330L278 302L229 274L281 184Z" />
            </g>
            {(running || phase === "closure" && elapsed >= 2200) && <rect width="640" height="358" fill="white" />}
          </mask>
        </defs>
        <image href={clip.frames[frame]} width="640" height="358" mask={`url(#${maskId})`} onError={onFailure} />
      </svg>}
      {clip && transition && <SignalCard phase={phase} />}
    </div>
  );
}

export function SignalCard({ phase }: { phase: ConsolePhase }) {
  const text: Partial<Record<ConsolePhase, [string, string]>> = {
    "boot-link": ["PROTECT NO.666", "防壁 接続"],
    "ready-link": ["MAGI-01 ONLINE", "主制御 復帰"],
    acceptance: ["DELIBERATION", "審 議 開 始"],
    "result-link": ["UNIT VOTE RECORD", "分機 結果"],
    "final-link": ["FINAL DECISION", "最終 裁決"],
  };
  const label = text[phase];
  return label ? <div className="console-motion-signal" aria-hidden="true"><strong>{label[0]}</strong><span>{label[1]}</span></div> : null;
}
