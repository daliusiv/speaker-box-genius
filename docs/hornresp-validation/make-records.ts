import { writeFileSync, mkdirSync } from "node:fs";
import { toHornresp } from "../../packages/web/src/hornresp.ts";
import { DEFAULT_STATE, newDesign, type LineDesign, type LineSection } from "../../packages/web/src/state.ts";
const driver = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1, xmax_mm: 5.5, pe_w: 80 };
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
mkdirSync(new URL("./records", import.meta.url), { recursive: true });
const index: string[] = [];
for (const [id, title, patch] of cases) {
  const d = { ...base, ...patch, mouth: "front" as const, name: `SBG ${id}` } as LineDesign;
  const out = toHornresp(d, driver as any, { eg: 2.83, drivers: 1, name: `SBG ${id}`, pmax: 80, xmax_mm: 5.5 });
  if (typeof out === "string") { console.log(id, "ERROR", out); continue; }
  writeFileSync(new URL(`./records/${id}.txt`, import.meta.url), out.text);
  writeFileSync(new URL(`./records/${id}.json`, import.meta.url), JSON.stringify(d, null, 2));
  index.push(`${id}: ${title}${out.warnings.length ? " [" + out.warnings.join(" ") + "]" : ""}`);
}
console.log(index.join("\n"));
