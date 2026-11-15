/**
 * A tiny response curve (no axes): relative SPL against log frequency, with the 0 dB and −3 dB
 * lines, for a menu item or a summary. Decorative: the numbers beside it carry the meaning.
 */
export function MiniResponse(props: { freq: readonly number[]; db: readonly number[]; color?: string; width?: number; height?: number }) {
  const w = props.width ?? 64;
  const h = props.height ?? 32;
  const lo = -24;
  const hi = 3;
  const f0 = Math.log(props.freq[0] ?? 10);
  const f1 = Math.log(props.freq[props.freq.length - 1] ?? 200);
  const x = (f: number) => ((Math.log(f) - f0) / (f1 - f0 || 1)) * w;
  const y = (d: number) => ((hi - Math.max(lo, Math.min(hi, d))) / (hi - lo)) * h;
  const pts = props.freq.map((f, i) => `${x(f).toFixed(1)},${y(props.db[i] ?? lo).toFixed(1)}`).join(" ");
  return (
    <svg className="ui-mini-response" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" style={props.color ? { color: props.color } : undefined}>
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="ui-mini-response-ref" />
      <line x1={0} x2={w} y1={y(-3)} y2={y(-3)} className="ui-mini-response-ref" data-dashed />
      <polyline points={pts} className="ui-mini-response-line" />
    </svg>
  );
}
