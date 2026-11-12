import { useState } from "react";
import { Sparkle } from "./Logo.tsx";
import { Card, Num, Select } from "./components.tsx";
import { useUnits } from "./units.ts";
import { dimensionsFor, linkedDesign, solveWedgeFor, volumeFor, wedgeToVolume } from "./sim.ts";
import { stuffFactor } from "./stuffing.ts";
import type { AppState, ShapeKind } from "./state.ts";
import { WedgeFields } from "./WedgeFields.tsx";
import { Preview3D } from "./Preview3D.tsx";

const SHAPES: { value: ShapeKind; text: string }[] = [
  { value: "box", text: "Box" },
  { value: "wedge", text: "Car wedge (single slope)" },
  { value: "cylinder", text: "Cylinder (sonotube)" },
  { value: "sphere", text: "Sphere" },
  // Was "Truncated pyramid": the id stays "frustum" so older links still open.
  { value: "frustum", text: "Tapered (all sides)" },
];

export function VolumePanel(props: { state: AppState; onChange: (v: AppState["volume"]) => void }) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const { fmt } = useUnits();
  const target = linkedDesign(s);
  const r = volumeFor(s, target);
  const fill = target ? stuffFactor(target) : 1;
  // Fields for parts the linked design doesn't have are hidden (unlinked: all shown).
  const rearOf = (d: typeof target) => (d?.kind === "bandpass" && d.order !== "4" ? d.rearOpening : null);
  const hasPr = !target || target.kind === "pr" || rearOf(target) === "pr";
  const hasPort = !target || target.kind === "vented" || rearOf(target) === "port";
  const linkOptions: { value: string; text: string }[] = [
    { value: "none", text: "No design (just calculate)" },
    ...s.designs.filter((d) => d.kind !== "line").map((d) => ({ value: d.id, text: d.name || d.id })),
  ];

  // Find dimensions for a target volume (what the box volume will be in the simulation).
  const [aim, setAim] = useState(() => Math.round(r.net_l * 10) / 10);
  // null = the shape's default (the first option below).
  const [proportions, setProportions] = useState<Sizing | null>(null);
  const ratioOptions: { value: Sizing; text: string }[] =
    v.shape === "box"
      ? [
          { value: "keep", text: "Keep the current ones" },
          { value: "golden", text: "Golden ratio (1 : 1.618 : 0.618)" },
        ]
      : v.shape === "cylinder"
        ? [
            { value: "length", text: "Keep the diameter (change the length)" },
            { value: "keep", text: "Keep the current proportions" },
          ]
        : v.shape === "wedge"
          ? [
              { value: "keep", text: "Keep the proportions (and the slope)" },
              { value: "width", text: "Solve for the width" },
              { value: "height", text: "Solve for the height" },
              { value: "topDepth", text: "Solve for the top depth" },
              { value: "bottomDepth", text: "Solve for the bottom depth" },
            ]
          : [{ value: "keep", text: "Keep the current ones" }];
  // The choice in force for this shape (a tube defaults to keeping its diameter: tubes come in set sizes).
  const ratio = proportions && ratioOptions.some((o) => o.value === proportions) ? proportions : ratioOptions[0]!.value;
  const [found, setFound] = useState("");
  // 3D take-apart view: off until asked for (it loads its own code).
  const [show3d, setShow3d] = useState(false);
  const find = (aimAt = aim) => {
    if (v.shape === "wedge" && ratio !== "keep" && ratio !== "golden" && ratio !== "length") {
      const r = solveWedgeFor(s, target, ratio, aimAt);
      if (!r) {
        setFound(`No size reaches ${fmt(aimAt, "vol", 1)}: the deductions alone are larger. Lower them or aim higher.`);
        return;
      }
      const next = wedgeToVolume(v, r.ok ? r.dims : r.nearest);
      const got = volumeFor({ ...s, volume: next }, target).net_l;
      if (r.ok) {
        props.onChange(next);
        setFound(`Done: ${describe(next, fmt)} gives ${fmt(got, "vol", 2)}.`);
      } else {
        setFound(`Target not reachable with these locks. Nearest: ${describe(next, fmt)}, ${fmt(got, "vol", 2)}. Solve for another dimension, or keep the proportions.`);
      }
      return;
    }
    const dims = dimensionsFor(s, target, aimAt, ratio === "golden" || ratio === "length" ? ratio : "keep");
    if (!dims) {
      setFound(`No size reaches ${fmt(aimAt, "vol", 1)}: the deductions alone are larger. Lower them or aim higher.`);
      return;
    }
    props.onChange(dims);
    const got = volumeFor({ ...s, volume: dims }, target).net_l;
    setFound(`Done: ${describe(dims, fmt)} gives ${fmt(got, "vol", 2)}.`);
  };

  // Not linked: the calculator sizes a box of its own. Offer the first box design's volume as the
  // target in one tap, without linking (linking would set that design's volume from this box).
  const offer = target ? undefined : s.designs.find((d) => d.on && (d.kind === "sealed" || d.kind === "vented" || d.kind === "pr"));
  return (
    <Card title="Volume calculator">
      {offer && (
        <div className="calc-offer">
          <span>Not linked to a design: this box is sized on its own.</span>
          <button
            type="button"
            className="chip"
            onClick={() => {
              const l = Math.round(offer.vb_l * 10) / 10;
              setAim(l);
              find(l);
            }}
          >
<Sparkle />
            Size for {offer.name || "the first design"} ({fmt(offer.vb_l, "vol", 1)})
          </button>
        </div>
      )}
      <div className="fields">
        <Select help="Which designs take their box volume from this calculator (their volume field then follows it)." label="Used by" value={target ? v.link : "none"} options={linkOptions} onChange={(x) => set("link", x)} />
        <Select help="Outside shape of the enclosure: box, car wedge (one sloped panel), cylinder (tube), sphere or tapered on all sides (frustum)." label="Shape" value={v.shape} options={SHAPES} onChange={(x) => set("shape", x)} />
      </div>

      <h3>Size the box</h3>
      <div className="fields">
        <Num help="The net volume you want; Size the box sets the dimensions for it." label="Target" q="vol" value={aim} onChange={setAim} />
        <Select<Sizing> help={v.shape === "cylinder" ? "Keep the tube's diameter and find its length (tubes come in set sizes), or scale the whole tube." : v.shape === "wedge" ? "Scale the whole wedge (the slope stays), or lock the other dimensions and solve for one." : "Keep the box's current proportions, or use the golden ratio (spreads its internal standing waves)."}
          label={v.shape === "wedge" ? "Solve for" : "Ratio"}
          value={ratio}
          options={ratioOptions}
          onChange={setProportions}
        />
      </div>
      <div className="row">
        <button className="secondary" onClick={() => find()}>
          <Sparkle />
          Size the box
        </button>
      </div>
      <p className="hint">
        Outside dimensions for this net volume, with the
        walls and everything below taken off.
      </p>
      {found && <p className="hint">{found}</p>}

      <h3>External size</h3>
      {v.shape === "wedge" && <WedgeFields state={s} onChange={props.onChange} show3d={show3d} onShow3d={setShow3d} />}
      <div className="fields">
        {v.shape === "box" && (
          <>
            <Num help="Outside width of the box." label="Width" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num help="Outside height of the box." label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
            <Num help="Outside depth of the box (front to back)." label="Depth" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
          </>
        )}
        {v.shape === "cylinder" && (
          <>
            <Num help="Outside diameter of the tube. Concrete-form tubes (Sonotube) are sold by their inside diameter: add twice the wall." label="Diameter" q="len" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
            <Num help="Outside length, end cap to end cap." label="Length" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        {v.shape === "sphere" && (
          <Num help="Outside diameter of the sphere." label="Diameter" q="len" value={v.diameter_cm} onChange={(x) => set("diameter_cm", x)} />
        )}
        {v.shape === "frustum" && (
          <>
            <Num help="Outside width at the bottom of the tapered box." label="Bottom W" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
            <Num help="Outside depth at the bottom of the tapered box." label="Bottom D" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
            <Num help="Outside width at the top (0 = a point, like a pyramid)." label="Top W" q="len" value={v.topWidth_cm} min={0} onChange={(x) => set("topWidth_cm", x)} />
            <Num help="Outside depth at the top. For a wedge sloped on one face only (a car wedge), use the Car wedge shape: it is exact." label="Top D" q="len" value={v.topDepth_cm} min={0} onChange={(x) => set("topDepth_cm", x)} />
            <Num help="Outside height of the tapered box." label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          </>
        )}
        <Num help={v.shape === "cylinder" ? "Thickness of the tube's wall. Taken off all round to get the inside volume." : "Wall thickness (e.g. 18 mm MDF). Taken off every side to get the inside volume."} label="Walls" q="mm" value={v.wall_mm} min={0} onChange={(x) => set("wall_mm", x)} />
        {v.shape === "cylinder" && (
          <Num help="Thickness of each end cap (often thicker than the tube, e.g. two layers of 18 mm MDF). Taken off both ends. Follows the wall until you change it." label="End caps" q="mm" value={v.capWall_mm ?? v.wall_mm} min={0} onChange={(x) => set("capWall_mm", x)} />
        )}
      </div>
      {v.shape !== "wedge" && (
        <>
          <div className="row">
            <button type="button" className={`chip${show3d ? " on" : ""}`} aria-pressed={show3d} onClick={() => setShow3d(!show3d)}>
              3D view
            </button>
            <span className="hint">Turn the box round and take it apart, piece by piece.</span>
          </div>
          {show3d && <Preview3D state={s} />}
        </>
      )}

      <h3>Takes up space inside</h3>
      <div className="fields">
        <Num help="Air each driver takes up inside the box (its displacement, from the datasheet)." label="Each driver" q="vol" value={v.driverDisp_l} min={0} onChange={(x) => set("driverDisp_l", x)} />
        {hasPr && <Num help="Air each passive radiator takes up inside the box." label="Each PR" q="vol" value={v.prDisp_l} min={0} onChange={(x) => set("prDisp_l", x)} />}
        {hasPort && <Num help="Wall thickness of the port tube: the tube's own volume is taken off too." label="Port wall" q="mm" value={v.portWall_mm} min={0} onChange={(x) => set("portWall_mm", x)} />}
        <Num help="Bracing, as a share of the inside volume (5% is typical for a well-braced box)." label="Bracing" unit="%" value={v.bracing_pct} min={0} onChange={(x) => set("bracing_pct", x)} />
        <Num help="Anything else inside (crossover, amplifier plate, handles), in litres." label="Other" q="vol" value={v.other_l} min={0} onChange={(x) => set("other_l", x)} />
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
          {fill !== 1 && (
            <tr className="total">
              <th>Acts as (stuffing)</th>
              <td>{fmt(r.net_l * fill, "vol", 2)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">
        {!target
          ? "Choose a design under “Used by” (or use “Size from dimensions…” on a design) to use this volume live in the simulation."
          : `“${target.name}” uses this volume, including deductions for its own ports or passive radiators.`}{" "}
        Driver displacement is filled in from the database when known (an estimate from cutout and depth otherwise).
        Stuffing is set on each design, not here: the fibre itself takes up only about 1% of the box.
      </p>
    </Card>
  );
}

/** How Size the box changes the shape: scale it (or, for a box, to the golden ratio; a tube's length only), or solve one wedge dimension. */
type Sizing = "keep" | "golden" | "length" | "width" | "height" | "topDepth" | "bottomDepth";

/** "40 × 50 × 45 cm box" style summary of the outside size. */
function describe(v: AppState["volume"], fmt: (x: number, q: "len", digits?: number) => string): string {
  switch (v.shape) {
    case "box":
      return `a ${fmt(v.width_cm, "len", 1)} × ${fmt(v.height_cm, "len", 1)} × ${fmt(v.depth_cm, "len", 1)} box (W × H × D)`;
    case "cylinder":
      return `a cylinder ${fmt(v.diameter_cm, "len", 1)} across and ${fmt(v.height_cm, "len", 1)} long`;
    case "sphere":
      return `a sphere ${fmt(v.diameter_cm, "len", 1)} across`;
    case "wedge":
      return `a wedge ${fmt(v.width_cm, "len", 1)} wide, ${fmt(v.height_cm, "len", 1)} tall, ${fmt(v.topDepth_cm, "len", 1)} deep at the top and ${fmt(v.depth_cm, "len", 1)} at the bottom`;
    case "frustum":
      return `a tapered box ${fmt(v.width_cm, "len", 1)} × ${fmt(v.depth_cm, "len", 1)} at the base, ${fmt(v.topWidth_cm, "len", 1)} × ${fmt(v.topDepth_cm, "len", 1)} at the top, ${fmt(v.height_cm, "len", 1)} tall`;
  }
}
