/**
 * SPICE validation: element values for the equivalent circuit, derived from the raw case inputs.
 *
 * INDEPENDENCE RULE: this file and netlist.ts must not import the engine's model code. Only
 * `import type` from the engine is allowed (checked by test/spice-imports.test.ts). Every value
 * below is worked out here from the inputs with textbook formulas, so a wrong formula in the
 * engine shows up as a difference instead of being copied.
 *
 * ## Units (SI, impedance analogy; acoustic domain after the motor)
 *
 * | Circuit quantity            | Means                         | Unit        |
 * |-----------------------------|-------------------------------|-------------|
 * | voltage, electrical side    | volts (RMS phasor)            | V           |
 * | current, electrical side    | amps (RMS phasor)             | A           |
 * | voltage, acoustic side      | sound pressure (RMS phasor)   | Pa          |
 * | current, acoustic side      | volume velocity (RMS phasor)  | m³/s        |
 * | inductor, acoustic side     | acoustic mass                 | kg/m⁴       |
 * | capacitor, acoustic side    | acoustic compliance           | m⁵/N        |
 * | resistor, acoustic side     | acoustic resistance           | Pa·s/m³     |
 * | V(xn) excursion probe       | cone excursion (RMS)          | m           |
 * | V(vn) port speed probe      | port air speed (RMS)          | m/s         |
 * | V(prs) pressure probe       | far-field pressure (RMS)      | Pa          |
 *
 * Peak values (excursion, port speed, box pressure) are √2 × RMS. SPL comes straight from the
 * RMS pressure: 20·log10(|p| / 20 µPa).
 *
 * ## Conventions ledger (what the engine does on purpose; the builder follows it)
 *
 * | # | Convention | Engine's choice | Source | Covered by |
 * |---|---|---|---|---|
 * | 1 | Vas → Cms air | the case's operating air (roadmap 15e may change this) | simulate.ts `driverModel(driverIn, air)` | air cases |
 * | 2 | Bl | from Qes with the cold (datasheet) Re | model.ts `blFromQes` | every case |
 * | 3 | Hot coil | Re·(1 + 0.00393·(T − 20)) for T > 20 °C; Bl, Le, suspension unchanged | docs/validation.md "Hot voice coil" | hot cases |
 * | 4 | Loss reference frequency | sealed: Fc; vented: Fb | simulate.ts `fRef` | loss cases |
 * | 5 | Sealed Qa | against Cab in series with the cone's Cas: Rab = 1/(Qa·ω·(Cab‖ₛCas)) | docs/validation.md (#207) | sealed |
 * | 6 | Ql | across the box: Ral = Ql/(ω·Cab) (sealed, vented) | simulate.ts `ral` | loss cases |
 * | 7 | Qa | in series with Cab: Rab = 1/(Qa·ω·C) | simulate.ts `rab` | loss cases |
 * | 8 | Qp | in series with each port's mass: Rap = ω·Map/Qp | simulate.ts `rap` | vented |
 * | 9 | Leaked air | "heard" (default): the leak's flow radiates, like a port | docs/validation.md "Leaked air" | loss cases |
 * | 10 | Port length | L + k·Deq, Deq = diameter of a circle of the same area, k = 0.732 by default | WinISD; model.ts doc comment | vented |
 * | 11 | Radiation | coincident point sources; p = jωρ·U/(k·π·r), k = 2 half space, 4 full | simulate.ts far-field | every case |
 * | 12 | Cone air load | "fixed mass": datasheet Mms, no radiation impedance | docs/validation.md "Cone air load" | every case |
 * | 13 | Watts → volts | circuit: V = √(P·Re_cold) at the amp, Rg in the circuit; winisd: V = √(P·(Re_hot + Rg)) at the amp | docs/validation.md "The full WinISD run" | drive cases |
 * | 14 | SPL phase | the cone's flow is counted into the box, so a positive voltage gives −p; phase reported + 180° (non-bandpass) | simulate.ts `unwrapped` | every case |
 * | 15 | Impedance | at the speaker terminals: Rg excluded | simulate.ts `zIn` | Rg cases |
 * | 16 | Several drivers | each driver is its own coil and cone in the circuit, all into one box; one shared Rg | physical | n-driver cases |
 * | 17 | Isobaric pair | two real drivers in one cone loop (their masses, compliances, resistances and motors in series), the air between them left out; front cone radiates | physical; engine: 2·Mms, Cms/2, Bl·2 (series coils) | isobaric cases |
 * | 18 | Sealed Fc with n drivers / pairs | Fs·√(1 + n·Cas′/Cab), Cas′ the pair's (Cms/2) for isobaric; Qa against Cab in series with n·Cas′ | simulate.ts `fRef`, `cAbs` | sealed n-driver cases |
 * | 19 | Watts → volts with n drivers / pairs | Re of the bank (pairs: 2·Re series, Re/2 parallel; bank: /n parallel, ×n series); WinISD: an isobaric pair with series coils counts one driver's Re; Rg folded per driver (n·Rg parallel, Rg/n series) | simulate.ts volts, `fold` | drive cases |
 * | 20 | PR suspension | Cms if given, else from Vas (case air), else from Fs with the bare mass; Rmp from the BARE PR: 2π·Fs0·M0/Qms, Qms 10 if missing | model.ts `passiveRadiatorModel` | PR cases |
 * | 21 | PR box reference frequency | all PRs lumped into one (masses and suspensions in parallel) against the box spring: exact for one kind, approximate for mixed kinds | model.ts `prGroupsFb` | PR cases |
 * | 22 | PR box losses | Ql and Qa both against Cab in series with all PRs' Cap | docs/validation.md (#207) | PR cases |
 * | 23 | Bandpass chamber losses | each chamber's Ql and Qa against its own Cab at its own tuning (an opening's Helmholtz or PR tuning; a closed rear chamber: Fs·√(1 + n·Cas′/Cab)); Qp at the chamber's tuning | simulate.ts `bandpassNetwork` | bandpass cases |
 * | 24 | Bandpass inter-chamber leak | a resistor between the chambers, R = Qicl/(ωs·Cas′) with the pair's values for isobaric; Qicl 100 if missing | simulate.ts `ricl` | bandpass cases |
 * | 26 | High-pass and EQ | analog s-domain transfer functions on the drive voltage, ahead of the amplifier and Rg; Butterworth from its pole Qs, Linkwitz-Riley = two Butterworths of half the order, peaking/shelves = RBJ analog prototypes, Linkwitz Transform = (s² + ω0/Q0·s + ω0²)/(s² + ωp/Qp·s + ωp²) | simulate.ts `filter`; docs/validation.md "High-pass filter", "EQ" | chain cases |
 * | 28 | Flared round ports | each flared end (a quarter-circle round-over of radius r on a tube of radius a) counts as ∫ S0/S(x) dx of throat-area tube, by the 64-point midpoint rule; the straight part is L − ends·r; each end's correction is k/2 × its own diameter, referred to the throat by (a/(a+r))²; air speed is at the throat, or at the mouths (radius a + r) when both ends are flared. A convention mirrored from the engine, not an independent result | model.ts `portEffectiveLength` | v08, v09, app export |
 * | 27 | Passive parts | a ladder after Rg: branch 1 in line, 2 across, 3 in line, 4 across; each R, L, C all in series or all in parallel; impedance seen from the amplifier side of the ladder (Rg excluded); with parts fitted, WinISD's watts don't fold Rg into the driver | passive.ts; simulate.ts `fold` | chain cases |
 * | 25 | Bandpass sound | only the openings to the room (front vent; rear vent of a parallel 6th order) and both chambers' leaks ("heard"); not the cone, not a series box's inner port, not Qicl; phase not turned round | simulate.ts `flows.radiated`, `unwrapped` | bandpass cases |
 */
