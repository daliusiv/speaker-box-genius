// SPICE validation: the builder's circuit against closed forms, before any comparison with the
// engine. ngspice and mna.py can agree on a wrong netlist; these catch a wrong netlist.
// Every expected value here is worked out from the case's raw inputs (Small 1972/73, Beranek &
// Mellow), not from elements.ts.
import assert from "node:assert/strict";
import test from "node:test";
import type { SpiceCase } from "../validation/spice/elements.ts";
import { loadCases } from "../validation/spice/fixtures.ts";
import { buildNetlist } from "../validation/spice/netlist.ts";
import { runMnaText, type C, type RawResult } from "../validation/spice/run.ts";

const byId = Object.fromEntries(loadCases().map((c) => [c.id, c])) as Record<string, SpiceCase>;
const TAU = 2 * Math.PI;
const abs = (z: C) => Math.hypot(z[0], z[1]);
const arg = (z: C) => Math.atan2(z[1], z[0]);
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const close = (a: number, b: number, rel: number, what: string) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b} (rel ${rel})`);

/** Solve a case's netlist at exact frequencies (one ".ac lin 1 f f" run each), all nodes out. */
function at(c: SpiceCase, freqs: number[]): RawResult[] {
  const text = buildNetlist(c).text;
  return runMnaText(
    freqs.map((f) => text.replace(/^\.ac .*$/m, `.ac lin 1 ${f} ${f}`)),
    true,
  );
}
const v = (r: RawResult, n: string) => r.v[n]![0]!;
const i = (r: RawResult, s: string) => r.i[s.toLowerCase()]![0]!;

/** Small's mechanical values, from the raw inputs. */
function small(c: SpiceCase) {
  const d = c.driver;
  const sd = d.sd_cm2 / 1e4;
  const cms = d.vas_l / 1000 / (c.air.rho * c.air.c ** 2 * sd * sd);
  const mms = 1 / ((TAU * d.fs) ** 2 * cms);
  const bl = Math.sqrt((TAU * d.fs * mms * d.re) / d.qes);
  const rms = (TAU * d.fs * mms) / d.qms;
  return { sd, cms, mms, bl, rms };
}

test("SPICE analytic: free-air driver peaks at Fs with |Z| = Re(1 + Qms/Qes) and zero phase", () => {
  const c = byId.f01!;
  const [r] = at(c, [c.driver.fs]);
  const z = div(v(r!, "spk"), i(r!, "Vin"));
  close(abs(z), c.driver.re * (1 + c.driver.qms / c.driver.qes), 1e-9, "|Z(Fs)|");
  assert.ok(Math.abs(arg(z)) < 1e-9);
});

test("SPICE analytic: the motor is a lossless gyrator (power in = I²Re + |U|²Ras)", () => {
  const c = byId.f01!;
  const { sd, rms } = small(c);
  for (const r of at(c, [5, 20, 35, 80, 400])) {
    const vv = v(r, "spk");
    const ii = i(r, "Vin");
    const pin = vv[0] * ii[0] + vv[1] * ii[1];
    const u = abs(i(r, "Vcone1"));
    const loss = abs(ii) ** 2 * c.driver.re + u * u * (rms / (sd * sd));
    assert.ok(pin > 0);
    close(pin, loss, 1e-9, "power balance");
  }
});

test("SPICE analytic: lossless sealed box resonates at Fc = Fs·√(1 + Vas/Vb), |Z(Fc)| = Re(1 + Qms/Qes)", () => {
  const c = byId.s02!;
  if (c.box.kind !== "sealed") throw new Error("s02 must be sealed");
  const fc = c.driver.fs * Math.sqrt(1 + c.driver.vas_l / c.box.vb_l);
  const [r] = at(c, [fc]);
  const z = div(v(r!, "spk"), i(r!, "Vin"));
  close(abs(z), c.driver.re * (1 + c.driver.qms / c.driver.qes), 1e-9, "|Z(Fc)|");
  assert.ok(Math.abs(arg(z)) < 1e-9, "phase at Fc");
});

test("SPICE analytic: sealed box SPL at Fc is 20·log10(Qtc) above the mass-controlled level (RMS, half space)", () => {
  const c = byId.s02!;
  if (c.box.kind !== "sealed") throw new Error("s02 must be sealed");
  const { sd, mms, bl } = small(c);
  const volts = Math.sqrt(c.driver.re); // 1 W into Re
  const r = c.opts.distance_m ?? 1;
  // Mass-controlled pressure: p = ρ·Sd·V·Bl/(2π·r·Re·Mms) (Small 1972, eq. 22).
  const pInf = (c.air.rho * sd * volts * bl) / (TAU * r * c.driver.re * mms);
  const alpha = c.driver.vas_l / c.box.vb_l;
  const qts = (c.driver.qms * c.driver.qes) / (c.driver.qms + c.driver.qes);
  const qtc = qts * Math.sqrt(1 + alpha);
  const fc = c.driver.fs * Math.sqrt(1 + alpha);
  const [atFc, high] = at(c, [fc, 1000 * fc]);
  close(abs(v(high!, "prs")), pInf, 1e-5, "mass-controlled pressure");
  close(abs(v(atFc!, "prs")), pInf * qtc, 1e-9, "pressure at Fc");
});

test("SPICE analytic: sealed box pressure = ρc²·Sd·x/Vb and far-field |p| = ρω²·Sd·|x|/(2πr)", () => {
  const c = byId.s02!;
  if (c.box.kind !== "sealed") throw new Error("s02 must be sealed");
  const { sd } = small(c);
  const k = (c.air.rho * c.air.c ** 2 * sd) / (c.box.vb_l / 1000);
  for (const [f, r] of [5, 30, 70, 300].map((f, n, a) => [f, at(c, a)[n]!] as const)) {
    const x = abs(v(r, "xn"));
    close(abs(v(r, "box")), k * x, 1e-9, `box pressure at ${f} Hz`);
    close(abs(v(r, "prs")), (c.air.rho * (TAU * f) ** 2 * sd * x) / (TAU * (c.opts.distance_m ?? 1)), 1e-9, `far-field pressure at ${f} Hz`);
  }
});

test("SPICE analytic: lossless vented box at Fb = Helmholtz: the cone stops and Z = Re", () => {
  const c = byId.v02!;
  if (c.box.kind !== "vented" || c.box.port.shape !== "round") throw new Error("v02 must be a round-port vented box");
  const s = Math.PI * (c.box.port.diameter_cm / 200) ** 2;
  const leff = c.box.port.length_cm / 100 + 0.732 * (c.box.port.diameter_cm / 100);
  const map = (c.air.rho * leff) / s;
  const cab = c.box.vb_l / 1000 / (c.air.rho * c.air.c ** 2);
  const fb = 1 / (TAU * Math.sqrt(map * cab));
  const [r, half] = at(c, [fb, fb / 2]);
  assert.ok(abs(v(r!, "xn")) < 1e-9 * abs(v(half!, "xn")), "cone excursion at Fb");
  close(abs(div(v(r!, "spk"), i(r!, "Vin"))), c.driver.re, 1e-9, "Z(Fb)");
  // Port speed = box pressure across the port's mass, over its area.
  for (const rr of [r!, half!]) {
    const f = rr.freq[0]!;
    close(abs(v(rr, "vn")), abs(v(rr, "box")) / (TAU * f * map) / s, 1e-9, `port speed at ${f} Hz`);
  }
});

test("SPICE analytic: polarity: well below Fb the port's flow cancels the cone front's", () => {
  const c = byId.v02!;
  const [r] = at(c, [1]);
  const front: C = [-i(r!, "Vcone1")[0], -i(r!, "Vcone1")[1]];
  const ratio = div(i(r!, "Vport"), front);
  assert.ok(ratio[0] < -0.99 && Math.abs(ratio[1]) < 0.01, `U_port/U_front = ${ratio}`);
  const sum = abs([front[0] + i(r!, "Vport")[0], front[1] + i(r!, "Vport")[1]]);
  assert.ok(sum < 0.01 * abs(front), "sum far below either flow");
});

/** Helmholtz frequency of a round port (k 0.732) on a chamber. */
function helmholtz(c: SpiceCase, vb_l: number, port: { diameter_cm: number; length_cm: number }) {
  const s = Math.PI * (port.diameter_cm / 200) ** 2;
  const map = (c.air.rho * (port.length_cm / 100 + 0.732 * (port.diameter_cm / 100))) / s;
  return 1 / (TAU * Math.sqrt(map * (vb_l / 1000 / (c.air.rho * c.air.c ** 2))));
}

test("SPICE analytic: lossless bandpass: at each chamber's Helmholtz frequency the cone stops and Z = Re", () => {
  // The cone loop runs through both chambers in series; a chamber whose air spring and port
  // resonate presents an infinite impedance, so no cone flow, no back EMF.
  for (const id of ["b01", "b02"]) {
    const c = byId[id]!;
    if (c.box.kind !== "bandpass") throw new Error(`${id} must be bandpass`);
    const tunings = [c.box.front, c.box.rear].filter((ch) => ch.port?.shape === "round").map((ch) => helmholtz(c, ch.vb_l, ch.port as { diameter_cm: number; length_cm: number }));
    assert.equal(tunings.length, id === "b01" ? 1 : 2);
    for (const f of tunings) {
      const [r, off] = at(c, [f, f * 0.7]);
      assert.ok(abs(v(r!, "xn")) < 1e-9 * abs(v(off!, "xn")), `${id}: cone excursion at ${f.toFixed(2)} Hz`);
      close(abs(div(v(r!, "spk"), i(r!, "Vin"))), c.driver.re, 1e-9, `${id}: Z at ${f.toFixed(2)} Hz`);
    }
  }
});

test("SPICE analytic: lossless bandpass radiates only through its openings: their flows sum to the cone's in the bass", () => {
  // Below every resonance the air springs are stiff, so whatever the cone moves leaves through the
  // ports: for a 4th order the front port carries the cone's flow; nothing else radiates.
  const c = byId.b01!;
  const [r] = at(c, [2]);
  const cone = i(r!, "Vcone1");
  const port = i(r!, "Vportf");
  assert.ok(abs([port[0] - cone[0], port[1] - cone[1]]) < 0.02 * abs(cone), "front port carries the cone's flow at 2 Hz");
});

test("SPICE analytic: signal chain gains at their corners (Butterworth −3 dB, Linkwitz-Riley −6 dB, peak EQ, Linkwitz Transform)", () => {
  const base = byId.s02!;
  const gainAt = (opts: SpiceCase["opts"], f: number) => {
    const c = { ...base, opts: { ...base.opts, ...opts } };
    const [r] = at(c, [f]);
    return abs(v(r!, "amp")) / abs(v(r!, "src"));
  };
  for (const order of [1, 2, 3, 4]) close(gainAt({ highPass: { type: "butterworth", order, freq: 30 } }, 30), Math.SQRT1_2, 1e-9, `Butterworth ${order} at fc`);
  for (const order of [2, 4]) close(gainAt({ highPass: { type: "linkwitz-riley", order, freq: 30 } }, 30), 0.5, 1e-9, `Linkwitz-Riley ${order} at fc`);
  close(gainAt({ eq: [{ type: "peak", freq: 50, gain_db: 6, q: 2 }] }, 50), 10 ** (6 / 20), 1e-9, "peak EQ at f0");
  // Linkwitz Transform: (f0/fp)² boost far below both corners.
  close(gainAt({ eq: [{ type: "linkwitz", f0: 60, q0: 0.9, fp: 30, qp: 0.6 }] }, 0.01), (60 / 30) ** 2, 1e-6, "Linkwitz Transform at DC");
  close(gainAt({ eq: [{ type: "lowshelf", freq: 40, gain_db: 6, q: 0.71 }] }, 0.01), 10 ** (6 / 20), 1e-6, "low shelf below");
  close(gainAt({ eq: [{ type: "highshelf", freq: 40, gain_db: -6, q: 0.71 }] }, 1e6), 10 ** (-6 / 20), 1e-6, "high shelf above");
});

test("SPICE analytic: a series resistor in the passive ladder adds exactly R to the impedance", () => {
  const base = byId.s02!;
  const z = (opts: SpiceCase["opts"]) =>
    at({ ...base, opts: { ...base.opts, ...opts } }, [10, 47, 200]).map((r) => div(v(r, "spk"), i(r, "Vin")));
  const plain = z({});
  const withR = z({ passive: { branches: [{ r: 1.5 }] } });
  plain.forEach((p, k) => {
    close(withR[k]![0], p[0] + 1.5, 1e-9, "real part");
    close(withR[k]![1], p[1], 1e-9, "imaginary part");
  });
});
