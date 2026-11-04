import { useMemo, useState } from "react";
import { lineProfile, simulate, type DriverInput, type LineProfile, type SimulationOptions } from "@sbg/engine";
import { lineInputOf, PORT_LIMIT } from "./sim.ts";
import type { LineDesign } from "./state.ts";

const F_MIN = 10;
const F_MAX = 500;
const fmt = (f: number) => (f < 100 ? f.toFixed(1) : f.toFixed(0));

/** The line's resonances: peaks of its acoustic impedance (Za), lowest first. */
function resonances(driver: DriverInput, d: LineDesign, sim: SimulationOptions): number[] {
  try {
    const r = simulate(driver, lineInputOf(d), { ...sim, fMin: 12, fMax: F_MAX, points: 400 });
    const za = r.acousticImpedance;
    if (!za) return [];
    const m = za.resistance.map((re, i) => Math.hypot(re, za.reactance[i]!));
    const out: number[] = [];
    for (let i = 1; i < m.length - 1; i++) if (m[i]! > m[i - 1]! && m[i]! >= m[i + 1]! && m[i]! > 1.15) out.push(r.freq[i]!);
    return out.slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Pressure and air speed along the line at one frequency: where the standing waves put the
 * pressure (high at closed ends) and the moving air (where stuffing does most).
 */
export function LineProfileView(p: { d: LineDesign; driver: DriverInput | null; sim: SimulationOptions; fb: number | null }) {
  const { d, driver, sim } = p;
  const res = useMemo(() => (driver ? resonances(driver, d, sim) : []), [driver, d, sim]);
  const [pick, setPick] = useState<number | null>(null);
  const f = pick ?? res[0] ?? p.fb ?? 50;
  const prof = useMemo<LineProfile | string>(() => {
    if (!driver) return "Enter the driver's parameters first.";
    try {
      return lineProfile(driver, lineInputOf(d), f, sim);
    } catch (e) {
      return (e as Error).message;
    }
  }, [driver, d, sim, f]);
  // The port-speed setting: RMS when the chart limit has been scaled up by √2.
  const rms = (sim.portVelocityLimit ?? PORT_LIMIT) > PORT_LIMIT * 1.2;
  const slider = Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);

  return (
    <details className="line-fold">
      <summary>Pressure and air speed inside</summary>
      <div className="profile-controls">
        <label className="profile-freq">
          <span>
            Frequency <b>{fmt(f)} Hz</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={slider}
            aria-label="Frequency"
            onChange={(e) => setPick(Math.round(F_MIN * (F_MAX / F_MIN) ** Number(e.target.value) * 10) / 10)}
          />
        </label>
        {res.length > 0 && (
          <div className="profile-res">
            <span className="hint">Resonances:</span>
            {res.map((r) => (
              <button key={r} type="button" className={`chip${Math.abs(r - f) < 0.05 ? " on" : ""}`} onClick={() => setPick(r)}>
                {fmt(r)} Hz
              </button>
            ))}
          </div>
        )}
      </div>
      {typeof prof === "string" ? <p className="hint">{prof}</p> : <ProfileDrawing d={d} prof={prof} rms={rms} />}
      <p className="hint">
        At this frequency and the drive on the Signal tab, from the {d.end === "horn" ? "throat" : "closed end"} (left) to the{" "}
        {d.end === "port" ? "port" : "mouth"} (right). Pressure is highest where the air is squeezed (closed ends, nodes of the standing
        wave); air speed is highest where it moves most. Stuffing does most where the air moves fast, so put it where the unwanted
        resonance&rsquo;s air speed is high. A driver at a pressure dip of a resonance barely excites it.
      </p>
    </details>
  );
}

function ProfileDrawing({ d, prof, rms }: { d: LineDesign; prof: LineProfile; rms: boolean }) {
  const W = 400;
  const H = 96;
  const GAP = 26;
  const L = { l: 38, r: 10, t: 14 };
  const pts = prof.points;
  const xMax = Math.max(...pts.map((q) => q.x_cm), 1);
  const xOf = (cm: number) => L.l + (cm / xMax) * (W - L.l - L.r);
  const vScale = rms ? Math.SQRT1_2 : 1;
  const vel = pts.map((q) => q.velocity_ms * vScale);
  const spl = pts.map((q) => q.spl_db);
  const vMaxRaw = Math.max(...vel, 1e-6);
  const vStep = niceStep(vMaxRaw);
  const vTop = Math.ceil(vMaxRaw / vStep) * vStep;
  const sHi = Math.ceil(Math.max(...spl) / 10) * 10;
  const sLo = Math.max(sHi - 40, Math.floor(Math.min(...spl) / 10) * 10);
  const y1 = (db: number) => L.t + (1 - (Math.max(db, sLo) - sLo) / (sHi - sLo)) * H;
  const y2 = (v: number) => L.t + H + GAP + (1 - v / vTop) * H;
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${xOf(pts[i]!.x_cm).toFixed(1)},${y.toFixed(1)}`).join("");
  // Stuffed stretches and the port, shaded behind both plots.
  const bands: { a: number; b: number; cls: string }[] = [];
  let pos = 0;
  for (const s of d.sections) {
    if (s.fill_kgm3 > 0) bands.push({ a: pos, b: pos + s.length_cm, cls: "profile-stuffed" });
    pos += s.length_cm;
  }
  if (xMax > prof.length_cm + 0.5) bands.push({ a: prof.length_cm, b: xMax, cls: "profile-port" });
  const marks = [{ x: d.end === "horn" ? 0 : d.driverAt_cm, label: d.end === "tapped" ? "rear" : "driver" }];
  if (d.end === "tapped") marks.push({ x: d.tapAt_cm, label: "tap" });
  const iS = spl.indexOf(Math.max(...spl));
  const iV = vel.indexOf(Math.max(...vel));
  const where = (cm: number) =>
    cm < 0.5 ? (d.end === "horn" ? "the throat" : "the closed end") : cm > xMax - 0.5 ? (d.end === "port" ? "the port" : "the mouth") : `${Math.round(cm)} cm along`;
  const ticks = xTicks(xMax);
  const bottom = L.t + 2 * H + GAP;
  const limitShown = vTop >= PORT_LIMIT * 0.5;

  return (
    <>
      <svg className="line-drawing profile" viewBox={`0 0 ${W} ${bottom + 18}`} role="img" aria-label={`Pressure and air speed along the line at ${fmt(prof.f)} Hz`}>
        {bands.map((b, k) => (
          <g key={k}>
            <rect x={xOf(b.a)} y={L.t} width={xOf(b.b) - xOf(b.a)} height={H} className={b.cls} />
            <rect x={xOf(b.a)} y={L.t + H + GAP} width={xOf(b.b) - xOf(b.a)} height={H} className={b.cls} />
          </g>
        ))}
        {[0, 1].map((k) => (
          <rect key={k} x={L.l} y={L.t + k * (H + GAP)} width={W - L.l - L.r} height={H} className="profile-frame" />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} x2={xOf(t)} y1={L.t} y2={L.t + H} className="profile-grid" />
            <line x1={xOf(t)} x2={xOf(t)} y1={L.t + H + GAP} y2={bottom} className="profile-grid" />
            <text x={xOf(t)} y={bottom + 12} textAnchor="middle" className="line-label">
              {t}
            </text>
          </g>
        ))}
        {[sLo, (sLo + sHi) / 2, sHi].map((v) => (
          <text key={v} x={L.l - 4} y={y1(v) + 3} textAnchor="end" className="line-label">
            {v}
          </text>
        ))}
        {[0, vTop / 2, vTop].map((v) => (
          <text key={v} x={L.l - 4} y={y2(v) + 3} textAnchor="end" className="line-label">
            {Number(v.toFixed(2))}
          </text>
        ))}
        <text x={W - L.r} y={L.t - 4} textAnchor="end" className="line-label">
          Pressure (dB SPL inside)
        </text>
        <text x={W - L.r} y={L.t + H + GAP - 4} textAnchor="end" className="line-label">
          Air speed (m/s {rms ? "RMS" : "peak"})
        </text>
        {limitShown && PORT_LIMIT <= vTop && <line x1={L.l} x2={W - L.r} y1={y2(PORT_LIMIT)} y2={y2(PORT_LIMIT)} className="profile-limit" />}
        {marks.map((m) => (
          <g key={m.label}>
            <line x1={xOf(m.x)} x2={xOf(m.x)} y1={L.t} y2={bottom} className="profile-driver" />
            <text x={xOf(m.x) + 3} y={L.t - 4} textAnchor="start" className="line-label">
              {m.label}
            </text>
          </g>
        ))}
        <path d={path(spl.map(y1))} className="profile-p" />
        <path d={path(vel.map(y2))} className="profile-v" />
        <text x={W - L.r} y={bottom + 12} textAnchor="end" className="line-label">
          {Math.round(xMax)} cm
        </text>
      </svg>
      <p className="hint">
        At {fmt(prof.f)} Hz: pressure highest at {where(pts[iS]!.x_cm)} ({Math.round(spl[iS]!)} dB), air fastest at {where(pts[iV]!.x_cm)} (
        {vel[iV]!.toFixed(vel[iV]! < 1 ? 2 : 1)} m/s). Cone excursion {prof.excursion_mm.toFixed(prof.excursion_mm < 1 ? 2 : 1)} mm.
        {limitShown && vel[iV]! > PORT_LIMIT ? ` ⚠ Above ${PORT_LIMIT} m/s: audible chuffing likely at this drive.` : ""}
      </p>
    </>
  );
}

function niceStep(max: number): number {
  const raw = max / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function xTicks(max: number): number[] {
  const step = [5, 10, 20, 25, 50, 100, 200].find((s) => max / s <= 7) ?? 500;
  const out: number[] = [];
  for (let t = 0; t <= max - step * 0.7; t += step) out.push(t);
  return out;
}