import type { BandpassInput, DriverInput, PassiveRadiatorInput, PortInput } from "../../src/model.ts";
import type { SimulationOptions } from "../../src/simulate.ts";

/** Air for one case: resolved numbers, never looked up. */
export interface CaseAir {
  rho: number;
  c: number;
}

export type CaseBox =
  | { kind: "free-air" }
  | BandpassInput
  | { kind: "sealed"; vb_l: number; ql?: number | null; qa?: number | null }
  | {
      kind: "vented";
      vb_l: number;
      port: PortInput;
      portCount?: number;
      endCorrection?: number;
      ql?: number | null;
      qa?: number | null;
      qp?: number | null;
    }
  | {
      kind: "passive-radiator";
      vb_l: number;
      pr: PassiveRadiatorInput;
      prCount?: number;
      addedMass_g?: number;
      extraPrs?: { pr: PassiveRadiatorInput; count: number; addedMass_g?: number }[];
      ql?: number | null;
      qa?: number | null;
    };

export interface CaseOptions {
  power?: number;
  convention?: "re" | "volts";
  rg?: number;
  coilTemp_C?: number;
  driveModel?: "circuit" | "winisd";
  distance_m?: number;
  space?: "half" | "full";
  endCorrection?: number;
  /** Identical drivers (or isobaric pairs) sharing the box, and how they're wired. */
  drivers?: number;
  wiring?: "parallel" | "series";
  /** Each "driver" is an isobaric pair: two drivers, one behind the other, coils in series or parallel. */
  isobaric?: { coils: "series" | "parallel" } | null;
  /** Signal chain ahead of the amplifier, and passive parts between it (after Rg) and the bank. */
  highPass?: SimulationOptions["highPass"];
  eq?: SimulationOptions["eq"];
  passive?: SimulationOptions["passive"];
}

