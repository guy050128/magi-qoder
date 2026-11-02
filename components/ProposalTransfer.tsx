"use client";

import { useEffect, useRef } from "react";
import { fitParticleCanvas } from "@/lib/particle-viewport";

interface ProposalTransferProps {
  topic: string;
  elapsed: number;
  duration: number;
  onFailure: () => void;
}
type Point = { x: number; y: number };
type Unit = { rect: DOMRect; path: Path2D; entry: Point; label: DOMRect; text: string; font: string; color: string };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const curve = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const v=1-t;
  return {x:v*v*v*a.x+3*v*v*t*b.x+3*v*t*t*c.x+t*t*t*d.x,y:v*v*v*a.y+3*v*v*t*b.y+3*v*t*t*c.y+t*t*t*d.y};
};
const polygons = [ [[0,0],[1,0],[1,.88],[.75,1],[.25,1],[0,.88]], [[0,0],[.65,0],[1,.44],[1,1],[0,1]], [[.35,0],[1,0],[1,1],[0,1],[0,.44]] ];
const ids = ["BALTHASAR", "CASPER", "MELCHIOR"];

/** A viewport-aligned, presentation-only copy of the visible proposal glyphs. */
export default function ProposalTransfer({ topic, elapsed, duration, onFailure }: ProposalTransferProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(elapsed);
  clock.current = elapsed;
  useEffect(() => {
    const canvas = canvasRef.current;
    const input = document.querySelector<HTMLInputElement>('[data-console-phase="acceptance"] .input-question');
    const ctx = canvas?.getContext("2d");
    if (!canvas || !input || !ctx) { onFailure(); return; }
    let dead = false;
    let frame = 0;
    let needsMeasure = false;
    let glyphs: Point[] = [];
    let units: Unit[] = [];
    let field: { p: Point; unit: number; delay: number; size: number; cool: boolean }[] = [];
    let source: DOMRect;
    let hub: Point;
    let streamScale: number;
    const initialSeed = Array.from(topic).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
    let seed = initialSeed;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const measure = () => {
      if (dead) return;
      try {
        seed = initialSeed;
        fitParticleCanvas(canvas, ctx, window.devicePixelRatio || 1);
        source = input.getBoundingClientRect();
        const grid = document.querySelector('.magi-grid')?.getBoundingClientRect();
        if (!grid || source.width < 2 || grid.width < 2) throw new Error("Missing transfer geometry");
        // A shared rising stream opens directly into three branches. The title
        // is part of the display, not an obstacle that the particles orbit.
        hub = { x: grid.left + grid.width * .5, y: grid.top + grid.height * .79 };
        streamScale = grid.width;
        units = ids.map((id, i) => {
          const element = document.querySelector(`[data-proposal-unit="${id}"] .wise-inner`);
          const label = document.querySelector(`[data-proposal-label="${id}"]`);
          if (!element || !label) throw new Error("Missing unit geometry");
          const rect = element.getBoundingClientRect();
          const path = new Path2D();
          polygons[i].forEach(([x,y], n) => n ? path.lineTo(rect.left + x * rect.width, rect.top + y * rect.height) : path.moveTo(rect.left + x * rect.width, rect.top + y * rect.height));
          path.closePath();
          const entry = i === 0 ? { x: rect.left + rect.width * .5, y: rect.bottom - 3 } : { x: i === 1 ? rect.right - 3 : rect.left + 3, y: rect.top + rect.height * .52 };
          const labelStyle=getComputedStyle(label);
          return { rect, path, entry, label: label.getBoundingClientRect(), text:label.textContent || '',
            font:`${labelStyle.fontStyle} ${labelStyle.fontWeight} ${labelStyle.fontSize} ${labelStyle.fontFamily}`, color:labelStyle.color };
        });
        // Rasterize the real computed input font, respecting its visible scroll window.
        const style = getComputedStyle(input);
        const mask = document.createElement('canvas'); mask.width = Math.ceil(source.width); mask.height = Math.ceil(source.height);
        const m = mask.getContext('2d'); if (!m) throw new Error("No text mask context");
        m.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        m.textBaseline = 'middle'; m.fillStyle = '#fff';
        const left = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = source.width - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        m.save(); m.beginPath(); m.rect(left, 0, right-left, source.height); m.clip();
        m.fillText(input.value || topic, left - input.scrollLeft, source.height / 2); m.restore();
        const pixels = m.getImageData(0,0,mask.width,mask.height).data;
        const sampled: Point[] = [];
        for (let y=1; y<mask.height; y+=1.5) for (let x=1; x<mask.width; x+=1.5) {
          if (pixels[(Math.floor(y)*mask.width+Math.floor(x))*4+3] > 65) sampled.push({ x: source.left+x, y: source.top+y });
        }
        const stride = Math.max(1, Math.ceil(sampled.length/1500)); glyphs = sampled.filter((_,i)=> i%stride===0);
        if (!glyphs.length) throw new Error("No visible proposal glyphs");
        field = [];
        const area = units.reduce((a,u)=>a+u.rect.width*u.rect.height,0);
        const step = Math.max(3, Math.sqrt(area/3900));
        units.forEach((u, unit) => {
          for(let y=u.rect.top+step/2;y<u.rect.bottom;y+=step) for(let x=u.rect.left+step/2;x<u.rect.right;x+=step) {
            const p = { x:x+(random()-.5)*step*.45, y:y+(random()-.5)*step*.45 };
            const px=(p.x-u.rect.left)/u.rect.width, py=(p.y-u.rect.top)/u.rect.height;
            const vertices=polygons[unit]; let inside=false;
            for(let a=0,b=vertices.length-1;a<vertices.length;b=a++) {
              const [ax,ay]=vertices[a], [bx,by]=vertices[b];
              if((ay>py)!==(by>py) && px<(bx-ax)*(py-ay)/(by-ay)+ax) inside=!inside;
            }
            if(inside) field.push({p,unit,delay:random()*.22,size:1.4+random()*1.3,cool:random()<.08});
          }
        });
      } catch { dead = true; onFailure(); }
    };
    measure();
    const draw = () => {
      if(dead) return;
      try {
        if (needsMeasure) { needsMeasure = false; measure(); if (dead) return; }
        const t = Math.min(duration, clock.current);
        canvas.dataset.transferStage = t<250?'scan':t<850?'disintegrate':t<1250?'route':t<2250?'fill':'dissolve';
        ctx.save(); ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,canvas.width,canvas.height); ctx.restore();
        const fade = 1-ease((t-2250)/750);
        const leaving = t>=200;
        input.classList.toggle('proposal-text-transferring', leaving);
        if(t<350) {
          ctx.fillStyle = `rgba(255,198,91,${.12*(1-clamp(t/350))})`;
          ctx.fillRect(source.left+source.width*clamp(t/250),source.top+5,2,source.height-10);
        }
        // Each original stroke point follows one continuous route into one of three units.
        glyphs.forEach((p,i) => {
          const u = units[i%3];
          const jitter = ((i*73)%101)/101;
          const release = 200+jitter*320;
          const lane = (((i*37)%97)/96-.5)*streamScale*.012;
          const join = { x: hub.x+lane, y: hub.y+lane*.12 };
          const split = .58;
          const rise = streamScale*.39;
          const travel = clamp((t-release)/(980-jitter*120));
          const pointAt = (progress: number): Point => {
            // One time curve for the entire trip: no stop or snap at the fork.
            // Both cubic segments share the same tangent and speed at `join`.
            const s = ease(progress);
            const q = s < split
              ? curve(p,
                { x:p.x+(join.x-p.x)*.1, y:p.y-Math.min(55,Math.max(12,(p.y-join.y)*.24)) },
                { x:join.x, y:join.y+rise*split/3 }, join, s/split)
              : curve(join, { x:join.x, y:join.y-rise*(1-split)/3 },
                { x:u.entry.x+(i%3===0?lane*.25:i%3===1?streamScale*.042:-streamScale*.042),
                  y:u.entry.y+(i%3===0?streamScale*.055:streamScale*.012) },
                u.entry, (s-split)/(1-split));
            const drift = Math.sin(progress*Math.PI)*Math.sin(progress*7+i*.71)*streamScale*.0018;
            return { x:q.x+drift, y:q.y+drift*.24 };
          };
          const q = pointAt(travel);
          let alpha = t<200 ? clamp(t/150)*.7 : (1-ease((t-1450-jitter*200)/220))*.95;
          if(alpha<=0) return;
          ctx.globalAlpha=alpha;
          ctx.fillStyle=i%19===0?'#c4f6ff':'#ffc46b';
          const size=t<release?1.1:1.25+(i%4)*.2;
          if(t>release && travel<1) {
            const tail = pointAt(Math.max(0,travel-.022));
            ctx.globalAlpha=alpha*.24; ctx.strokeStyle=ctx.fillStyle; ctx.lineWidth=.8;
            ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(q.x,q.y); ctx.stroke();
            ctx.globalAlpha=alpha;
          }
          ctx.fillRect(q.x,q.y,size,size);
        });
        ctx.globalAlpha=1;
        units.forEach((u,unit) => {
          ctx.save(); ctx.clip(u.path);
          const coverage = ease((t-1250)/850)*fade;
          // Fine dark substrate makes the complete polygon filling unmistakable.
          ctx.fillStyle=`rgba(5,18,23,${coverage*.40})`; ctx.fillRect(u.rect.left,u.rect.top,u.rect.width,u.rect.height);
          field.forEach(f => {
            if(f.unit!==unit) return;
            const arrival=ease((t-1250-f.delay*600)/700);
            if(!arrival) return;
            const q=mix(u.entry,f.p,arrival);
            ctx.globalAlpha=arrival*fade*(f.cool ? .95 : .72);
            ctx.fillStyle=f.cool?'#b7edff':'#ecb55b';
            ctx.fillRect(q.x,q.y,f.size,f.size);
          });
          // Redraw only the exact native letters above the texture, without a backing box.
          ctx.globalAlpha=coverage;
          ctx.font=u.font; ctx.fillStyle=u.color; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(u.text,u.label.left+u.label.width/2,u.label.top+u.label.height/2);
          ctx.restore();
        });
        ctx.globalAlpha=1;
        frame=requestAnimationFrame(draw);
      } catch { dead=true; onFailure(); }
    };
    frame=requestAnimationFrame(draw);
    const invalidate = () => { needsMeasure = true; };
    const observer = new ResizeObserver(invalidate); observer.observe(input); observer.observe(canvas);
    units.forEach((_,i)=> { const el=document.querySelector(`[data-proposal-unit="${ids[i]}"]`); if(el) observer.observe(el); });
    const viewport = window.visualViewport;
    window.addEventListener('resize',invalidate); window.addEventListener('scroll',invalidate,true);
    viewport?.addEventListener('resize',invalidate); viewport?.addEventListener('scroll',invalidate);
    return () => {
      dead=true; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize',invalidate); window.removeEventListener('scroll',invalidate,true);
      viewport?.removeEventListener('resize',invalidate); viewport?.removeEventListener('scroll',invalidate);
      input.classList.remove('proposal-text-transferring');
    };
  }, [topic,duration,onFailure]);
  return <canvas ref={canvasRef} className="proposal-transfer" aria-hidden="true" data-transfer-stage="scan" />;
}
