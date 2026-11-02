/** Minimal complex arithmetic for the circuit solver. */
export interface Complex {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });
export const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const inv = (a: Complex): Complex => div(cx(1), a);
export const abs = (a: Complex): number => Math.hypot(a.re, a.im);
export const arg = (a: Complex): number => Math.atan2(a.im, a.re);

/** Parallel combination of impedances. `null` means an open circuit (infinite impedance). */
export function parallel(...zs: (Complex | null)[]): Complex | null {
  let y: Complex | null = null;
  for (const z of zs) {
    if (z === null) continue;
    y = y === null ? inv(z) : add(y, inv(z));
  }
  return y === null ? null : inv(y);
}