/** One case, as committed in test/fixtures/spice/inputs/<id>.json. */
export interface SpiceCase {
  id: string;
  title: string;
  driver: DriverInput;
  box: CaseBox;
  opts: CaseOptions;
  air: CaseAir;
  /** Sweep: points per decade from fMin to fMax. */
  sweep: { perDecade: number; fMin: number; fMax: number };
}

const TAU = 2 * Math.PI;
/** Engine defaults (docs/validation.md): Ql 10, Qa 100, Qp 100; null or a missing value = default, Infinity/null-as-"none" handled by `lossQ`. */
export const DEFAULT_Q = { ql: 10, qa: 100, qp: 100 } as const;
export const DEFAULT_END_CORRECTION = 0.732;
export const COPPER_ALPHA = 0.00393;

/** A loss Q: undefined → default; null or Infinity → lossless. */
export function lossQ(q: number | null | undefined, def: number): number {
  if (q === undefined) return def;
  if (q === null || !Number.isFinite(q)) return Infinity;
  return q;
}

export interface DriverElements {
  reCold: number;
  re: number; // hot
  le: number;
  l2: number;
  r2: number;
  sd: number;
  cms: number;
  mms: number;
  rms: number;
  bl: number;
  /** Acoustic: Mas = Mms/Sd², Cas = Cms·Sd², Ras = Rms/Sd² (Beranek & Mellow §3; Leach ch. 5). */
  mas: number;
  cas: number;
  ras: number;
  /** Gyrator ratio Bl/Sd: pressure per amp and volts per m³/s. */
  g: number;
}

/**
 * Driver elements from Small's parameters (Small, "Direct-radiator loudspeaker system analysis",
 * JAES 1972, eqs. 6–10):
 *   Cms = Vas / (ρc²·Sd²);  Mms = 1/((2πFs)²·Cms);  Rms = 2πFs·Mms/Qms;  Bl = √(2πFs·Mms·Re/Qes).
 */
