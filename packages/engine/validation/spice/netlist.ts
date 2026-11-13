/**
 * SPICE validation: case inputs → a plain SPICE netlist (no .control block), readable by ngspice,
 * LTspice and mna.py. Element values come from elements.ts; see its units table and ledger.
 *
 * Topology (impedance analogy, acoustic after the motors):
 *
 *   amp ─Rg─ spk ─Vin─ bk ─[driver bank]─ 0                      amplifier, cable, bank current sense
 *   one coil:  Re_c ─ Le_c ─ [L2_c ‖ R2_c] ─ Hemf_c ─ Vi_c        (Hemf_c = (Bl/Sd)·I(Vcone_u))
 *   bank:      units in parallel (each from bk to 0) or in series (bk → … → 0); an isobaric unit's
 *              two coils in series or in parallel inside the unit
 *   cone loop of unit u:  Hd_c (one per coil, in series) ─ Ras ─ Lmas ─ Ccas [─ Ras ─ Lmas ─ Ccas] ─ Vcone_u ─ box
 *   box ─Rab─ b1 ─Cab─ 0      box ─Ral─ l1 ─Vleak─ 0      box ─Rap─ p1 ─Lmap─ p2 ─Vport─ 0
 *   PR group k:  box ─Rpr_k─ r_k ─Lpr_k─ q_k ─Cpr_k─ s_k ─Vpr_k─ 0     (one branch = count PRs: Z/count)
 *
 * Current senses: I(Vcone_u) = unit u's cone flow INTO the box (a positive coil current pushes air
 * in); I(Vport), I(Vleak), I(Vpr_k) = flow OUT of the box. Radiated flow = ports + leak + PRs − cones.
 *
 * Each motor is a lossless gyrator: Hd_c puts p = (Bl/Sd)·I(Vi_c) into its cone loop (delivering),
 * Hemf_c puts v = (Bl/Sd)·I(Vcone_u) against its coil current (absorbing): v·I = p·U.
 *
 * Probes (each terminated, so no node floats):
 *   prs: Σ F sources into L = ρ/(kπr) → V(prs) = jωρ·U₀/(kπr) = far-field pressure;
 *   xn:  F (1/Sd)·I(Vcone_1) into 1 F → V(xn) = U/(jω·Sd) = cone excursion;
 *   vn:  F (1/(n·Sp))·I(Vport) into 1 Ω → port air speed;
 *   xp_k: F (1/(count·Sdp))·I(Vpr_k) into 1 F → excursion of one PR of group k.
 * Nodes reached only through capacitors get a 1e15 Ω bleed to ground (DC path for ngspice's
 * operating point; effect < 1e-8 relative).
 */
import { airCompliance, bankOf, chainSections, DEFAULT_END_CORRECTION, DEFAULT_Q, driverElements, lossQ, portMass, portSpeedArea, prElements, type SpiceCase } from "./elements.ts";

const BLEED = 1e15;
const TAU = 2 * Math.PI;
/** 15 significant digits, so a lossless peak doesn't move. */
const num = (x: number) => {
  if (!Number.isFinite(x)) throw new Error(`SPICE builder: non-finite value ${x}`);
  const s = x.toPrecision(15);
  if (!s.includes(".")) return s;
  const [mant, exp] = s.split("e");
  const m = mant!.replace(/0+$/, "").replace(/\.$/, "");
  return exp ? `${m}e${exp}` : m;
};

export interface Probes {
  /** The reported phase is turned round (+180°) for boxes whose cone faces the room (ledger #14, #25). */
  phaseFlip: boolean;
  /** Impedance = V(terminals) / I(coilSense): the whole bank, after Rg. */
  terminals: string;
  coilSense: string;
  pressure: string;
  excursion: string;
  portSpeed: string | null;
  boxPressure: string | null;
  /** Bandpass: front chamber pressure and the rear chamber's port speed. */
  frontPressure: string | null;
  rearPortSpeed: string | null;
  /** Excursion of one PR, per group. */
  prExcursion: string[];
  /** Flow senses, for the polarity checks. */
  cone: string;
  port: string | null;
  leak: string | null;
  prs: string[];
}

export interface Netlist {
  text: string;
  probes: Probes;
  /** Reference frequency of the box losses (Hz), for reports. */
  fRef: number | null;
}

