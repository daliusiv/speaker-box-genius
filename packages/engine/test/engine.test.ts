import { test } from "node:test";
import assert from "node:assert/strict";
import { blFromQes, checkConsistency, cmsFromVas, mmsFromFsCms, qts } from "../src/ts.ts";
import { sealedAlignment, sealedVolumeForQtc } from "../src/sealed.ts";

const close = (a: number, b: number, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test("qts combines qms and qes in parallel", () => {
  close(qts(5.2, 0.4), (5.2 * 0.4) / 5.6);
});

test("Cms → Mms → fs round-trips", () => {
  const cms = cmsFromVas(50, 330);
  const mms = mmsFromFsCms(30, cms);
  const fs = 1 / (2 * Math.PI * Math.sqrt(mms * cms));
  close(fs, 30);
});

test("Bl from Qes reproduces Qes", () => {
  const mms = 0.0869;
  const bl = blFromQes(30, mms, 3.4, 0.4);
  const qes = (2 * Math.PI * 30 * mms * 3.4) / (bl * bl);
  close(qes, 0.4);
});

test("sealed box with Vb = Vas raises fs and Qts by √2", () => {
  const p = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50 };
  const { fc, qtc } = sealedAlignment(p, 50);
  close(fc, 30 * Math.SQRT2);
  close(qtc, qts(5.2, 0.4) * Math.SQRT2);
});

test("sealedVolumeForQtc inverts sealedAlignment", () => {
  const p = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50 };
  const vb = sealedVolumeForQtc(p, 0.707);
  close(sealedAlignment(p, vb).qtc, 0.707);
});

test("sealedVolumeForQtc rejects impossible targets", () => {
  assert.throws(() => sealedVolumeForQtc({ qms: 5, qes: 0.9, vas_l: 50 }, 0.5), RangeError);
});

test("consistency check: self-consistent driver is within 1%", () => {
  const issues = checkConsistency({ fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, mms_g: 86.9, bl: 11.8 });
  assert.equal(issues.length, 2);
  for (const i of issues) assert.ok(i.diff < 0.01, i.message);
});

test("consistency check: Vas typed in ft³ instead of litres is caught", () => {
  const [mms] = checkConsistency({ fs: 30, qms: 5.2, qes: 0.4, vas_l: 1.77, re: 3.4, sd_cm2: 330, mms_g: 86.9 });
  assert.ok(mms && mms.diff > 0.9, mms?.message ?? "no Mms issue reported");
});