export function driverElements(d: DriverInput, air: CaseAir, coilTemp_C?: number): DriverElements {
  if (d.semi || d.fdd) throw new Error("SPICE builder: semi-inductance and FDD are phase 2");
  const sd = d.sd_cm2 / 1e4;
  const vas = d.vas_l / 1000;
  const cms = vas / (air.rho * air.c * air.c * sd * sd);
  const ws = TAU * d.fs;
  const mms = 1 / (ws * ws * cms);
  const rms = (ws * mms) / d.qms;
  const bl = Math.sqrt((ws * mms * d.re) / d.qes);
  const heat = coilTemp_C !== undefined && coilTemp_C > 20 ? 1 + COPPER_ALPHA * (coilTemp_C - 20) : 1;
  const hasL2 = (d.l2_mh ?? 0) > 0 && (d.r2_ohm ?? 0) > 0;
  return {
    reCold: d.re,
    re: d.re * heat,
    le: (d.le_mh ?? 0) / 1000,
    l2: hasL2 ? d.l2_mh! / 1000 : 0,
    r2: hasL2 ? d.r2_ohm! : 0,
    sd,
    cms,
    mms,
    rms,
    bl,
    mas: mms / (sd * sd),
    cas: cms * sd * sd,
    ras: rms / (sd * sd),
    g: bl / sd,
  };
}

/** Acoustic compliance of a volume of air: V/(ρc²) (Beranek & Mellow eq. 4.36). */
export const airCompliance = (vb_l: number, air: CaseAir) => vb_l / 1000 / (air.rho * air.c * air.c);

/** Port cross-section (m²) and its equivalent round diameter (m). */
export function portSection(p: PortInput): { area: number; deq: number } {
  const area = p.shape === "round" ? Math.PI * (p.diameter_cm / 200) ** 2 : (p.width_cm * p.height_cm) / 1e4;
  return { area, deq: 2 * Math.sqrt(area / Math.PI) };
}

/** Where a port's air speed is reported (m²): the throat, or the mouths when both ends are flared (ledger #28). */
export function portSpeedArea(p: PortInput): number {
  const r = p.shape === "round" ? (p.flare_cm ?? 0) / 100 : 0;
  if (r > 0 && p.shape === "round" && (p.flareEnds ?? 2) === 2) return Math.PI * (p.diameter_cm / 200 + r) ** 2;
  return portSection(p).area;
}

/** One port's acoustic mass ρ·Leff/S, Leff = L + k·Deq (Beranek & Mellow §4.6, WinISD's k); flared ends per ledger #28. */
export function portMass(p: PortInput, air: CaseAir, k = DEFAULT_END_CORRECTION): number {
  const { area, deq } = portSection(p);
  const r = p.shape === "round" ? (p.flare_cm ?? 0) / 100 : 0;
  if (!(r > 0)) return (air.rho * (p.length_cm / 100 + k * deq)) / area;
  const ends = p.shape === "round" ? (p.flareEnds ?? 2) : 0;
  const a = deq / 2;
  // ∫ (a / radius(x))² dx over the round-over, radius = a + r − √(r² − x²).
  const n = 64;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * r;
    sum += (a / (a + r - Math.sqrt(Math.max(0, r * r - x * x)))) ** 2;
  }
  const flared = (sum / n) * r;
  const leff = Math.max(0, p.length_cm / 100 - ends * r) + ends * flared + ends * (k / 2) * 2 * (a + r) * (a / (a + r)) ** 2 + (2 - ends) * (k / 2) * deq;
  return (air.rho * leff) / area;
}

/** Passive radiator elements (ledger #20), mechanical SI. */
export function prElements(p: PassiveRadiatorInput, addedMass_g: number, air: CaseAir) {
  const sd = p.sd_cm2 / 1e4;
  const m0 = p.mms_g / 1000;
  let cmp: number;
  if (p.cms_mm_per_n !== undefined) cmp = p.cms_mm_per_n / 1000;
  else if (p.vas_l !== undefined) cmp = p.vas_l / 1000 / (air.rho * air.c * air.c * sd * sd);
  else if (p.fs !== undefined) cmp = 1 / ((TAU * p.fs) ** 2 * m0);
  else throw new Error("SPICE builder: a PR needs Cms, Vas or Fs");
  const fs0 = 1 / (TAU * Math.sqrt(m0 * cmp));
  const rmp = (TAU * fs0 * m0) / (p.qms ?? 10);
  return { sd, mmp: m0 + addedMass_g / 1000, cmp, rmp };
}

