import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useUnits } from "./units.ts";
import type { AppState } from "./state.ts";
import { explodeForInside, meshForState, partLabel, sceneSummary, type PreviewMesh } from "./preview3d.ts";
import { HOME, INSIDE_FROM, PRESETS, clampView, frame, pick, prepareScene, type DrawItem, type Preset, type View } from "./render3d.ts";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 3D take-apart preview of the volume calculator's box: drag to turn it (two fingers or the
 * wheel to zoom), the slider takes it apart, hover or tap a piece for its name and cut size.
 * Drawn on a canvas by render3d.ts; loaded only when opened (see Preview3D).
 */
export default function Box3D(props: { state: AppState }) {
  const s = props.state;
  const { fmt, system } = useUnits();
  const mm = (x: number) => fmt(x, "mm", system === "imperial" ? 2 : 0);
  const built = useMemo((): { mesh: PreviewMesh } | { error: string } => {
    try {
      return { mesh: meshForState(s) };
    } catch (e) {
      return { error: (e as Error).message };
    }
    // Only what the drawing depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.volume, s.drivers, s.ts.sd_cm2, s.designs]);
  const scene = useMemo(() => ("mesh" in built ? prepareScene(built.mesh) : null), [built]);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ ...HOME });
  const items = useRef<DrawItem[]>([]);
  const raf = useRef(0);
  const anim = useRef(0);
  const [size, setSize] = useState({ w: 320, h: 240 });
  const [explode, setExplode] = useState(0);
  const [ghost, setGhost] = useState(true);
  const [hover, setHover] = useState(-1);
  const [picked, setPicked] = useState(-1);
  const active = hover >= 0 ? hover : picked;
  // The latest of everything the drawing reads, for the animation-frame callback.
  const live = useRef({ scene, explode, ghost, active, size });
  live.current = { scene, explode, ghost, active, size };

  const paint = () => {
    raf.current = 0;
    const c = canvas.current;
    const { scene, explode, ghost, active, size } = live.current;
    if (!c || !scene) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.8;
    const list = frame(scene, view.current, explode, size.w, size.h, { hover: active, ghost });
    items.current = list;
    for (const it of list) {
      const p = it.pts;
      ctx.beginPath();
      ctx.moveTo(p[0]!, p[1]!);
      for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k]!, p[k + 1]!);
      ctx.closePath();
      ctx.fillStyle = it.fill;
      ctx.fill();
      if (it.stroke) {
        ctx.strokeStyle = it.stroke;
        ctx.stroke();
      }
    }
  };
  /** At most one redraw per frame, however many events come in. */
  const redraw = () => {
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  };
  useEffect(redraw, [scene, explode, ghost, active, size]);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(anim.current);
  }, []);
  // A new shape: nothing is picked any more.
  useEffect(() => {
    setPicked(-1);
    setHover(-1);
  }, [scene]);

  // Fit the canvas to its box: as wide as the card, three quarters as tall (at most 360 px).
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(200, Math.round(e!.contentRect.width));
      setSize({ w, h: Math.min(360, Math.round(w * 0.75)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!scene]);

  const setView = (v: View) => {
    cancelAnimationFrame(anim.current);
    view.current = clampView(v);
    redraw();
  };
  /** Turn to a view: eased over a quarter second, or at once when motion is reduced. */
  const goTo = (to: View) => {
    cancelAnimationFrame(anim.current);
    const from = { ...view.current };
    // The short way round.
    const dy = ((((to.yaw - from.yaw + 180) % 360) + 360) % 360) - 180;
    if (reducedMotion()) return setView(to);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 250);
      const e = k * (2 - k);
      view.current = clampView({ yaw: from.yaw + dy * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e });
      paint();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const preset = (p: Preset) => goTo({ yaw: PRESETS[p].yaw, pitch: PRESETS[p].pitch, zoom: view.current.zoom });

  // Wheel zoom (a listener of our own: React's wheel handler can't stop the page scrolling).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView({ ...view.current, zoom: view.current.zoom * Math.exp(-e.deltaY * 0.0015) });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!scene]);

  // Pointers: one drags to turn, two pinch to zoom; a tap (no drag) picks a piece.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });
  const local = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: 0 };
    else gesture.current.pinch = spread();
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const last = pointers.current.get(e.pointerId);
    if (!last) {
      if (e.pointerType === "mouse") {
        const k = pick(items.current, p.x, p.y);
        if (k !== hover) setHover(k);
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2) {
      const d = spread();
      if (gesture.current.pinch > 0 && d > 0) setView({ ...view.current, zoom: view.current.zoom * (d / gesture.current.pinch) });
      gesture.current.pinch = d;
      gesture.current.moved += 10;
      return;
    }
    const dx = p.x - last.x, dy = p.y - last.y;
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    setView({ ...view.current, yaw: view.current.yaw + dx * 0.5, pitch: view.current.pitch + dy * 0.5 });
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const was = pointers.current.size;
    pointers.current.delete(e.pointerId);
    if (was === 1 && gesture.current.moved < 6) {
      const p = local(e);
      const k = pick(items.current, p.x, p.y);
      setPicked(k === picked ? -1 : k);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    const v = view.current;
    const step = e.shiftKey ? 2 : 10;
    const next: Partial<View> | null =
      e.key === "ArrowLeft" ? { yaw: v.yaw - step } :
      e.key === "ArrowRight" ? { yaw: v.yaw + step } :
      e.key === "ArrowUp" ? { pitch: v.pitch + step } :
      e.key === "ArrowDown" ? { pitch: v.pitch - step } :
      e.key === "+" || e.key === "=" ? { zoom: v.zoom * 1.15 } :
      e.key === "-" || e.key === "_" ? { zoom: v.zoom / 1.15 } :
      null;
    if (next) {
      e.preventDefault();
      setView({ ...v, ...next });
    } else if (e.key === "Home" || e.key === "0") {
      e.preventDefault();
      goTo(HOME);
    }
  };

  if (!scene || "error" in built) {
    return <p className="warn">Can't draw this shape in 3D: {"error" in built ? built.error : ""}</p>;
  }
  const parts = scene.parts.map((p) => p.source);
  const shown = active >= 0 ? parts[active] : undefined;
  return (
    <div className="box3d">
      <div className="box3d-stage" ref={wrap}>
        <canvas
          ref={canvas}
          className="box3d-canvas"
          style={{ width: size.w, height: size.h }}
          role="img"
          tabIndex={0}
          aria-label={`${sceneSummary(s.volume.shape, parts)} Drag or use the arrow keys to turn it, plus and minus to zoom, Home to reset.`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={(e) => e.pointerType === "mouse" && !pointers.current.size && setHover(-1)}
          onKeyDown={onKey}
        />
      </div>
      {"mesh" in built && built.mesh.notes.map((n) => (
        <p key={n} className="warn">
          {n}
        </p>
      ))}
      <p className="box3d-label" aria-live="polite">
        {shown ? partLabel(shown, mm) : "Hover or tap a piece for its size."}
      </p>
      <div className="box3d-controls">
        <label className="box3d-slider">
          <span>Take apart</span>
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.currentTarget.value))} aria-valuetext={`${Math.round(explode * 100)}%`} />
        </label>
        <div className="unit-switch" role="group" aria-label="View">
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <button key={p} type="button" onClick={() => preset(p)}>
              {PRESETS[p].label}
            </button>
          ))}
          <button type="button" onClick={() => goTo(HOME)} title="Back to the starting view and zoom">
            Reset
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={ghost}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setGhost(on);
              setExplode(explodeForInside(on, explode));
            }}
          />{" "}
          Show the inside{ghost && explode <= INSIDE_FROM ? <span className="hint"> (take it apart to see it)</span> : null}
        </label>
      </div>
    </div>
  );
}
