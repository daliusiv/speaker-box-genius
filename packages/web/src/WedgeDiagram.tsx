import { buildWedgePanels, wedgeGeometry, type MountCheck, type Vec2, type WedgeDims, type WedgeJoinery, type WedgeSlope } from "@sbg/engine";

/** Which dimension a focused field changes, to light it up on the drawing. */
export type WedgeDim = "W" | "H" | "D1" | "D2" | "theta" | "T" | "Tb" | "driver";

/**
 * Side view of the car wedge: the walls hatched (the sloped panel in its own hatch), the
 * inside dashed, D1 along the top, D2 along the bottom, H up the back and θ at the foot of the
 * slope. The back (against the seat) is on the left, the trunk opening on the right. With a
 * driver: its axis and motor outline, red when the motor hits a wall.
 */
export function WedgeDiagram(props: { d: WedgeDims; slope: WedgeSlope; joinery: WedgeJoinery; focus: WedgeDim | null; mount?: MountCheck | null; cutout?: number }) {
  const { d, slope, focus } = props;
  const H = d.height, D2 = d.bottomDepth, D1 = d.topDepth;
  if (!(H > 0 && D2 > 0 && D1 >= 0)) return null;
  let set: ReturnType<typeof buildWedgePanels> | null = null;
  try {
    set = buildWedgePanels({ ...d, slope, joinery: props.joinery });
  } catch {
    set = null;
  }
  const g = wedgeGeometry(d);
  const rear = slope === "rear";
  const big = Math.max(H, D2);
  const fs = big * 0.045;
  const m = big * 0.16;
  // Engine y is up; SVG y is down.
  const P = (p: Vec2) => `${p[0].toFixed(2)},${(H - p[1]).toFixed(2)}`;
  const poly = (ps: Vec2[]) => ps.map(P).join(" ");
  const outer: Vec2[] = rear ? [[0, 0], [D2, 0], [D2, H], [D2 - D1, H]] : [[0, 0], [D2, 0], [D1, H], [0, H]];
  const on = (k: WedgeDim) => (focus === k ? " on" : "");
  // θ at the foot of the slope.
  const foot: Vec2 = rear ? [0, 0] : [D2, 0];
  const th = (g.theta * Math.PI) / 180;
  const r = big * 0.09;
  const arcEnd: Vec2 = rear ? [r * Math.cos(th), r * Math.sin(th)] : [D2 - r * Math.cos(th), r * Math.sin(th)];
  const arcStart: Vec2 = rear ? [r, 0] : [D2 - r, 0];
  const topX0 = rear ? D2 - D1 : 0;
  const bad = props.mount && !props.mount.ok;
  // Middle of the sloped face, a little outside it (slope front).
  const mid: Vec2 = [(D1 + D2) / 2 + Math.sin(th) * fs * 1.2, H / 2 - Math.cos(th) * fs * 1.2];
  return (
    <svg className="wedge-drawing" viewBox={`${-m} ${-m} ${D2 + 2 * m} ${H + 2 * m}`} role="img" aria-label="Side view of the wedge: back against the seat on the left, trunk opening on the right">
      <defs>
        <pattern id="wedge-hatch" width={fs * 0.5} height={fs * 0.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={fs * 0.5} className="wedge-hatch-line" strokeWidth={fs * 0.08} />
        </pattern>
        <pattern id="wedge-hatch-slope" width={fs * 0.35} height={fs * 0.35} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1={0} y1={0} x2={0} y2={fs * 0.35} className="wedge-hatch-slope-line" strokeWidth={fs * 0.08} />
        </pattern>
      </defs>
      {set ? (
        <>
          {set.panels
            .filter((p) => p.role !== "side")
            .map((p) => {
              const sloped = (rear ? p.role === "back" : p.role === "baffle") && D1 !== D2;
              return <polygon key={p.id} points={poly(p.profile)} className={`wedge-wall${sloped ? " sloped" : ""}${sloped && focus === "Tb" ? " on" : !sloped && focus === "T" ? " on" : ""}`} fill={`url(#${sloped ? "wedge-hatch-slope" : "wedge-hatch"})`} />;
            })}
          <polygon points={poly(set.cavity.profile)} className="wedge-cavity" strokeWidth={fs * 0.08} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} />
        </>
      ) : null}
      <polygon points={poly(outer)} className={`wedge-outline${set ? "" : " bad"}`} strokeWidth={fs * 0.1} />

      {/* D1 along the top, D2 along the bottom, H up the back. */}
      <g className={`wedge-dim${on("D1")}`} fontSize={fs}>
        <line x1={topX0} y1={-m * 0.35} x2={topX0 + D1} y2={-m * 0.35} strokeWidth={fs * 0.07} />
        <text x={topX0 + D1 / 2} y={-m * 0.35 - fs * 0.4} textAnchor="middle">D1 {Math.round(D1)}</text>
      </g>
      <g className={`wedge-dim${on("D2")}`} fontSize={fs}>
        <line x1={0} y1={H + m * 0.35} x2={D2} y2={H + m * 0.35} strokeWidth={fs * 0.07} />
        <text x={D2 / 2} y={H + m * 0.35 + fs * 1.1} textAnchor="middle">D2 {Math.round(D2)}</text>
      </g>
      <g className={`wedge-dim${on("H")}`} fontSize={fs}>
        <line x1={rear ? D2 + m * 0.3 : -m * 0.3} y1={0} x2={rear ? D2 + m * 0.3 : -m * 0.3} y2={H} strokeWidth={fs * 0.07} />
        <text x={rear ? D2 + m * 0.42 : -m * 0.42} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${rear ? D2 + m * 0.42 : -m * 0.42} ${H / 2})`}>H {Math.round(H)}</text>
      </g>
      {D1 < D2 && (
        <g className={`wedge-dim${on("theta")}`} fontSize={fs}>
          <path d={`M ${P(arcStart)} A ${r} ${r} 0 0 ${rear ? 0 : 1} ${P(arcEnd)}`} fill="none" strokeWidth={fs * 0.07} />
          <text x={foot[0] + (rear ? 1 : -1) * r * 1.5} y={H - fs * 0.4} textAnchor="middle">θ {g.theta.toFixed(1)}°</text>
        </g>
      )}

      <text className="wedge-label" fontSize={fs * 0.8} x={-m * 0.75} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${-m * 0.75} ${H / 2})`}>
        BACK — against seat
      </text>
      {!rear && (
        <text className="wedge-label" fontSize={fs * 0.8} x={mid[0]} y={mid[1]} textAnchor="middle" transform={`rotate(${g.theta.toFixed(2)} ${mid[0]} ${mid[1]})`}>
          BAFFLE
        </text>
      )}
      {rear && (
        <text className="wedge-label" fontSize={fs * 0.8} x={D2 + m * 0.75} y={H / 2} textAnchor="middle" transform={`rotate(90 ${D2 + m * 0.75} ${H / 2})`}>
          BAFFLE
        </text>
      )}
      <text className="wedge-label" fontSize={fs * 0.8} x={D2 + m * (rear ? 0.05 : 0.1)} y={H + m * 0.75} textAnchor="end">
        → trunk opening
      </text>

      {props.mount && props.cutout && props.cutout > 0 && (
        <DriverSection mount={props.mount} cutout={props.cutout} H={H} bad={!!bad} focus={focus === "driver"} fs={fs} slope={slope} theta={g.theta} />
      )}
    </svg>
  );
}

