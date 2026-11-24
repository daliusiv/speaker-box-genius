import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, nameOf, toCsv, type Row } from "../src/audiotec.ts";

// Trimmed from Audiotec Fischer's WinISD files (24 Nov 2026).
const wdr = (fields: Record<string, string>) =>
  "[Driver]\r\n" + Object.entries({ Brand: "HELIX", Model: "x", Znom: "4", Fs: "38", Qts: "0,43", Re: "3,85", Sd: "0,0363", ...fields }).map(([k, v]) => `${k}=${v}`).join("\r\n");

test("names: brand from the file name, add-on weights spelled out", () => {
  assert.deepEqual(nameOf("HELIX IQ W10-DVC2 +2G"), { brand: "HELIX", model: "IQ W10-DVC2 (+2 weights)", key: "HELIX IQ W10-DVC2" });
  assert.deepEqual(nameOf("HELIX IQ W8-DVC2 +1G"), { brand: "HELIX", model: "IQ W8-DVC2 (+1 weight)", key: "HELIX IQ W8-DVC2" });
  assert.equal(nameOf("BRAX ML 10 SUB").model, "ML 10 SUB");
});

test("DVC2: two coils in series at 4 Ω, whatever Znom says", () => {
  const r = convert("HELIX IQ W12-DVC2", wdr({ Znom: "2", numVC: "2", Re: "3,8" })) as Row;
  assert.equal(r.coils, 2);
  assert.equal(r.wiring, "series");
  assert.equal(r.impedance, 4);
  assert.match(r.notes.join(), /Znom 2/);
  const s10 = convert("HELIX IK S10-DVC2", wdr({ Znom: "6", numVC: "1", Re: "3,6" })) as Row;
  assert.equal(s10.coils, 2);
  assert.equal(s10.impedance, 4);
});

test("SVC2: one 2 Ω coil", () => {
  const r = convert("HELIX IK W10-SVC2", wdr({ Znom: "4", numVC: "1", Re: "2" })) as Row;
  assert.equal(r.coils, 1);
  assert.equal(r.wiring, undefined);
  assert.equal(r.impedance, 2);
});

test("units: SI in the file to the sheet's units; four coils skipped", () => {
  const r = convert("HELIX IQ W10-DVC2", wdr({ Vas: "0,021", Mms: "0,158", Xmax: "0,012", Le: "0,0029", numVC: "2" }), { "HELIX IQ W10-DVC2": "https://example.com/iq-w10" }) as Row;
  assert.equal(r.values.vas_l, 21);
  assert.equal(r.values.mms_g, 158);
  assert.ok(Math.abs(r.values.xmax_mm! - 12) < 1e-9);
  assert.ok(Math.abs(r.values.sd_cm2! - 363) < 1e-9);
  assert.ok(Math.abs(r.values.le_mh! - 2.9) < 1e-9);
  assert.equal(r.url, "https://example.com/iq-w10");
  assert.match(toCsv([r]).split("\n")[1]!, /^IQ W10-DVC2,https:\/\/example\.com\/iq-w10,4,2,series,38,0\.43,/);
  assert.ok("skip" in convert("MATCH PP 8W-Q", wdr({ numVC: "4" })));
});

// ---- The website (the HELIX IK W10 page as audiotec-fischer.de serves it, 24 Nov 2026, trimmed)
import { readFileSync } from "node:fs";
import { keyOf, parseWebPage } from "../src/audiotec.ts";

const IK_W10 = readFileSync(new URL("./fixtures/audiotec/ik-w10.html", import.meta.url), "utf8");
const URL_W10 = "https://www.audiotec-fischer.de/en/helix/subwoofers/ik-w10";

test("website: technical data, the version the page lists, DVC2 in series", () => {
  const r = parseWebPage(IK_W10, URL_W10);
  assert.ok(!("skip" in r));
  assert.equal(r.brand, "HELIX");
  assert.equal(r.model, "IK W10-DVC2"); // "IK W10-DVC2 – 2 x 2 Ohms"
  assert.equal(r.kind, "subwoofer");
  assert.equal(r.size_in, 10);
  assert.equal(r.impedance, 4);
  assert.equal(r.coils, 2);
  assert.equal(r.wiring, "series");
  assert.equal(r.re, 3.2); // "Re 2 x 1.6 Ω"
  assert.equal(r.fs, 36);
  assert.equal(r.qts, 0.39);
  assert.equal(r.vas_l, 34);
  assert.equal(r.cms_mm_per_n, 0.218); // 218 µm/N
  assert.equal(r.bl, 12.3); // "B*I"
  assert.equal(r.mms_g, 91);
  assert.equal(r.sd_cm2, 333);
  assert.equal(r.xmax_mm, 8);
  assert.equal(r.pe_w, 300);
  assert.equal(r.cutout_mm, 232);
  assert.equal(r.depth_mm, 126);
});

test("website: kits, four-coil models; model keys match the WinISD names", () => {
  const kit = IK_W10.replace(/HELIX IK W10/, "HELIX Ci3 K165.2FM-S3 MK2").replace(/IK W10-DVC2 – 2 x 2 Ohms/, "");
  assert.match((parseWebPage(kit, URL_W10) as { skip: string }).skip, /two-way kit/);
  const quad = IK_W10.replace(/2 x 2 Ω/, "4 x 3 Ω"); // the impedance cell
  assert.match((parseWebPage(quad, URL_W10) as { skip: string }).skip, /4 voice coils/);
  assert.equal(keyOf("MATRIX ML10 SUB"), keyOf("ML 10 SUB"));
  assert.equal(keyOf("IQ W10-DVC2"), keyOf("IQ W10 DVC2"));
});
