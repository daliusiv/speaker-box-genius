import { useState, type FocusEvent } from "react";
import { topDepthForAngle, wedgeAngles, wedgeDriverClearance, wedgeGeometry, wedgeIssues, type WedgeIssue } from "@sbg/engine";
import { Fixed, Num } from "./components.tsx";
import { cutoutFromSd, wedgeDimsOf } from "./sim.ts";
import { WedgeDiagram, type WedgeDim } from "./WedgeDiagram.tsx";
import type { AppState } from "./state.ts";
import { Preview3D } from "./Preview3D.tsx";
import { Chip, Disclosure, FieldRow, Section, Segmented, Switch } from "./ui/index.ts";

/** Field label → the dimension it lights up on the drawing. */
const DIM_OF: Record<string, WedgeDim> = {
  Width: "W",
  Height: "H",
  "Top depth": "D1",
  "Slope angle": "theta",
  "Bottom depth": "D2",
  Walls: "T",
  "Sloped panel": "Tb",
  "Driver depth": "driver",
  "Driver at": "driver",
};

/** The dimension a focused field lights up on the drawing (kit rows: the row's label). */
export function wedgeDimOf(e: FocusEvent<HTMLElement>): WedgeDim | null {
  const row = (e.target as HTMLElement).closest(".ui-field");
  const label = row?.querySelector(".ui-field-label")?.textContent?.trim() ?? "";
  return DIM_OF[label] ?? null;
}

/** What both wedge rows need: the geometry, its checks and whether the driver's motor clears the walls. */
function wedgeOf(s: AppState) {
  const v = s.volume;
  const d = wedgeDimsOf(v);
  const cutout = v.driverCutout_mm > 0 ? v.driverCutout_mm : s.ts.sd_cm2 ? cutoutFromSd(s.ts.sd_cm2) : 0;
  const issues = wedgeIssues(d, { joinery: v.joinery, slope: v.slope, cutout });
  const sound = !issues.some((x) => x.level === "error");
  const mount =
    sound && cutout > 0 && v.driverDepth_mm > 0
      ? wedgeDriverClearance(d, v.slope, { cutout, depth: v.driverDepth_mm, xmax: s.xmax_mm }, v.driverAt_mm ?? undefined)
      : null;
  return { d, cutout, issues, mount };
}

const deg = (x: number) => `${x.toFixed(1)}°`;

/**
 * The car wedge's rows in Outside size: outside size, the sloped panel, which panel slopes and
 * how the corners are cut, the side-view drawing (or the 3D take-apart view), the angles and
 * inside sizes, and the checks (with Swap and Use Box).
 */