/** The drive and wiring of the driver bank (ledger #16, #19). */
export function bankOf(d: DriverElements, o: CaseOptions) {
  const n = o.drivers ?? 1;
  const wiring = o.wiring ?? "parallel";
  const iso = o.isobaric?.coils ?? null;
  const unitK = iso === "series" ? 2 : iso === "parallel" ? 0.5 : 1;
  const bankK = wiring === "parallel" ? 1 / n : n;
  const heat = d.re / d.reCold;
  const p = o.power ?? 1;
  const rg = o.rg ?? 0;
  let volts: number;
  if (o.convention === "volts") volts = p;
  else if (o.driveModel === "winisd") {
    // WinISD: watts into the hot coil (one driver's Re for a series isobaric pair), plus Rg folded per driver.
    const reUnitHot = d.reCold * unitK * heat;
    const reVolts = (iso === "series" ? d.reCold : d.reCold * unitK) * heat * bankK;
    volts = Math.sqrt(p * reVolts);
    const rgDriver = wiring === "parallel" ? rg * n : rg / n;
    if (rgDriver > 0 && !passiveFitted(o)) volts *= Math.sqrt((reUnitHot + rgDriver) / reUnitHot);
  } else volts = Math.sqrt(p * d.reCold * unitK * bankK);
  return { n, wiring, iso, volts, perUnit: iso ? 2 : 1 };
}

/** True when any passive part is fitted (ledger #27). */
export function passiveFitted(o: CaseOptions): boolean {
  return !!o.passive && o.passive.branches.some((b) => !!b && ((b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0));
}

/** A transfer function section, coefficients in DESCENDING powers of s (as ngspice's s_xfer takes them). */
export interface Section {
  num: number[];
  den: number[];
}

/** Butterworth high-pass of order n at fc: 2nd-order sections with Q = 1/(2·sin((2k−1)π/2n)), plus a 1st-order one for odd n. */
function butterworthHp(n: number, fc: number): Section[] {
  const w = TAU * fc;
  const out: Section[] = [];
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    const q = 1 / (2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * n)));
    out.push({ num: [1, 0, 0], den: [1, w / q, w * w] });
  }
  if (n % 2 === 1) out.push({ num: [1, 0], den: [1, w] });
  return out;
}

/** Ledger #26: every stage of the signal chain as s-domain sections. */
export function chainSections(o: CaseOptions): Section[] {
  const out: Section[] = [];
  const hp = o.highPass;
  if (hp) {
    if (hp.type === "butterworth") out.push(...butterworthHp(hp.order, hp.freq));
    else out.push(...butterworthHp(hp.order / 2, hp.freq), ...butterworthHp(hp.order / 2, hp.freq));
  }
  for (const st of o.eq ?? []) {
    if (st.type === "linkwitz") {
      const w0 = TAU * st.f0;
      const wp = TAU * st.fp;
      out.push({ num: [1, w0 / st.q0, w0 * w0], den: [1, wp / st.qp, wp * wp] });
      continue;
    }
    const w0 = TAU * st.freq;
    const A = 10 ** (st.gain_db / 40);
    if (st.type === "peak") out.push({ num: [1, (A * w0) / st.q, w0 * w0], den: [1, w0 / (A * st.q), w0 * w0] });
    else {
      const b = (Math.sqrt(A) * w0) / st.q;
      if (st.type === "lowshelf") out.push({ num: [A, A * b, A * A * w0 * w0], den: [A, b, w0 * w0] });
      else out.push({ num: [A * A, A * b, A * w0 * w0], den: [1, b, A * w0 * w0] });
    }
  }
  return out;
}