function DriverSection(p: { mount: MountCheck; cutout: number; H: number; bad: boolean; focus: boolean; fs: number; slope: WedgeSlope; theta: number }) {
  const th = (p.theta * Math.PI) / 180;
  const u: Vec2 = p.slope === "front" ? [-Math.cos(th), Math.sin(th)] : [0, 1];
  const c = p.mount.center;
  const rc = p.cutout / 2;
  const a: Vec2 = [c[0] + rc * u[0], c[1] + rc * u[1]];
  const b: Vec2 = [c[0] - rc * u[0], c[1] - rc * u[1]];
  const [q1, q2] = p.mount.corners;
  const P = (v: Vec2) => `${v[0].toFixed(2)},${(p.H - v[1]).toFixed(2)}`;
  // The axis runs on past the motor a little, outwards through the baffle.
  const n: Vec2 = [p.mount.rear[0] - c[0], p.mount.rear[1] - c[1]];
  const ext: Vec2 = [c[0] - n[0] * 0.35, c[1] - n[1] * 0.35];
  return (
    <g className={`wedge-driver${p.bad ? " bad" : ""}${p.focus ? " on" : ""}`}>
      <polygon points={[a, q1, q2, b].map(P).join(" ")} strokeWidth={p.fs * 0.08} />
      <line x1={ext[0]} y1={p.H - ext[1]} x2={p.mount.rear[0]} y2={p.H - p.mount.rear[1]} strokeWidth={p.fs * 0.06} strokeDasharray={`${p.fs * 0.4} ${p.fs * 0.2}`} />
    </g>
  );
}