export function WedgeSize(props: {
  state: AppState;
  onChange: (v: AppState["volume"]) => void;
  show3d: boolean;
  onShow3d: (on: boolean) => void;
  focus: WedgeDim | null;
  onFocus: (dim: WedgeDim | null) => void;
}) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const [byAngle, setByAngle] = useState(false);
  const { d, cutout, issues, mount } = wedgeOf(s);
  const g = wedgeGeometry(d);
  const a = wedgeAngles(d);
  const Tb = v.slopeWall_mm ?? v.wall_mm;
  const doubled = v.slopeWall_mm !== null && Math.abs(v.slopeWall_mm - 2 * v.wall_mm) < 1e-9;
  const fixAction = (x: WedgeIssue) =>
    x.action === "swap" ? (
      <Chip onClick={() => props.onChange({ ...v, topDepth_cm: v.depth_cm, depth_cm: v.topDepth_cm })}>Swap</Chip>
    ) : x.action === "use-box" ? (
      <Chip onClick={() => props.onChange({ ...v, shape: "box", depth_cm: (v.depth_cm + v.topDepth_cm) / 2 })}>Use Box</Chip>
    ) : null;
  const focusProps = { onFocusCapture: (e: FocusEvent<HTMLElement>) => props.onFocus(wedgeDimOf(e)), onBlurCapture: () => props.onFocus(null) };

  return (
    <>
      <div className="bd-rows" {...focusProps}>
        <Num help="Outside width, side to side (across the car)." label="Width" q="len" value={v.width_cm} onChange={(x) => set("width_cm", x)} />
        <Num help="Outside height, at the back (the upright panel)." label="Height" q="len" value={v.height_cm} onChange={(x) => set("height_cm", x)} />
        <Num help="Outside depth along the bottom, back to the foot of the slope: the long one." label="Bottom depth" q="len" value={v.depth_cm} onChange={(x) => set("depth_cm", x)} />
        <FieldRow label="Enter top as" help="Enter the top depth, or the slope angle (the top depth follows from it).">
          {(id) => (
            <Segmented<"depth" | "angle">
              id={id}
              label="Enter top as"
              value={byAngle ? "angle" : "depth"}
              options={[
                { value: "depth", label: "Depth" },
                { value: "angle", label: "Angle" },
              ]}
              onChange={(x) => setByAngle(x === "angle")}
            />
          )}
        </FieldRow>
        {byAngle ? (
          <Num
            help="Slope of the sloped panel from horizontal (90° = upright). Sets the top depth: D1 = D2 − H·cot θ."
            label="Slope angle"
            unit="°"
            value={Math.round(g.theta * 100) / 100}
            onChange={(x) => x > 0 && x <= 90 && set("topDepth_cm", topDepthForAngle(v.depth_cm * 10, v.height_cm * 10, x) / 10)}
          />
        ) : (
          <Num help="Outside depth along the top: the short one." label="Top depth" q="len" value={v.topDepth_cm} min={0} onChange={(x) => set("topDepth_cm", x)} />
        )}
        <Num help="Wall thickness (e.g. 18 mm MDF). Taken off every side to get the inside volume." label="Walls" q="mm" value={v.wall_mm} min={0} onChange={(x) => set("wall_mm", x)} />
        <Num help="Thickness of the sloped panel, square to its face: the walls' unless you change it (two layers for a double baffle)." label="Sloped panel" q="mm" value={Tb} min={0} onChange={(x) => set("slopeWall_mm", x)} />
        <FieldRow label="Double baffle" help="The sloped panel twice the wall (two layers glued together).">
          {(id) => (
            <span className="bd-switch">
              <Switch id={id} checked={doubled} onChange={(on) => set("slopeWall_mm", on ? 2 * v.wall_mm : null)} />
            </span>
          )}
        </FieldRow>
        <FieldRow label="Slope on" help="Which panel leans. Front: the driver on the sloped baffle (the usual car wedge). Rear: an upright baffle and a sloped back that follows the seat.">
          {(id) => (
            <Segmented<"front" | "rear">
              id={id}
              label="Slope on"
              value={v.slope}
              options={[
                { value: "front", label: "Front" },
                { value: "rear", label: "Rear" },
              ]}
              onChange={(x) => set("slope", x)}
            />
          )}
        </FieldRow>
        <FieldRow label="Joinery" help="Butt joints with bevelled edges need one saw setting (φ) for every sloped joint; mitred corners look cleaner but need two tilts, one past 45°.">
          {(id) => (
            <Segmented<"butt" | "miter">
              id={id}
              label="Joinery"
              value={v.joinery}
              options={[
                { value: "butt", label: "Butt" },
                { value: "miter", label: "Mitre" },
              ]}
              onChange={(x) => set("joinery", x)}
            />
          )}
        </FieldRow>
        <FieldRow label="Drawing" help="The side view with its sizes, or the 3D view: turn the box round and take it apart, piece by piece.">
          {(id) => (
            <Segmented<"side" | "3d">
              id={id}
              label="Drawing"
              value={props.show3d ? "3d" : "side"}
              options={[
                { value: "side", label: "Side view" },
                { value: "3d", label: "3D" },
              ]}
              onChange={(x) => props.onShow3d(x === "3d")}
            />
          )}
        </FieldRow>
      </div>
      <div className={`bd-drawing${props.show3d ? " is-3d" : ""}`}>
        {props.show3d ? <Preview3D state={s} /> : <WedgeDiagram d={d} slope={v.slope} joinery={v.joinery} focus={props.focus} mount={mount} cutout={cutout} />}
      </div>
      <Disclosure title="Angles and inside" value={`θ ${deg(g.theta)} · inside ${g.volume_l.toFixed(1)} L`}>
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
      </Disclosure>
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
    </>
  );
}

/** Driver fit (car wedge only): mounting depth and position, and whether the motor clears the walls. */
export function WedgeFit(props: { state: AppState; onChange: (v: AppState["volume"]) => void; onFocus: (dim: WedgeDim | null) => void }) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const { cutout, mount } = wedgeOf(s);
  const value = !cutout || !(v.driverDepth_mm > 0) || !mount ? "Check" : mount.ok ? "Fits" : "Hits a wall";
  return (
    <Section icon="fit" title="Driver fit" value={value}>
      <div className="bd-rows" onFocusCapture={(e) => props.onFocus(wedgeDimOf(e))} onBlurCapture={() => props.onFocus(null)}>
        <Num help="Mounting depth, from the baffle to the back of the motor (datasheet). Filled in from the database when known." label="Driver depth" q="mm" value={v.driverDepth_mm} min={0} zeroText="Unknown" onChange={(x) => set("driverDepth_mm", x)} />
        <Num help="Where the driver's centre sits, along the baffle's inside face from its bottom edge. Blank = the middle." label="Driver at" q="mm" value={v.driverAt_mm ?? 0} min={0} zeroText="Middle" onChange={(x) => set("driverAt_mm", x > 0 ? x : null)} />
      </div>
      {!cutout ? (
        <p className="hint">Enter the driver cutout (Cut list → Holes) to check the driver fits.</p>
      ) : !(v.driverDepth_mm > 0) ? (
        <p className="hint">Enter the driver's mounting depth to check that its motor clears the back and bottom.</p>
      ) : mount ? (
        <p className={mount.ok ? "hint" : "warn"}>
          {mount.ok ? `The motor clears the walls by ${Math.round(mount.margin)} mm` : `The motor hits a wall (${Math.round(-mount.margin)} mm short)`}, with{" "}
          {Math.round(10 + s.xmax_mm)} mm left for Xmax and air. {Math.round(mount.availableDepth)} mm along the axis for its {Math.round(v.driverDepth_mm)} mm depth.
          {mount.motorEstimated ? " Motor size estimated from the cutout." : ""}
          {mount.best.margin > mount.margin + 1 && (
            <>
              {" "}
              <Chip onClick={() => set("driverAt_mm", Math.round(mount.best.at))}>Move to {Math.round(mount.best.at)} mm</Chip> (clears by {Math.round(mount.best.margin)} mm)
            </>
          )}
        </p>
      ) : null}
    </Section>
  );
}
