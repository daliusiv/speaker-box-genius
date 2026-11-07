import { useEffect, useRef, useState } from "react";
import { braceVolume, cutList, layoutSheets, piecesOf, type CutList, type Layout } from "@sbg/engine";
import { Card, Num, REPO, Select } from "./components.tsx";
import { lineFoldOf, lineLength, lineSegmentsOf, linkedDesign, prTotal, volumeFor, type Design } from "./sim.ts";
import { useUnits } from "./units.ts";
import { encodeStateShort, type AppState, type DesignState, type LineDesign } from "./state.ts";
import { qrSvg } from "./qrDraw.ts";
import { FoldDrawing } from "./LineBody.tsx";
import { roundGrams, stuffFactor, stuffable, stuffingInstruction } from "./stuffing.ts";

const KIND: Record<DesignState["kind"], string> = { sealed: "Sealed", vented: "Ported", pr: "Passive radiator", bandpass: "Bandpass", line: "Transmission line" };

/** Cutout from the cone area when the database doesn't give one: about 1.12 × the effective cone diameter. */
const cutoutFromSd = (sd_cm2: number) => Math.round(1.12 * 2 * Math.sqrt(sd_cm2 / Math.PI) * 10);

/** "18 1/4" style inches to the nearest 1/16. */
function inches(mm: number): string {
  const sixteenths = Math.round((mm / 25.4) * 16);
  const whole = Math.floor(sixteenths / 16);
  let n = sixteenths % 16;
  let d = 16;
  while (n > 0 && n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return n === 0 ? `${whole}"` : whole === 0 ? `${n}/${d}"` : `${whole} ${n}/${d}"`;
}

/**
 * Build sheet for the box in the volume calculator: panels, holes, port, braces and how it
 * all lays out on stock sheets, with a print view. Box shapes only.
 */
export function BuildSheet(props: {
  state: AppState;
  designs: Design[];
  driverName: string;
  driverSd_cm2?: number;
  onChange: (v: AppState["volume"]) => void;
}) {
  const s = props.state;
  const v = s.volume;
  const set = <K extends keyof AppState["volume"]>(k: K, val: AppState["volume"][K]) => props.onChange({ ...v, [k]: val });
  const { system } = useUnits();
  const len = (mm: number) => (system === "imperial" ? inches(mm) : `${Math.round(mm)}`);
  const lenUnit = system === "imperial" ? "" : " mm";
  const d = linkedDesign(s);
  // What to build: the calculator's box, or one of the transmission lines folded into a box.
  const lines = s.designs.filter((x): x is LineDesign => x.kind === "line");
  const [what, setWhat] = useState<string>("box");
  const [copied, setCopied] = useState(false);
  const line = lines.find((x) => x.id === what) ?? null;

  // Print just the sheet: a copy goes straight under <body>, everything else is hidden while printing.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const done = () => {
      document.body.classList.remove("print-build");
      document.getElementById("print-root")?.remove();
    };
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  const print = async () => {
    if (!sheetRef.current) return;
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.appendChild(sheetRef.current.cloneNode(true));
    // A QR code to this exact design, so the printout leads back to the live simulation.
    const url = location.origin + location.pathname + "#" + (await encodeStateShort(s));
    const slot = root.querySelector(".build-qr");
    if (slot) {
      try {
        slot.innerHTML = qrSvg(url, 130) + "<span>Scan for the live design</span>";
      } catch {
        slot.remove();
      }
    }
    document.body.appendChild(root);
    document.body.classList.add("print-build");
    window.print();
  };

  const chooser =
    lines.length > 0 ? (
      <div className="fields">
        <Select<string> help="Which box the cut list is for: the volume calculator's box, or a folded line or horn."
          label="What to build"
          value={line ? line.id : "box"}
          options={[{ value: "box", text: "The box in the volume calculator" }, ...lines.map((x) => ({ value: x.id, text: `${x.name} (folded ${x.end === "horn" ? "horn" : "line"})` }))]}
          onChange={setWhat}
        />
      </div>
    ) : null;

  if (!line && v.shape !== "box") {
    return (
      <Card title="Cut list">
        {chooser}
        <p className="hint">The cut list is for box-shaped enclosures. Choose “Box” as the shape in the volume calculator{lines.length ? ", or pick a transmission line above" : ""}.</p>
      </Card>
    );
  }

  const drivers = s.drivers * (s.isobaric ? 2 : 1);
  const onBaffle = s.isobaric ? s.drivers : drivers;
  const driverCutout = v.driverCutout_mm > 0 ? v.driverCutout_mm : props.driverSd_cm2 ? cutoutFromSd(props.driverSd_cm2) : 0;
  const prCount = !line && d?.kind === "pr" ? prTotal(d) : 0;
  const prCutout = d?.kind === "pr" ? (v.prCutout_mm > 0 ? v.prCutout_mm : cutoutFromSd(d.params.sd_cm2)) : 0;
  const port: { count: number; length: number; holeDiameter?: number; slot?: { width: number; height: number } } | undefined =
    line
      ? line.end === "port"
        ? { count: 1, length: line.portLength_cm * 10 }
        : undefined
      : d?.kind === "vented"
      ? {
          count: d.count,
          length: d.length_cm * 10,
          ...(d.shape === "slot"
            ? { slot: { width: d.slotWidth_cm * 10, height: d.slotHeight_cm * 10 } }
            : { holeDiameter: (d.diameter_cm + 2 * (d.flare_cm ?? 0)) * 10 + 2 * v.portWall_mm }),
        }
      : undefined;

  let fold: ReturnType<typeof lineFoldOf> | null = null;
  if (line) {
    try {
      fold = lineFoldOf(line, v.wall_mm, driverCutout > 0 ? driverCutout : undefined);
    } catch {
      fold = null;
    }
  }
  if (line && !fold) {
    return (
      <Card title="Cut list">
        {chooser}
        <p className="warn">This line can't be folded with these settings: check its sections and the fold width.</p>
      </Card>
    );
  }
  const c: CutList = fold ? fold.cut : cutList({
    width: v.width_cm * 10,
    height: v.height_cm * 10,
    depth: v.depth_cm * 10,
    wall: v.wall_mm,
    drivers: driverCutout > 0 ? { count: onBaffle, cutout: driverCutout } : undefined,
    prs: prCount > 0 ? { count: prCount, cutout: prCutout } : undefined,
    ports: port,
  });
  const layout: Layout = layoutSheets(piecesOf(c), v.sheetW_mm, v.sheetH_mm, v.kerf_mm);
  const vol = volumeFor(s, d);
  const sim = line ? props.designs.find((x) => x.design.id === line.id) : d ? props.designs.find((x) => x.design.id === d.id) : undefined;
  const outside = fold ? fold.outside : { width: v.width_cm * 10, height: v.height_cm * 10, depth: v.depth_cm * 10 };
  // The cut list as plain text (Markdown-friendly), for a message, a forum post or a notes app.
  const copyList = () => {
    const u = lenUnit.trim() || "in";
    const lines = [
      `Cut list${d ? ` for ${d.name}` : line ? ` for ${line.name}` : ""}: outside ${len(outside.width)} × ${len(outside.height)} × ${len(outside.depth)} ${u} (W × H × D), ${len(v.wall_mm)} ${u} walls`,
      "",
      `| Part | Qty | Size (${u}) |`,
      "|---|---:|---:|",
      ...[...c.panels, ...c.braces].map((p) => `| ${p.name} | ${p.qty} | ${len(p.a)} × ${len(p.b)} |`),
      ...c.holes.map((h) => `- ${h.qty} × ${h.name.toLowerCase()}: ${h.diameter !== undefined ? `⌀ ${len(h.diameter)}` : `${len(h.width!)} × ${len(h.height!)}`} ${u} (${h.where.toLowerCase()})`),
      ...(port && port.length > 0 ? [`- ${port.count} × port ${port.slot ? "channel" : "tube"}, ${len(port.length)} ${u} long`] : []),
    ];
    void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const braceL = braceVolume(c.braces, v.wall_mm);
  const bracingL = vol.deductions.find((x) => x.label.startsWith("Bracing"))?.litres ?? 0;

  return (
    <Card title="Cut list">
      {chooser}
      <div className="build-sheet" ref={sheetRef}>
        <div className="print-only build-title">
          <div>
            <h2>Speaker Box Genius: build sheet</h2>
            <p>{new Date().toLocaleDateString()}</p>
          </div>
          <div className="build-qr" />
        </div>
        <p className="build-summary">
          {line ? (
            <>
              <b>{line.name}</b>
              {line.end === "horn" || line.name.toLowerCase().startsWith("transmission line") ? "" : " (transmission line)"}
              {line.end === "tapped" ? ", a tapped horn," : line.end === "port" ? ", mass-loaded," : line.end === "horn" ? ", a front-loaded horn," : ""} with {s.drivers} × {props.driverName || "driver"}
              {line.end === "horn" ? `, flare cutoff ${Math.round(line.targetFb)} Hz` : sim?.result.summary.fb ? `, tuned to ${sim.result.summary.fb.toFixed(1)} Hz` : ""}. {line.end === "horn" ? "Horn" : "Line"} {Math.round(lineLength(line))} cm long, folded into {fold!.runs.length} run
              {fold!.runs.length === 1 ? "" : "s"}.
            </>
          ) : d ? (
            <>
              <b>{d.name}</b>
              {d.name.toLowerCase().startsWith(KIND[d.kind].toLowerCase()) ? "" : ` (${KIND[d.kind].toLowerCase()})`} with {drivers} × {props.driverName || "driver"}
              {sim?.result.summary.fb ? `, tuned to ${sim.result.summary.fb.toFixed(1)} Hz` : ""}
              {sim?.result.summary.f3 ? `, F3 ${sim.result.summary.f3.toFixed(1)} Hz` : ""}. Net volume {vol.net_l.toFixed(1)} L
              {stuffFactor(d) !== 1 ? ` (acts as ${(vol.net_l * stuffFactor(d)).toFixed(1)} L with stuffing)` : ""}.
            </>
          ) : (
            <>The box in the volume calculator. Choose a design under “Used by” to add its port or passive radiators.</>
          )}
        </p>
        {line && (
          <div className="build-fold">
            <FoldDrawing d={line} wall_mm={v.wall_mm} driverCutout={driverCutout > 0 ? driverCutout : undefined} />
            <span className="hint">
              {line.end === "horn"
                ? "Side view, front on the left: the driver section on top (rear chamber, motor board, throat chamber, throat board with the slot at the back), the horn folded below and the mouth on the front."
                : `Side view, front on the left: dividers, driver and the ${line.end === "port" ? "port" : "mouth"} on the back.`}
            </span>
          </div>
        )}
        <p className="hint">
          Outside {len(outside.width)} × {len(outside.height)} × {len(outside.depth)}
          {lenUnit} (W × H × D), {len(v.wall_mm)}
          {lenUnit} walls. Front and back cover the full size, top and bottom fit between them, the sides fit inside all four.
          {fold && fold.runs.length > 1 ? " Dividers run the full inside width, glued between the sides, alternately from the top and the bottom; set each as listed below." : ""}
        </p>

        <table className="cut-table">
          <thead>
            <tr>
              <th>Part</th>
              <th className="num">Qty</th>
              <th className="num">Size{lenUnit}</th>
            </tr>
          </thead>
          <tbody>
            {[...c.panels.map((p) => ({ ...p, frame: undefined as number | undefined })), ...c.braces].map((p) => (
              <tr key={p.name}>
                <td className="cut-name">
                  {p.name}
                  {p.frame !== undefined && (
                    <span className="hint cut-sub">
                      a frame {len(p.frame)}
                      {lenUnit} wide around a window
                    </span>
                  )}
                </td>
                <td className="num">{p.qty}</td>
                <td className="num">
                  {len(p.a)} × {len(p.b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(c.holes.length > 0 || port) && (
          <>
            <h3>{fold ? "Holes and assembly" : `Holes${port ? " and port" : ""}`}</h3>
            <ul className="build-list">
              {c.holes.map((h) => (
                <li key={h.name}>
                  {h.qty} × {h.name.toLowerCase()}:{" "}
                  <b>{h.diameter !== undefined ? `⌀ ${len(h.diameter)}${lenUnit}` : `${len(h.width!)} × ${len(h.height!)}${lenUnit}`}</b>{" "}
                  <span className="hint">({h.where.toLowerCase()})</span>
                </li>
              ))}
              {port && port.length > 0 && (
                <li>
                  {port.count} × port {port.slot ? "channel" : "tube"}, cut to <b>{len(port.length)}{lenUnit}</b> long
                  {line?.end === "port" && (
                    <span className="hint">
                      {" "}
                      (inside ⌀ {len(line.portDiameter_cm * 10)}
                      {lenUnit}
                      {line.portFlare_cm > 0 ? `, flared ${len(line.portFlare_cm * 10)}${lenUnit} radius at both ends` : ""})
                    </span>
                  )}
                  {!line && !port.slot && d?.kind === "vented" && (
                    <span className="hint">
                      {" "}
                      (inside ⌀ {len(d.diameter_cm * 10)}
                      {lenUnit}
                      {d.flare_cm > 0 ? `, flared ${len(d.flare_cm * 10)}${lenUnit} radius at both ends` : ""})
                    </span>
                  )}
                </li>
              )}
              {fold &&
                fold.runs.slice(0, -1).map((r, k) => (
                  <li key={`div${k}`}>
                    Divider {k + 1}: its face <b>{len(fold!.runs.slice(0, k + 1).reduce((a, x) => a + x.depth, 0) + k * v.wall_mm)}{lenUnit}</b> {fold!.horn ? "in front of the inside of the back" : "behind the inside of the front"}, leaving a{" "}
                    {len(fold!.gaps[k]!)}
                    {lenUnit} gap at the {r.down ? "bottom" : "top"}
                  </li>
                ))}
              {line?.end === "horn" && fold?.horn && (
                <li>
                  Driver section: the motor board sits {len(fold.horn.rear)}
                  {lenUnit} below the inside of the top (the rear chamber above it must be sealed); the throat board {len(fold.horn.throat)}
                  {lenUnit} below the motor board, its {len(fold.horn.slot)}
                  {lenUnit} slot along the back opening into the horn. The horn's dividers hang from the throat board, not the top of the box. Fit the driver before closing the rear chamber, or make the top removable.
                </li>
              )}
              {line?.end === "tapped" && fold?.driverOnDivider && (
                <li>
                  Tapped horn: the driver mounts on divider {fold.driverOnDivider.index + 1}, its rear in run {fold.driverOnDivider.index + 1} and its front facing run{" "}
                  {fold.driverOnDivider.index + 2} (the tap). Fit it before closing the box, or make the side panel removable for access.
                </li>
              )}
              {!line && d && stuffable(d.kind) && stuffingInstruction(d.stuffing, d.kind, vol.net_l) && (
                <li>Stuffing: {stuffingInstruction(d.stuffing, d.kind, vol.net_l)}.</li>
              )}
              {line && line.sections.some((x) => x.fill_kgm3 > 0) && (
                <li>
                  Stuffing:{" "}
                  {lineSegmentsOf(line)
                    .map((x, k) =>
                      x.fill_kgm3! > 0
                        ? `section ${k + 1} at ${x.fill_kgm3} kg/m³ (about ${roundGrams((x.fill_kgm3! * x.length_cm * (x.startArea_cm2 + x.endArea_cm2)) / 2 / 1000)} g)`
                        : null,
                    )
                    .filter(Boolean)
                    .join(", ")}
                  , loosely and evenly.
                </li>
              )}
              {s.isobaric && <li>Isobaric: the second driver of each pair mounts on an inner baffle, face to face or behind the first.</li>}
              {!line && d?.kind === "bandpass" && <li>Bandpass: add the divider between the chambers; the panels above are the outer box only.</li>}
            </ul>
            {(v.driverCutout_mm === 0 && driverCutout > 0) || (prCount > 0 && v.prCutout_mm === 0) ? (
              <p className="hint">Cutouts marked from the cone area are estimates: check the datasheet before cutting.</p>
            ) : null}
          </>
        )}

        {c.braces.length > 0 && (
          <p className="hint">
            Braces suggested for spans over {len(Math.max(250, v.wall_mm * 20))}
            {lenUnit}. They take about {braceL.toFixed(2)} L
            {bracingL > 0 ? `; the volume calculator allows ${bracingL.toFixed(2)} L for bracing` : "; set Bracing in the volume calculator to account for them"}.
          </p>
        )}

        {c.warnings.length > 0 && (
          <ul className="build-warn">
            {c.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <h3>On {layout.sheets.length === 1 ? "one sheet" : `${layout.sheets.length} sheets`}</h3>
        <p className="hint">
          {len(v.sheetW_mm)} × {len(v.sheetH_mm)}
          {lenUnit} sheets, {len(v.kerf_mm)}
          {lenUnit} saw kerf: {c.area_m2.toFixed(2)} m² of panels, {Math.round(layout.used * 100)} % of the wood used.
          {layout.tooBig.length > 0 && ` Too big for one sheet: ${layout.tooBig.join(", ")}.`}
        </p>
        {layout.sheets.map((sheet, k) => (
          <svg
            key={k}
            className="sheet-svg"
            viewBox={`-10 -10 ${v.sheetW_mm + 20} ${v.sheetH_mm + 20}`}
            role="img"
            aria-label={`Sheet ${k + 1} layout`}
          >
            <rect x={0} y={0} width={v.sheetW_mm} height={v.sheetH_mm} className="sheet-bg" />
            {sheet.map((p) => (
              <g key={p.name}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} className="sheet-piece" />
                <text x={p.x + p.w / 2} y={p.y + p.h / 2} className="sheet-label" textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(60, p.h / 4, p.w / 7)}>
                  {p.name}
                </text>
              </g>
            ))}
          </svg>
        ))}
        <p className="print-only hint">Check every size against your own parts before cutting. Made with Speaker Box Genius ({REPO}).</p>
      </div>

      <h3>Settings</h3>
      <div className="fields">
        <Num help="Diameter of the hole for the driver (from its datasheet; often a little smaller than the frame)."
          label="Driver cutout"
          q="mm"
          value={v.driverCutout_mm > 0 ? v.driverCutout_mm : driverCutout}
          min={0}
          onChange={(x) => set("driverCutout_mm", x)}
        />
        {prCount > 0 && <Num help="Diameter of the hole for each passive radiator." label="PR cutout" q="mm" value={v.prCutout_mm > 0 ? v.prCutout_mm : prCutout} min={0} onChange={(x) => set("prCutout_mm", x)} />}
        <Num help="Width of the sheets you cut from (e.g. 2440 × 1220 mm boards). Used to lay out the panels." label="Sheet W" q="mm" value={v.sheetW_mm} min={100} onChange={(x) => set("sheetW_mm", x)} />
        <Num help="Height of the sheets you cut from." label="Sheet H" q="mm" value={v.sheetH_mm} min={100} onChange={(x) => set("sheetH_mm", x)} />
        <Num help="Width of the saw cut, left between panels on the sheet layout." label="Kerf" q="mm" value={v.kerf_mm} min={0} onChange={(x) => set("kerf_mm", x)} />
      </div>
      <div className="row">
        <button type="button" onClick={() => void print()}>
          Print or save as PDF
        </button>
        <button type="button" className="secondary" onClick={copyList}>
          {copied ? "Copied ✓" : "Copy cut list"}
        </button>
      </div>
    </Card>
  );
}