export interface NetlistOptions {
  /**
   * "ngspice" (default): filters and EQ as XSPICE s_xfer blocks. "ltspice": as Laplace
   * E-sources, and every inductor with Rser=0 (LTspice's default is 1 mΩ).
   */
  dialect?: "ngspice" | "ltspice";
  /** Comment lines in place of the validation header (the app's export). */
  header?: string[];
}

/** a_n s^n + … + a_0 (coefficients in descending powers) in Horner form, which needs no powers: (s+2)*s+3. */
function horner(c: number[]): string {
  let h = num(c[0]!);
  for (const a of c.slice(1)) {
    const times = h === "1" ? "s" : /[+-]/.test(h.replace(/e[+-]/g, "")) ? `(${h})*s` : `${h}*s`;
    h = a === 0 ? times : `${times}${a < 0 ? "" : "+"}${num(a)}`;
  }
  return h;
}

export function buildNetlist(c: SpiceCase, o: NetlistOptions = {}): Netlist {
  const { driver, box, opts, air } = c;
  const lt = o.dialect === "ltspice";
  const d = driverElements(driver, air, opts.coilTemp_C);
  const bank = bankOf(d, opts);
  const L: string[] = [];
  const el = (s: string) => L.push(lt && /^L\S*\s/.test(s) ? `${s} Rser=0` : s);
  if (o.header) L.push(...o.header.map((h) => `* ${h}`.trimEnd()));
  else {
    L.push(`* ${c.id}: ${c.title}`);
    L.push(`* Speaker Box Genius SPICE validation netlist. SI units; acoustic side: Pa, m^3/s. See packages/engine/validation/spice/elements.ts.`);
  }

  // --- Signal chain (ledger #26): s_xfer stages from the source to the amplifier's output ---
  const sections = chainSections(opts);
  el(`V1 ${sections.length ? "src" : "amp"} 0 AC ${num(bank.volts)}`);
  const models: string[] = [];
  sections.forEach((sec, k) => {
    const from = k === 0 ? "src" : `f${k}`;
    const to = k === sections.length - 1 ? "amp" : `f${k + 1}`;
    if (lt) el(`E${k + 1} ${to} 0 ${from} 0 Laplace=(${horner(sec.num)})/(${horner(sec.den)})`);
    else {
      el(`A${k + 1} %vd(${from} 0) %vd(${to} 0) xf${k + 1}`);
      models.push(`.model xf${k + 1} s_xfer(num_coeff=[${sec.num.map(num).join(" ")}] den_coeff=[${sec.den.map(num).join(" ")}])`);
    }
  });

  // --- Electrical: amplifier, Rg, bank sense, passive ladder (ledger #27) ---
  const rg = opts.rg ?? 0;
  if (rg > 0) el(`Rg amp spk ${num(rg)}`);
  else el(`Vrg amp spk 0`);
  const fitted = (b: { r?: number; l_mH?: number; c_uF?: number } | undefined) => !!b && ((b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0);
  const ladder = (opts.passive?.branches ?? []).slice(0, 4);
  if (!ladder.some(fitted)) el(`Vin spk bk 0`);
  else {
    el(`Vin spk n0 0`);
    let node = "n0";
    // A branch from a to b: R, L, C all in series (a chain) or all in parallel.
    const branch = (k: number, b: NonNullable<(typeof ladder)[number]>, a: string, z: string) => {
      const parts: [string, number][] = [];
      if ((b.r ?? 0) > 0) parts.push(["R", b.r!]);
      if ((b.l_mH ?? 0) > 0) parts.push(["L", b.l_mH! / 1000]);
      if ((b.c_uF ?? 0) > 0) parts.push(["C", b.c_uF! / 1e6]);
      if (b.join === "parallel") {
        for (const [t, v] of parts) el(`${t}x${k} ${a} ${z} ${num(v)}`);
        if (parts.length === 1 && parts[0]![0] === "C") el(`Rbl_x${k} ${a} ${z} ${num(BLEED)}`);
        return;
      }
      let from = a;
      parts.forEach(([t, v], j) => {
        const to = j === parts.length - 1 ? z : `x${k}n${j + 1}`;
        el(`${t}x${k} ${from} ${to} ${num(v)}`);
        if (t === "C") el(`Rbl_x${k}c ${from} ${to} ${num(BLEED)}`);
        from = to;
      });
    };
    ladder.forEach((b, k) => {
      const inLine = k % 2 === 0;
      if (inLine) {
        const next = `n${k + 1}`;
        if (fitted(b)) branch(k + 1, b!, node, next);
        else el(`Vx${k + 1} ${node} ${next} 0`);
        node = next;
      } else if (fitted(b)) branch(k + 1, b!, node, "0");
    });
    el(`Vx9 ${node} bk 0`);
  }

  // One coil between nodes a → b, with its motor's back EMF from cone loop u.
  let coilNo = 0;
  const coil = (a: string, b: string, u: number) => {
    const k = ++coilNo;
    el(`Re${k} ${a} c${k}a ${num(d.re)}`);
    if (d.le > 0) el(`Le${k} c${k}a c${k}b ${num(d.le)}`);
    else el(`Vle${k} c${k}a c${k}b 0`);
    let end = `c${k}b`;
    if (d.l2 > 0) {
      el(`L2${k} c${k}b c${k}c ${num(d.l2)}`);
      el(`R2${k} c${k}b c${k}c ${num(d.r2)}`);
      end = `c${k}c`;
    }
    el(`Hemf${k} ${end} c${k}d Vcone${u} ${num(d.g)}`);
    el(`Vi${k} c${k}d ${b} 0`);
    return k;
  };

  // --- Driver bank: units in parallel or series; an isobaric unit holds two coils ---
  const unitCoils: number[][] = [];
  for (let u = 1; u <= bank.n; u++) {
    const a = bank.wiring === "parallel" || u === 1 ? "bk" : `w${u - 1}`;
    const b = bank.wiring === "parallel" || u === bank.n ? "0" : `w${u}`;
    if (!bank.iso) unitCoils.push([coil(a, b, u)]);
    else if (bank.iso === "series") {
      const k1 = coil(a, `m${u}`, u);
      const k2 = coil(`m${u}`, b, u);
      unitCoils.push([k1, k2]);
    } else unitCoils.push([coil(a, b, u), coil(a, b, u)]);
  }

  // --- Cone loops: each unit's motors in series, then its drivers' mechanics ---
  const bp = box.kind === "bandpass";
  const coneFrom = bp ? "br" : "0";
  const coneTo = box.kind === "free-air" ? "0" : bp ? "bf" : "box";
  unitCoils.forEach((coils, idx) => {
    const u = idx + 1;
    let node = coneFrom;
    coils.forEach((k, j) => {
      const next = `u${u}h${j + 1}`;
      el(`Hd${k} ${next} ${node} Vi${k} ${num(d.g)}`);
      node = next;
    });
    for (let j = 1; j <= coils.length; j++) {
      el(`Ras${u}${j} ${node} u${u}r${j} ${num(d.ras)}`);
      el(`Lmas${u}${j} u${u}r${j} u${u}m${j} ${num(d.mas)}`);
      el(`Ccas${u}${j} u${u}m${j} u${u}k${j} ${num(d.cas)}`);
      el(`Rbl_u${u}k${j} u${u}k${j} 0 ${num(BLEED)}`);
      node = `u${u}k${j}`;
    }
    el(`Vcone${u} ${node} ${coneTo} 0`);
  });

  let fRef: number | null = null;
  let port: string | null = null;
  let leak: string | null = null;
  let portSpeed: string | null = null;
  let boxPressure: string | null = null;
  let frontPressure: string | null = null;
  let rearPortSpeed: string | null = null;
  /** Flows that radiate (out of the system), beyond the cones' fronts. */
  const radiating: string[] = [];
  // A parallel 6th order's rear opening, for a position (ledger #29).
  const rearOpening: string[] = [];
  const prs: string[] = [];
  const prExcursion: string[] = [];
  const space = opts.space === "full" ? 4 : 2;
  const r = opts.distance_m ?? 1;
  // The bank as one equivalent cone for the loss conventions (ledger #18): pair Cms/2, Mms·2.
  const pairK = bank.iso ? 2 : 1;
  const casEq = d.cas / pairK;
  const masEq = d.mas * pairK;

  if (box.kind === "bandpass") {
    const k = box.endCorrection ?? opts.endCorrection ?? DEFAULT_END_CORRECTION;
    const series = box.rearPortTo === "front";
    let prNo = 0;
    /** A chamber's tuning with its own opening (ledger #23). */
    const tuning = (ch: typeof box.front, cab: number) => {
      if (ch.prs && ch.prs.length > 0) {
        let invMass = 0;
        let cap = 0;
        for (const g of ch.prs) {
          const m = prElements(g.pr, g.addedMass_g ?? 0, air);
          invMass += g.count / (m.mmp / (m.sd * m.sd));
          cap += g.count * m.cmp * m.sd * m.sd;
        }
        return Math.sqrt((1 / cap + 1 / cab) * invMass) / TAU;
      }
      if (ch.port) return 1 / (TAU * Math.sqrt((portMass(ch.port, air, k) / (ch.portCount ?? 1)) * cab));
      return (1 / (TAU * Math.sqrt(masEq * casEq))) * Math.sqrt(1 + (bank.n * casEq) / cab);
    };
    /** Chamber node, its air spring and leak; then its opening from `node` to `to`. */
    const chamber = (tag: "f" | "r", ch: typeof box.front, to: string, outside: boolean) => {
      const node = `b${tag}`;
      el(`Rbl_${node} ${node} 0 ${num(BLEED)}`);
      const cab = airCompliance(ch.vb_l, air);
      const f = tuning(ch, cab);
      const w = TAU * f;
      const ql = lossQ(ch.ql, DEFAULT_Q.ql);
      const qa = lossQ(ch.qa, DEFAULT_Q.qa);
      if (Number.isFinite(qa)) {
        el(`Rab${tag} ${node} ${tag}b1 ${num(1 / (qa * w * cab))}`);
        el(`Cab${tag} ${tag}b1 0 ${num(cab)}`);
        el(`Rbl_${tag}b1 ${tag}b1 0 ${num(BLEED)}`);
      } else el(`Cab${tag} ${node} 0 ${num(cab)}`);
      if (Number.isFinite(ql)) {
        el(`Ral${tag} ${node} ${tag}l1 ${num(ql / (w * cab))}`);
        el(`Vleak${tag} ${tag}l1 0 0`);
        radiating.push(`Vleak${tag}`);
      }
      let speed: string | null = null;
      if (ch.prs && ch.prs.length > 0) {
        for (const g of ch.prs) {
          const q = ++prNo;
          const m = prElements(g.pr, g.addedMass_g ?? 0, air);
          const s2 = m.sd * m.sd;
          el(`Rpr${q} ${node} r${q} ${num(m.rmp / s2 / g.count)}`);
          el(`Lpr${q} r${q} q${q} ${num(m.mmp / s2 / g.count)}`);
          el(`Cpr${q} q${q} s${q} ${num(m.cmp * s2 * g.count)}`);
          el(`Vpr${q} s${q} ${to} 0`);
          el(`Fxp${q} 0 xp${q} Vpr${q} ${num(1 / (g.count * m.sd))}`);
          el(`Cxp${q} xp${q} 0 1`);
          el(`Rbl_xp${q} xp${q} 0 ${num(BLEED)}`);
          prs.push(`Vpr${q}`);
          prExcursion.push(`xp${q}`);
          if (outside) radiating.push(`Vpr${q}`);
          if (outside && tag === "r") rearOpening.push(`Vpr${q}`);
        }
      } else if (ch.port) {
        const count = ch.portCount ?? 1;
        const map = portMass(ch.port, air, k);
        const qp = lossQ(ch.qp, DEFAULT_Q.qp);
        const rap = Number.isFinite(qp) ? (w * map) / qp : 0;
        if (rap > 0) el(`Rap${tag} ${node} ${tag}p1 ${num(rap / count)}`);
        else el(`Vrap${tag} ${node} ${tag}p1 0`);
        el(`Lmap${tag} ${tag}p1 ${tag}p2 ${num(map / count)}`);
        el(`Vport${tag} ${tag}p2 ${to} 0`);
        if (outside) radiating.push(`Vport${tag}`);
        if (outside && tag === "r") rearOpening.push(`Vport${tag}`);
        el(`Fv${tag} 0 v${tag} Vport${tag} ${num(1 / (count * portSpeedArea(ch.port)))}`);
        el(`Rv${tag} v${tag} 0 1`);
        speed = `v${tag}`;
      }
      return { f, speed, port: ch.port && !(ch.prs && ch.prs.length > 0) ? `Vport${tag}` : null };
    };
    if (!box.front.port && !(box.front.prs && box.front.prs.length > 0)) throw new Error("bandpass front chamber needs an opening");
    const front = chamber("f", box.front, "0", true);
    const rear = chamber("r", box.rear, series ? "bf" : "0", !series);
    fRef = front.f;
    portSpeed = front.speed;
    port = front.port;
    rearPortSpeed = rear.speed;
    boxPressure = "br";
    frontPressure = "bf";
    // Ledger #24: leak between the chambers, referred to the driver (pair values for isobaric).
    const qicl = box.qicl === undefined ? 100 : box.qicl === null || !Number.isFinite(box.qicl) ? Infinity : box.qicl;
    if (Number.isFinite(qicl)) el(`Ricl br bf ${num(qicl / ((1 / Math.sqrt(masEq * casEq)) * casEq))}`);
  } else if (box.kind !== "free-air") {
    el(`Rbl_box box 0 ${num(BLEED)}`);
    boxPressure = "box";
    const cab = airCompliance(box.vb_l, air);
    const ql = lossQ(box.ql, DEFAULT_Q.ql);
    const qa = lossQ(box.qa, DEFAULT_Q.qa);
    let cAbs = cab;
    let cLeak = cab;
    if (box.kind === "sealed") {
      // Ledger #4, #5, #18: Fc = Fs·√(1 + n·Cas′/Cab); Qa against Cab in series with n·Cas′.
      fRef = (1 / (TAU * Math.sqrt(masEq * casEq))) * Math.sqrt(1 + (bank.n * casEq) / cab);
      cAbs = (cab * bank.n * casEq) / (cab + bank.n * casEq);
    } else if (box.kind === "vented") {
      const count = box.portCount ?? 1;
      const k = box.endCorrection ?? opts.endCorrection ?? DEFAULT_END_CORRECTION;
      const map = portMass(box.port, air, k);
      // Helmholtz: Fb = 1/(2π·√((Map/n)·Cab)) (Beranek & Mellow eq. 4.60).
      fRef = 1 / (TAU * Math.sqrt((map / count) * cab));
      const qp = lossQ(box.qp, DEFAULT_Q.qp);
      const rap = Number.isFinite(qp) ? (TAU * fRef * map) / qp : 0;
      // n identical ports in parallel = one branch of Z/n.
      if (rap > 0) el(`Rap box p1 ${num(rap / count)}`);
      else el(`Vrap box p1 0`);
      el(`Lmap p1 p2 ${num(map / count)}`);
      el(`Vport p2 0 0`);
      port = "Vport";
      el(`Fvp 0 vn Vport ${num(1 / (count * portSpeedArea(box.port)))}`);
      el(`Rvn vn 0 1`);
      portSpeed = "vn";
    } else {
      const groups = [{ pr: box.pr, count: box.prCount ?? 1, addedMass_g: box.addedMass_g ?? 0 }, ...(box.extraPrs ?? [])];
      // Ledger #21: all PRs lumped into one against the box spring.
      let invMass = 0;
      let cap = 0;
      groups.forEach((g, i) => {
        const k = i + 1;
        const m = prElements(g.pr, g.addedMass_g ?? 0, air);
        const s2 = m.sd * m.sd;
        invMass += g.count / (m.mmp / s2);
        cap += g.count * m.cmp * s2;
        el(`Rpr${k} box r${k} ${num(m.rmp / s2 / g.count)}`);
        el(`Lpr${k} r${k} q${k} ${num(m.mmp / s2 / g.count)}`);
        el(`Cpr${k} q${k} s${k} ${num(m.cmp * s2 * g.count)}`);
        el(`Vpr${k} s${k} 0 0`);
        el(`Fxp${k} 0 xp${k} Vpr${k} ${num(1 / (g.count * m.sd))}`);
        el(`Cxp${k} xp${k} 0 1`);
        el(`Rbl_xp${k} xp${k} 0 ${num(BLEED)}`);
        prs.push(`Vpr${k}`);
        prExcursion.push(`xp${k}`);
      });
      fRef = Math.sqrt((1 / cap + 1 / cab) * invMass) / TAU;
      // Ledger #22: both losses against Cab in series with the PRs.
      cAbs = cLeak = (cab * cap) / (cab + cap);
    }
    const wRef = TAU * fRef;
    // Ledger #7: absorption in series with the box's compliance.
    if (Number.isFinite(qa)) {
      el(`Rab box b1 ${num(1 / (qa * wRef * cAbs))}`);
      el(`Cab b1 0 ${num(cab)}`);
      el(`Rbl_b1 b1 0 ${num(BLEED)}`);
    } else el(`Cab box 0 ${num(cab)}`);
    // Ledger #6, #9: leak across the box; its flow radiates ("heard").
    if (Number.isFinite(ql)) {
      el(`Ral box l1 ${num(ql / (wRef * cLeak))}`);
      el(`Vleak l1 0 0`);
      leak = "Vleak";
    }
  }

  // --- Probes ---
  // Pressure: radiated U0 = openings to the room + leaks (− the cones, unless bandpass), into L = ρ/(kπr).
  // Ledger #29: with the port or PRs d away, they radiate into their own node, delayed by d/c.
  const dist = (box.kind === "vented" || box.kind === "passive-radiator" || (box.kind === "bandpass" && rearOpening.length > 0)) && "ventDistance_cm" in box ? Math.max(0, box.ventDistance_cm ?? 0) / 100 : 0;
  const near = dist > 0 ? "prc" : "prs";
  const far = dist > 0 ? "prv" : "prs";
  if (box.kind === "bandpass") radiating.forEach((s, k) => el(`Fpo${k + 1} 0 ${rearOpening.includes(s) ? far : near} ${s} 1`));
  else {
    for (let u = 1; u <= bank.n; u++) el(`Fpc${u} 0 ${near} Vcone${u} -1`);
    if (port) el(`Fpp 0 ${far} ${port} 1`);
    if (leak) el(`Fpl 0 ${far} ${leak} 1`);
    prs.forEach((s, k) => el(`Fpr${k + 1} 0 ${far} ${s} 1`));
  }
  const lrad = num(air.rho / (space * Math.PI * r));
  if (dist > 0) {
    el(`Lradc prc 0 ${lrad}`);
    el(`Lradv prv 0 ${lrad}`);
    // Unity buffer into a matched lossless line: V(pvd) = V(prv)·e^(−jω·d/c).
    el(`Ebuf pvb 0 prv 0 1`);
    el(`Tpos pvb 0 pvd 0 Z0=1 Td=${num(dist / air.c)}`);
    el(`Rtpos pvd 0 1`);
    el(`Eprc prs pm prc 0 1`);
    el(`Eprv pm 0 pvd 0 1`);
  } else el(`Lrad prs 0 ${lrad}`);
  el(`Fx 0 xn Vcone1 ${num(1 / d.sd)}`);
  el(`Cx xn 0 1`);
  el(`Rbl_xn xn 0 ${num(BLEED)}`);

  const vProbes = ["spk", "prs", "xn", portSpeed, rearPortSpeed, boxPressure, frontPressure, ...prExcursion].filter((p): p is string => !!p);
  const iProbes = ["Vin", "Vcone1", port, leak, ...prs].filter((p): p is string => !!p);
  L.push(`* probes: ${[...vProbes.map((p) => `V(${p})`), ...iProbes.map((p) => `I(${p})`)].join(" ")}`);
  const { perDecade, fMin, fMax } = c.sweep;
  L.push(...models);
  L.push(`.ac dec ${perDecade} ${num(fMin)} ${num(fMax)}`);
  L.push(`.end`);
  return {
    text: L.join("\n") + "\n",
    probes: {
      phaseFlip: box.kind !== "bandpass",
      frontPressure,
      rearPortSpeed,
      terminals: "spk",
      coilSense: "Vin",
      pressure: "prs",
      excursion: "xn",
      portSpeed,
      boxPressure,
      prExcursion,
      cone: "Vcone1",
      port,
      leak,
      prs,
    },
    fRef,
  };
}
export type { SpiceCase } from "./elements.ts";
