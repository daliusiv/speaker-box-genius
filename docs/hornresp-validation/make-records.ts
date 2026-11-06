import { writeFileSync, mkdirSync } from "node:fs";
import { toHornresp } from "../../packages/web/src/hornresp.ts";
import { DEFAULT_STATE, newDesign, type LineDesign, type LineSection } from "../../packages/web/src/state.ts";
const driver = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1, xmax_mm: 5.5, pe_w: 80 };
// Two more drivers, the other ends of what lines are built with: a 12" subwoofer with a large
// inductance and a 4" full-range (both fictional, as Hornresp only needs the numbers).
const SUB = { fs: 24, qms: 4.2, qes: 0.42, vas_l: 85, re: 3.4, sd_cm2: 480, le_mh: 2.4, xmax_mm: 14, pe_w: 400 };
const FR = { fs: 75, qms: 3.5, qes: 0.55, vas_l: 3.2, re: 6.2, sd_cm2: 53, le_mh: 0.08, xmax_mm: 3, pe_w: 25 };
const base = newDesign("line", DEFAULT_STATE.designs) as LineDesign;
const sec = (length_cm: number, endArea_cm2: number, taper: LineSection["taper"] = "linear", fill_kgm3 = 0): LineSection => ({ length_cm, endArea_cm2, taper, fill_kgm3 });
const cases: [string, string, Partial<LineDesign>][] = [
  ["01-straight-tl", "Straight TL, driver at the closed end, 150 cm x 200 cm2, empty", { end: "open", closedArea_cm2: 200, driverAt_cm: 0, sections: [sec(150, 200)] }],
  ["02-tapered-tl", "Tapered TL (Par), 300 -> 120 cm2, 180 cm, driver at the closed end, empty", { end: "open", closedArea_cm2: 300, driverAt_cm: 0, sections: [sec(180, 120)] }],
  ["03-offset-tl", "Offset-driver TL, 200 cm2 straight, 210 cm, driver at L/3 (70 cm), empty", { end: "open", closedArea_cm2: 200, driverAt_cm: 70, sections: [sec(70, 200), sec(140, 200)] }],
  ["04-tqwt", "TQWT (Con), 40 -> 400 cm2, 170 cm, driver at 57 cm, empty", { end: "open", closedArea_cm2: 40, driverAt_cm: 57, sections: [sec(170, 400, "conical")] }],
  ["05-mltl", "MLTL, 220 cm2 straight, 110 cm, driver at 27.5 cm, 6 cm x 12 cm port, empty", { end: "port", closedArea_cm2: 220, driverAt_cm: 27.5, sections: [sec(27.5, 220), sec(82.5, 220)], portDiameter_cm: 6, portLength_cm: 12, portFlare_cm: 0 }],
  ["06-tapped-horn", "Tapped horn (Par), 200 -> 850 cm2, 220 cm, rear at 20 cm, front tap at 120 cm", { end: "tapped", closedArea_cm2: 200, driverAt_cm: 20, tapAt_cm: 120, sections: [sec(220, 850)] }],
  ["07-front-horn", "Front-loaded horn (Exp), 110 -> 4000 cm2, 230 cm, Vrc 20 L, Vtc 1 L", { end: "horn", closedArea_cm2: 110, driverAt_cm: 0, sections: [sec(230, 4000, "exponential")], rearChamber_l: 20, throatChamber_l: 1 }],
  ["08-straight-tl-stuffed", "Case 1 stuffed: 8 kg/m3 polyester through the whole line", { end: "open", closedArea_cm2: 200, driverAt_cm: 0, sections: [sec(150, 200, "linear", 8)] }],
  ["09-offset-tl-stuffed", "Case 3 stuffed: 8 kg/m3 in the first 70 cm (behind the driver)", { end: "open", closedArea_cm2: 200, driverAt_cm: 70, sections: [sec(70, 200, "linear", 8), sec(140, 200)] }],
];
/** Cases with another driver, or more than one. */
const more: [string, string, typeof driver, number, Partial<LineDesign>][] = [
  ["10-sub-straight-tl", "12-inch sub (Le 2.4 mH), straight TL 260 cm x 500 cm2, driver at the closed end", SUB, 1, { end: "open", closedArea_cm2: 500, driverAt_cm: 0, sections: [sec(260, 500)] }],
  ["11-sub-mltl", "12-inch sub, MLTL 500 cm2, 160 cm, driver at 40 cm, 10 x 15 cm port", SUB, 1, { end: "port", closedArea_cm2: 500, driverAt_cm: 40, sections: [sec(40, 500), sec(120, 500)], portDiameter_cm: 10, portLength_cm: 15, portFlare_cm: 0 }],
  ["12-sub-tapped-horn", "12-inch sub, tapped horn (Par) 450 -> 1800 cm2, 300 cm, taps at 25 and 160 cm", SUB, 1, { end: "tapped", closedArea_cm2: 450, driverAt_cm: 25, tapAt_cm: 160, sections: [sec(300, 1800)] }],
  ["13-fr-tqwt", "4-inch full-range, TQWT (Con) 15 -> 90 cm2, 130 cm, driver at 42 cm", FR, 1, { end: "open", closedArea_cm2: 15, driverAt_cm: 42, sections: [sec(130, 90, "conical")] }],
  ["14-fr-tapered-tl", "4-inch full-range, tapered TL (Par) 80 -> 40 cm2, 150 cm, driver at the closed end", FR, 1, { end: "open", closedArea_cm2: 80, driverAt_cm: 0, sections: [sec(150, 40)] }],
  ["15-mltl-2-drivers", "Record 05 with two DSA215s (OD = 2)", driver, 2, { end: "port", closedArea_cm2: 220, driverAt_cm: 27.5, sections: [sec(27.5, 220), sec(82.5, 220)], portDiameter_cm: 6, portLength_cm: 12, portFlare_cm: 0 }],
];
mkdirSync(new URL("./records", import.meta.url), { recursive: true });
const index: string[] = [];
for (const [id, title, drv, n, patch] of [...cases.map(([id, title, patch]) => [id, title, driver, 1, patch] as const), ...more]) {
  const d = { ...base, ...patch, mouth: "front" as const, name: `SBG ${id}` } as LineDesign;
  const out = toHornresp(d, drv as any, { eg: 2.83, drivers: n, name: `SBG ${id}`, pmax: drv.pe_w, xmax_mm: drv.xmax_mm });
  if (typeof out === "string") { console.log(id, "ERROR", out); continue; }
  writeFileSync(new URL(`./records/${id}.txt`, import.meta.url), out.text);
  writeFileSync(new URL(`./records/${id}.json`, import.meta.url), JSON.stringify(d, null, 2));
  index.push(`${id}: ${title}${out.warnings.length ? " [" + out.warnings.join(" ") + "]" : ""}`);
}
console.log(index.join("\n"));
