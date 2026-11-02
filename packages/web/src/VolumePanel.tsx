import { Card, Num, Select } from "./components.tsx";
import { LABELS, volumeFor } from "./sim.ts";
import type { AppState, DesignKey, ShapeKind } from "./state.ts";

const SHAPES: { value: ShapeKind; text: string }[] = [
  { value: "box", text: "Box" },
  { value: "cylinder", text: "Cylinder (sonotube)" },
  { value: "sphere", text: "Sphere" },
  { value: "frustum", text: "Truncated pyramid" },
];

export function VolumePanel(props: { state: AppState; onChange: (v: AppState["volume"]) => void }) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const r = volumeFor(s, v.link);
  const linkOptions: { value: DesignKey | "none"; text: string }[] = [
    { value: "none", text: "Nothing (just calculate)" },
    { value: "sealed", text: LABELS.sealed },
    { value: "vented", text: LABELS.vented },
    { value: "pr", text: LABELS.pr },
  ];

  return (
    <Card title="Volume calculator">
      <div className="fields">
        <Select label="Feeds" value={v.link} options={linkOptions} onChange={(x) => set("link", x)} />
        <Select label="Shape" value={v.shape} options={SHAPES} onChange={(x) => set("shape", x)} />
      </div>

      <h3>External size</h3>
      <div className="fields">
        {v.shape === "box" && (
          <>
            <Num label="Width" unit="cm" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num label="Height" unit="cm" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
            <Num label="Depth" unit="cm" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
          </>
        )}
        {v.shape === "cylinder" && (
          <>
            <Num label="Diameter" unit="cm" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
            <Num label="Length" unit="cm" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        {v.shape === "sphere" && (
          <Num label="Diameter" unit="cm" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
        )}
        {v.shape === "frustum" && (
          <>
            <Num label="Bottom W" unit="cm" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num label="Bottom D" unit="cm" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
            <Num label="Top W" unit="cm" value={v.topWidth_cm} min={0} onChange={(x) => set("topWidth_cm", x)} />
            <Num label="Top D" unit="cm" value={v.topDepth_cm} min={0} onChange={(x) => set("topDepth_cm", x)} />
            <Num label="Height" unit="cm" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        <Num label="Walls" unit="mm" value={v.wall_mm} min={0} onChange={(x) => set("wall_mm", x)} />
      </div>

      <h3>Takes up space inside</h3>
      <div className="fields">
        <Num label="Each driver" unit="L" value={v.driverDisp_l} min={0} onChange={(x) => set("driverDisp_l", x)} />
        <Num label="Each PR" unit="L" value={v.prDisp_l} min={0} onChange={(x) => set("prDisp_l", x)} />
        <Num label="Port wall" unit="mm" value={v.portWall_mm} min={0} onChange={(x) => set("portWall_mm", x)} />
        <Num label="Bracing" unit="%" value={v.bracing_pct} min={0} onChange={(x) => set("bracing_pct", x)} />
        <Num label="Other" unit="L" value={v.other_l} min={0} onChange={(x) => set("other_l", x)} />
        <Num label="Stuffing +" unit="%" value={v.fill_pct} min={0} onChange={(x) => set("fill_pct", x)} />
      </div>

      <table className="breakdown">
        <tbody>
          <tr>
            <th>Gross internal</th>
            <td>{r.gross_l.toFixed(2)} L</td>
          </tr>
          {r.deductions.map((d) => (
            <tr key={d.label}>
              <th>− {d.label}</th>
              <td>{d.litres.toFixed(2)} L</td>
            </tr>
          ))}
          <tr className="total">
            <th>Net</th>
            <td>{r.net_l.toFixed(2)} L</td>
          </tr>
          {v.fill_pct > 0 && (
            <tr className="total">
              <th>Effective (with stuffing)</th>
              <td>{r.effective_l.toFixed(2)} L</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">
        {v.link === "none"
          ? "Choose a design under “Feeds” to use this volume live in the simulation."
          : `The ${LABELS[v.link]} design uses this volume. Ports and passive radiators are only deducted for the design they belong to.`}{" "}
        Driver displacement is filled in from the database when known (an estimate from cutout and depth otherwise).
        Stuffing gain is approximate.
      </p>
    </Card>
  );
}
