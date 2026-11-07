import { add, cx, div, inv, mul, type Complex } from "./complex.ts";

/**
 * Passive network between the amplifier and the driver bank: a ladder of up to four
 * branches, as in Hornresp's Filter Wizard (Passive). Branches 1 and 3 are in line with
 * the speaker, branches 2 and 4 across it (2 after 1, 4 after 3, so the speaker sits after
 * branch 4). Each branch is a resistor, coil and capacitor, all in series or all in parallel;
 * a part left at 0 isn't fitted.
 *
 * Examples: a series coil (low-pass, 1st order) = branch 1 with L and the coil's DCR as R;
 * a 2nd-order low-pass adds a capacitor across (branch 2, C); a Zobel = branch 4, R + C in
 * series; an L-pad = branch 1 R and branch 2 R.
 */
export interface PassiveBranch {
  /** Resistance (Ω): a resistor, or a coil's DC resistance. 0 = none. */
  r?: number;
  /** Inductance (mH). 0 = none. */
  l_mH?: number;
  /** Capacitance (µF). 0 = none. */
  c_uF?: number;
  /** How the branch's parts are joined: "series" (default) or "parallel". */
  join?: "series" | "parallel";
}

export interface PassiveNetwork {
  /** Branches 1–4: in line, across, in line, across. Missing or empty = not fitted. */
  branches: PassiveBranch[];
}

const fitted = (b: PassiveBranch | undefined): b is PassiveBranch => !!b && ((b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0);

/** True when the network has at least one part fitted. */
export const passiveActive = (n: PassiveNetwork | null | undefined): n is PassiveNetwork => !!n && n.branches.some(fitted);

/**
 * A branch's impedance at ω. Reactive parts can be left out: `dc` gives the reference
 * network (coils as wires; capacitors as wires in line, as gaps across), which sets the
 * passband level the way a plain resistance would.
 */
function branchZ(b: PassiveBranch, w: number, inLine: boolean, dc = false): Complex | null {
  const r = b.r ?? 0, l = (b.l_mH ?? 0) / 1000, c = (b.c_uF ?? 0) / 1e6;
  if (b.join === "parallel") {
    // Admittances add; a coil at DC is a short, so the whole branch is.
    let y = cx(0);
    if (r > 0) y = add(y, cx(1 / r));
    if (l > 0) {
      if (dc) return cx(0);
      y = add(y, cx(0, -1 / (w * l)));
    }
    if (c > 0 && !dc) y = add(y, cx(0, w * c));
    if (y.re === 0 && y.im === 0) return inLine ? cx(0) : null; // a capacitor alone at DC: a wire in line, a gap across
    return inv(y);
  }
  let z = cx(r);
  if (l > 0 && !dc) z = add(z, cx(0, w * l));
  if (c > 0) {
    if (dc) {
      if (!inLine) return null; // a capacitor across blocks DC: no branch
    } else z = add(z, cx(0, -1 / (w * c)));
  }
  return z;
}

/** ABCD (transmission) matrix of the network at ω, from the amplifier side to the speaker side. */
export function passiveAbcd(n: PassiveNetwork, w: number, dc = false): [Complex, Complex, Complex, Complex] {
  let m: [Complex, Complex, Complex, Complex] = [cx(1), cx(0), cx(0), cx(1)];
  n.branches.slice(0, 4).forEach((b, k) => {
    if (!fitted(b)) return;
    const inLine = k % 2 === 0;
    const z = branchZ(b, w, inLine, dc);
    if (z === null) return;
    // In line: [1 Z; 0 1]. Across: [1 0; 1/Z 1].
    const e: [Complex, Complex, Complex, Complex] = inLine ? [cx(1), z, cx(0), cx(1)] : [cx(1), cx(0), inv(z), cx(1)];
    m = [add(mul(m[0], e[0]), mul(m[1], e[2])), add(mul(m[0], e[1]), mul(m[1], e[3])), add(mul(m[2], e[0]), mul(m[3], e[2])), add(mul(m[2], e[1]), mul(m[3], e[3]))];
  });
  return m;
}

/**
 * What the driver bank sees through the network, driven by an amplifier with source
 * resistance rg: the open-circuit voltage per volt from the amplifier, and the source impedance.
 */
export function passiveThevenin(n: PassiveNetwork, w: number, rg: number, dc = false): { v: Complex; z: Complex } {
  const [A, B, C, D] = passiveAbcd(n, w, dc);
  const den = add(A, mul(C, cx(rg)));
  return { v: inv(den), z: div(add(B, mul(D, cx(rg))), den) };
}

/** The impedance the amplifier sees: the network loaded by the bank (zb). */
export function passiveInputImpedance(n: PassiveNetwork, w: number, zb: Complex): Complex {
  const [A, B, C, D] = passiveAbcd(n, w);
  return div(add(mul(A, zb), B), add(mul(C, zb), D));
}

/** Voltage across the bank per volt from the amplifier (after rg), with the bank's impedance zb. */
export function passiveBankGain(n: PassiveNetwork, w: number, zb: Complex, rg: number): Complex {
  const [A, B, C, D] = passiveAbcd(n, w);
  return div(zb, add(add(mul(A, zb), B), mul(cx(rg), add(mul(C, zb), D))));
}
