import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baffleTransfer, baffleTrustedTo, type Baffle } from "../src/baffle.ts";

/**
 * The baffle step against The Edge 4.x (Tolvan Data), run 17 Nov 2026. Each case's `.edge`
 * project is in fixtures/the-edge (The Edge's y is from the bottom, ours from the top). The Edge
 * gives level relative to full space (0 dB in the bass, +6 dB at the top), so ours is |H| + 6.02 dB.
 * Point sources: to 2 kHz and 5 kHz. Cones: up to baffleTrustedTo (cone ka = 2).
 */
const dir = new URL("./fixtures/the-edge/", import.meta.url);
const AREA = (mm: number) => Math.PI * (mm / 20) ** 2;

interface Case {
  file: string;
  b: Baffle;
  /** Max |ΔdB| to 2 kHz (or to the trusted frequency for a cone). */
  db2k: number;
  /** Max |ΔdB| to 5 kHz (point sources only). */
  db5k?: number;
  /** Max |Δphase| (degrees) over the same range as db2k. */
  deg: number;
}

const CASES: Case[] = [
  // Speaker dragged by hand in The Edge (status bar: 124.5 mm, 198.2 mm from the bottom).
  { file: "bc1", b: { width: 0.25, height: 0.4, x: 0.1245, y: 0.2018, distance: 100 }, db2k: 0.1, db5k: 0.25, deg: 0.6 },
  { file: "bc2", b: { width: 0.25, height: 0.4, x: 0.125, y: 0.2, distance: 1 }, db2k: 0.1, db5k: 0.2, deg: 0.5 },
  { file: "bc3", b: { width: 0.25, height: 0.4, x: 0.125, y: 0.2, distance: 2 }, db2k: 0.1, db5k: 0.2, deg: 0.5 },
  { file: "bc4", b: { width: 0.25, height: 0.4, x: 0.08, y: 0.12, distance: 1 }, db2k: 0.1, db5k: 0.1, deg: 0.5 },
  { file: "bc5", b: { width: 0.4, height: 0.6, x: 0.2, y: 0.3, distance: 1 }, db2k: 0.12, db5k: 0.2, deg: 0.8 },
  { file: "bc6", b: { width: 0.4, height: 0.6, x: 0.12, y: 0.18, distance: 2 }, db2k: 0.1, db5k: 0.15, deg: 0.5 },
  // The Edge's disc at its default density (3) is itself ~0.2 dB off its density-10 result.
  { file: "bc7", b: { width: 0.25, height: 0.4, x: 0.08, y: 0.12, distance: 1, sd_cm2: AREA(130) }, db2k: 0.3, deg: 3 },
  { file: "bd8", b: { width: 0.4, height: 0.6, x: 0.2, y: 0.3, distance: 1, sd_cm2: AREA(200) }, db2k: 0.22, deg: 6 },
  { file: "bd9", b: { width: 0.25, height: 0.4, x: 0.125, y: 0.2, distance: 100, sd_cm2: AREA(130) }, db2k: 0.12, deg: 1.2 },
];

function read(file: string): number[][] {
  const text = readFileSync(new URL(`${file}.txt`, dir), "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split("\t").map(Number));
}

const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

for (const c of CASES) {
  test(`The Edge ${c.file}: ${c.b.width * 100} × ${c.b.height * 100} cm, ${c.b.sd_cm2 ? "cone" : "point"}, ${c.b.distance} m`, () => {
    const rows = read(c.file);
    const f = rows.map((r) => r[0]!);
    const { re, im } = baffleTransfer(f, c.b);
    const top = c.b.sd_cm2 ? baffleTrustedTo(c.b) : 2000;
    let dbMax = 0;
    let db5 = 0;
    let degMax = 0;
    for (let i = 0; i < f.length; i++) {
      const ours = 10 * Math.log10(re[i]! ** 2 + im[i]! ** 2) + 20 * Math.log10(2);
      const d = Math.abs(ours - rows[i]![1]!);
      const p = Math.abs(wrap((Math.atan2(im[i]!, re[i]!) * 180) / Math.PI - rows[i]![2]!));
      if (f[i]! <= top) {
        dbMax = Math.max(dbMax, d);
        degMax = Math.max(degMax, p);
      }
      if (f[i]! <= 5000) db5 = Math.max(db5, d);
    }
    assert.ok(dbMax <= c.db2k, `${dbMax.toFixed(3)} dB to ${Math.round(top)} Hz`);
    if (c.db5k !== undefined) assert.ok(db5 <= c.db5k, `${db5.toFixed(3)} dB to 5 kHz`);
    assert.ok(degMax <= c.deg, `${degMax.toFixed(2)}° to ${Math.round(top)} Hz`);
  });
}
