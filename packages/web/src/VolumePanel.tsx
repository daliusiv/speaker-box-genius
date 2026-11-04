import { useState } from "react";
import { Card, Num, Select } from "./components.tsx";
import { useUnits } from "./units.ts";
import { dimensionsFor, linkedDesign, volumeFor } from "./sim.ts";
import type { AppState, ShapeKind } from "./state.ts";

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
  const { fmt } = useUnits();
  const target = linkedDesign(s);
  const r = volumeFor(s, target);
  const linkOptions: { value: string; text: string }[] = [
    { value: "none", text: "No design (just calculate)" },
    ...s.designs.filter((d) => d.kind !== "line").map((d) => ({ value: d.id, text: d.name || d.id })),
  ];

  // Find dimensions for a target volume (what the box volume will be in the simulation).
  const [aim, setAim] = useState(() => Math.round(r.effective_l * 10) / 10);
  const [proportions, setProportions] = useState<"keep" | "golden">("keep");
  const [found, setFound] = useState("");
  const find = () => {
    const dims = dimensionsFor(s, target, aim, proportions);
    if (!dims) {
      setFound(`No size reaches ${fmt(aim, "vol", 1)}: the deductions alone are larger. Lower them or aim higher.`);
      return;
    }
    props.onChange(dims);
    const got = volumeFor({ ...s, volume: dims }, target).effective_l;
    setFound(`Done: ${describe(dims, fmt)} gives ${fmt(got, "vol", 2)}.`);
  };

  return (
    <Card title="Volume calculator">
      <div className="fields">
        <Select label="Used by" value={target ? v.link : "none"} options={linkOptions} onChange={(x) => set("link", x)} />
        <Select label="Shape" value={v.shape} options={SHAPES} onChange={(x) => set("shape", x)} />
      </div>

      <h3>External size</h3>
      <div className="fields">
        {v.shape === "box" && (
          <>
            <Num label="Width" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
            <Num label="Depth" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
          </>
        )}
        {v.shape === "cylinder" && (
          <>
            <Num label="Diameter" q="len" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
            <Num label="Length" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        {v.shape === "sphere" && (
          <Num label="Diameter" q="len" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
        )}
        {v.shape === "frustum" && (
          <>
            <Num label="Bottom W" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num label="Bottom D" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
            <Num label="Top W" q="len" value={v.topWidth_cm} min={0} onChange={(x) => set("topWidth_cm", x)} />
            <Num label="Top D" q="len" value={v.topDepth_cm} min={0} onChange={(x) => set("topDepth_cm", x)} />
            <Num label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        <Num label="Walls" q="mm" value={v.wall_mm} min={0} onChange={(x) => set("wall_mm", x)} />
      </div>

      <h3>Find dimensions</h3>
      <div className="fields">
        <Num label="Target" q="vol" value={aim} onChange={setAim} />
        <Select<"keep" | "golden">
          label="Ratio"
          value={v.shape === "box" ? proportions : "keep"}
          options={
            v.shape === "box"
              ? [
                  { value: "keep", text: "Keep the current ones" },
                  { value: "golden", text: "Golden ratio (1 : 1.618 : 0.618)" },
                ]
              : [{ value: "keep", text: "Keep the current ones" }]
          }
          onChange={setProportions}
        />
      </div>
      <div className="row">
        <button className="secondary" onClick={find}>
          Find dimensions
        </button>
      </div>
      <p className="hint">
        Outside dimensions for this {v.fill_pct > 0 ? "effective volume (net plus the stuffing gain)" : "net volume"}, with the
        walls and everything below taken off.
      </p>
      {found && <p className="hint">{found}</p>}

      <h3>Takes up space inside</h3>
      <div className="fields">
        <Num label="Each driver" q="vol" value={v.driverDisp_l} min={0} onChange={(x) => set("driverDisp_l", x)} />
        <Num label="Each PR" q="vol" value={v.prDisp_l} min={0} onChange={(x) => set("prDisp_l", x)} />
        <Num label="Port wall" q="mm" value={v.portWall_mm} min={0} onChange={(x) => set("portWall_mm", x)} />
        <Num label="Bracing" unit="%" value={v.bracing_pct} min={0} onChange={(x) => set("bracing_pct", x)} />
        <Num label="Other" q="vol" value={v.other_l} min={0} onChange={(x) => set("other_l", x)} />
        <Num label="Stuffing +" unit="%" value={v.fill_pct} min={0} onChange={(x) => set("fill_pct", x)} />
      </div>

      <table className="breakdown">
        <tbody>
          <tr>
            <th>Gross internal</th>
            <td>{fmt(r.gross_l, "vol", 2)}</td>
          </tr>
          {r.deductions.map((d) => (
            <tr key={d.label}>
              <th>− {d.label}</th>
              <td>{fmt(d.litres, "vol", 2)}</td>
            </tr>
          ))}
          <tr className="total">
            <th>Net</th>
            <td>{fmt(r.net_l, "vol", 2)}</td>
          </tr>
          {v.fill_pct > 0 && (
            <tr className="total">
              <th>Effective (with stuffing)</th>
              <td>{fmt(r.effective_l, "vol", 2)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">
        {!target
          ? "Choose a design under “Used by” (or use “Size from dimensions…” on a design) to use this volume live in the simulation."
          : `“${target.name}” uses this volume, including deductions for its own ports or passive radiators.`}{" "}
        Driver displacement is filled in from the database when known (an estimate from cutout and depth otherwise).
        Stuffing gain is approximate.
      </p>
    </Card>
  );
}

/** "40 × 50 × 45 cm box" style summary of the outside size. */
function describe(v: AppState["volume"], fmt: (x: number, q: "len", digits?: number) => string): string {
  switch (v.shape) {
    case "box":
      return `a ${fmt(v.width_cm, "len", 1)} × ${fmt(v.height_cm, "len", 1)} × ${fmt(v.depth_cm, "len", 1)} box (W × H × D)`;
    case "cylinder":
      return `a cylinder ${fmt(v.diameter_cm, "len", 1)} across and ${fmt(v.height_cm, "len", 1)} long`;
    case "sphere":
      return `a sphere ${fmt(v.diameter_cm, "len", 1)} across`;
    case "frustum":
      return `a truncated pyramid ${fmt(v.width_cm, "len", 1)} × ${fmt(v.depth_cm, "len", 1)} at the base, ${fmt(v.height_cm, "len", 1)} tall`;
  }
}
