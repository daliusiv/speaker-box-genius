import { parseCurve, thinCurve } from "@sbg/engine";
import type { RoomCurve } from "./state.ts";

/** A room-gain file as a curve: at least 2 points, thinned to 1/12 octave (2 Hz–20 kHz) to travel in a link. */
export async function readRoomCurve(file: File): Promise<RoomCurve> {
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  return roomCurveFrom(text, file.name);
}

export function roomCurveFrom(text: string, fileName: string): RoomCurve {
  const raw = parseCurve(text, "spl", 2);
  // Few points (a hand-made profile): keep them all. Many (a measurement): thin them.
  const c = raw.f.length <= 200 ? raw : thinCurve(raw, 12, 2, 20000);
  // Duplicate frequencies would break the interpolation: keep the first of each.
  const f: number[] = [];
  const v: number[] = [];
  c.f.forEach((x, i) => {
    if (f.length === 0 || x > f[f.length - 1]!) {
      f.push(Number(x.toPrecision(5)));
      v.push(Math.round(c.v[i]! * 100) / 100);
    }
  });
  if (f.length < 2) throw new Error("need at least 2 different frequencies");
  if (v.some((x) => Math.abs(x) > 60)) throw new Error("gains must be within ±60 dB (relative to 0 dB where the space adds nothing)");
  return { name: fileName.replace(/\.[^.]+$/, "").slice(0, 40), f, v };
}
