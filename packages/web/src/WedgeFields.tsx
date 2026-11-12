import { useState, type FocusEvent } from "react";
import { topDepthForAngle, wedgeAngles, wedgeDriverClearance, wedgeGeometry, wedgeIssues, type WedgeIssue } from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { cutoutFromSd, wedgeDimsOf } from "./sim.ts";
import { WedgeDiagram, type WedgeDim } from "./WedgeDiagram.tsx";
import type { AppState } from "./state.ts";
import { Preview3D } from "./Preview3D.tsx";

/** Field label → the dimension it lights up on the drawing. */
const DIM_OF: Record<string, WedgeDim> = {
  Width: "W",
  Height: "H",
  "Top depth (short)": "D1",
  "Slope angle": "theta",
  "Bottom depth (long)": "D2",
  Walls: "T",
  "Sloped panel": "Tb",
  "Driver depth": "driver",
  "Driver at": "driver",
};

/**
 * The car wedge's fields in the volume calculator: outside size, the sloped panel, which panel
 * slopes and how the corners are cut, the read-outs, the side-view drawing, the checks (with
 * Swap and Use Box) and whether the driver's motor clears the walls. The drawing switches to
 * the 3D take-apart view.
 */
export function WedgeFields(props: { state: AppState; onChange: (v: AppState["volume"]) => void; show3d?: boolean; onShow3d?: (on: boolean) => void }) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const [focus, setFocus] = useState<WedgeDim | null>(null);
  const [byAngle, setByAngle] = useState(false);
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const label = (e.target as HTMLElement).closest("label")?.querySelector("span")?.textContent ?? "";
    setFocus(DIM_OF[label] ?? null);
  };
  const d = wedgeDimsOf(v);
  const g = wedgeGeometry(d);
  const a = wedgeAngles(d);
  const Tb = v.slopeWall_mm ?? v.wall_mm;
  const doubled = v.slopeWall_mm !== null && Math.abs(v.slopeWall_mm - 2 * v.wall_mm) < 1e-9;
  const cutout = v.driverCutout_mm > 0 ? v.driverCutout_mm : s.ts.sd_cm2 ? cutoutFromSd(s.ts.sd_cm2) : 0;
  const issues = wedgeIssues(d, { joinery: v.joinery, slope: v.slope, cutout });
  const sound = !issues.some((x) => x.level === "error");
  const mount = sound && cutout > 0 && v.driverDepth_mm > 0
    ? wedgeDriverClearance(d, v.slope, { cutout, depth: v.driverDepth_mm, xmax: s.xmax_mm }, v.driverAt_mm ?? undefined)
    : null;
  const deg = (x: number) => `${x.toFixed(1)}°`;
  const fixAction = (x: WedgeIssue) =>
    x.action === "swap" ? (
      <button type="button" className="chip" onClick={() => props.onChange({ ...v, topDepth_cm: v.depth_cm, depth_cm: v.topDepth_cm })}>
        Swap
      </button>
    ) : x.action === "use-box" ? (
      <button type="button" className="chip" onClick={() => props.onChange({ ...v, shape: "box", depth_cm: (v.depth_cm + v.topDepth_cm) / 2 })}>
        Use Box
      </button>
    ) : null;

  return (
    <>
      <div className="fields" onFocusCapture={onFocus} onBlurCapture={() => setFocus(null)}>
        <Num help="Outside width, side to side (across the car)." label="Width" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
        <Num help="Outside height, at the back (the upright panel)." label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
        <Num help="Outside depth along the bottom, back to the foot of the slope: the long one." label="Bottom depth (long)" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
        {byAngle ? (
          <Num help="Slope of the sloped panel from horizontal (90° = upright). Sets the top depth: D1 = D2 − H·cot θ."
            label="Slope angle"
            unit="°"
            value={Math.round(g.theta * 100) / 100}
            onChange={(x) => x > 0 && x <= 90 && set("topDepth_cm", topDepthForAngle(v.depth_cm * 10, v.height_cm * 10, x) / 10)}
          />
        ) : (
          <Num help="Outside depth along the top: the short one." label="Top depth (short)" q="len" value={v.topDepth_cm} min={0} onChange={(x) => set("topDepth_cm", x)} />
        )}
        <Select<"depth" | "angle"> help="Enter the top depth, or the slope angle (the top depth follows from it)."
          label="Enter top as"
          value={byAngle ? "angle" : "depth"}
          options={[
            { value: "depth", text: "Top depth" },
            { value: "angle", text: "Slope angle" },
          ]}
          onChange={(x) => setByAngle(x === "angle")}
        />
        <Num help="Thickness of the sloped panel, square to its face: the walls' unless you change it (two layers for a double baffle)." label="Sloped panel" q="mm" value={Tb} min={0} onChange={(x) => set("slopeWall_mm", x)} />
        <Select<"front" | "rear"> help="Which panel leans. Front: the driver on the sloped baffle (the usual car wedge). Rear: an upright baffle and a sloped back that follows the seat."
          label="Slope on"
          value={v.slope}
          options={[
            { value: "front", text: "Front (driver on the slope)" },
            { value: "rear", text: "Rear (upright baffle)" },
          ]}
          onChange={(x) => set("slope", x)}
        />
        <Select<"butt" | "miter"> help="Butt joints with bevelled edges need one saw setting (φ) for every sloped joint; mitred corners look cleaner but need two tilts, one past 45°."
          label="Joinery"
          value={v.joinery}
          options={[
            { value: "butt", text: "Butt + bevel" },
            { value: "miter", text: "Miter" },
          ]}
          onChange={(x) => set("joinery", x)}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={doubled} onChange={(e) => set("slopeWall_mm", e.currentTarget.checked ? 2 * v.wall_mm : null)} /> Double baffle (sloped panel twice the wall)
      </label>

      {props.onShow3d && (
        <div className="unit-switch" role="group" aria-label="Drawing">
          <button type="button" aria-pressed={!props.show3d} onClick={() => props.onShow3d!(false)}>
            Side view
          </button>
          <button type="button" aria-pressed={!!props.show3d} onClick={() => props.onShow3d!(true)}>
            3D
          </button>
        </div>
      )}
      <div className={`wedge-view${props.show3d ? " is-3d" : ""}`}>
        {props.show3d ? <Preview3D state={s} /> : <WedgeDiagram d={d} slope={v.slope} joinery={v.joinery} focus={focus} mount={mount} cutout={cutout} />}
        <div className="fields">
          <Fixed help="Slope from horizontal." label="θ" value={deg(g.theta)} />
          <Fixed help="Slope from vertical: the bevel for butt joints." label="φ" value={deg(g.phi)} />
          <Fixed help="Inside depth along the bottom." label="Inside bottom" num={g.insideBottomDepth / 10} q="len" />
          <Fixed help="Inside depth along the top." label="Inside top" num={g.insideTopDepth / 10} q="len" />
          <Fixed help="Exact inside volume, before deductions. The sloped panel takes its thickness ÷ sin θ across." label="Inside" num={g.volume_l} q="vol" />
          {v.joinery === "butt" ? (
            <Fixed help="Saw tilt for the bevelled edges: top and bottom of the baffle, the front edges of the top and bottom." label="Bevel" value={deg(a.bevel)} />
          ) : (
            <>
              <Fixed help="Saw tilt at the bottom–slope miter." label="Miter bottom" value={deg(Math.max(...a.miter.bottom))} />
              <Fixed help="Saw tilt at the top–slope miter." label="Miter top" value={deg(Math.max(...a.miter.top))} />
              <Fixed help="Saw tilt at the back corners." label="Miter back" value={deg(a.miter.back)} />
            </>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="wedge-issues">
          {issues.map((x) => (
            <li key={x.code} className={x.level === "info" ? "hint" : "warn"}>
              {x.level === "error" ? "✕ " : x.level === "warning" ? "⚠ " : ""}
              {x.message} {fixAction(x)}
            </li>
          ))}
        </ul>
      )}

      <h3>Driver fit</h3>
      <div className="fields" onFocusCapture={onFocus} onBlurCapture={() => setFocus(null)}>
        <Num help="Mounting depth, from the baffle to the back of the motor (datasheet). Filled in from the database when known." label="Driver depth" q="mm" value={v.driverDepth_mm} min={0} zeroText="Unknown" onChange={(x) => set("driverDepth_mm", x)} />
        <Num help="Where the driver's centre sits, along the baffle's inside face from its bottom edge. Blank = the middle." label="Driver at" q="mm" value={v.driverAt_mm ?? 0} min={0} zeroText="Middle" onChange={(x) => set("driverAt_mm", x > 0 ? x : null)} />
      </div>
      {!cutout ? (
        <p className="hint">Enter the driver cutout (in the cut list) to check the driver fits.</p>
      ) : !(v.driverDepth_mm > 0) ? (
        <p className="hint">Enter the driver's mounting depth to check that its motor clears the back and bottom.</p>
      ) : mount ? (
        <p className={mount.ok ? "hint" : "warn"}>
          {mount.ok
            ? `The motor clears the walls by ${Math.round(mount.margin)} mm`
            : `The motor hits a wall (${Math.round(-mount.margin)} mm short)`}
          , with {Math.round(10 + s.xmax_mm)} mm left for Xmax and air. {Math.round(mount.availableDepth)} mm along the axis for its {Math.round(v.driverDepth_mm)} mm depth.
          {mount.motorEstimated ? " Motor size estimated from the cutout." : ""}
          {mount.best.margin > mount.margin + 1 && (
            <>
              {" "}
              <button type="button" className="chip" onClick={() => set("driverAt_mm", Math.round(mount.best.at))}>
                Move to {Math.round(mount.best.at)} mm
              </button>{" "}
              (clears by {Math.round(mount.best.margin)} mm)
            </>
          )}
        </p>
      ) : null}
    </>
  );
}
