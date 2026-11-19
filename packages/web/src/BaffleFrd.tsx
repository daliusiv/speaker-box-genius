import { useMemo, useRef, useState } from "react";
import { Fixed, KitFields, Num, Select } from "./components.tsx";
import { Icon } from "./Icon.tsx";
import { LogChart } from "./LogChart.tsx";
import { baffleOnly, baffleOnlyDownload, baffleTrustedTo, coneFromSd, fitProblem, frdDownload, onBaffle, readFrd, withCone, type FrdFile } from "./baffleFrd.ts";
import { downloadFile } from "./formats/download.ts";
import { baffleGeometry, driverOffBaffle } from "./sim.ts";
import type { AppState } from "./state.ts";
import { Button, FieldRow, FileButton, Menu, Sheet, type MenuItem } from "./ui/index.ts";
import "./baffleFrd.css";

export const DRIVER_CURVE_HELP =
  "Put a driver's half-space curve (.frd, from a datasheet or a ground-plane measurement) on your baffle and save the result for a crossover tool such as VituixCAD or XSim. Also in Save & Export → Crossover tools, and when you open an .frd.";

export const FRD_ACCEPT = ".frd,.txt,.csv,.dat";

type BaffleState = AppState["baffle"];

const kHz = (f: number) => (f >= 1000 ? `${Number((f / 1000).toFixed(1))} kHz` : `${Math.round(f)} Hz`);

/** Read a picked or dropped file for the window: the curve, or the message to show in it. */
export async function loadFrd(file: File): Promise<{ file: FrdFile | null; error: string | null }> {
  try {
    return { file: readFrd(file.name, await file.text()), error: null };
  } catch (e) {
    return { file: null, error: `Couldn't read ${file.name}: ${(e as Error).message}.` };
  }
}

/** Signal → Baffle step → Driver curve: the row that opens the window (shown with the step on or off). */
export function BaffleFrdRow(props: { fileName: string | null; onOpen: () => void }) {
  return (
    <FieldRow label="Driver curve" help={DRIVER_CURVE_HELP}>
      {(id) => (
        <Button id={id} className="bfrd-open" title={props.fileName ?? "Put a driver's .frd on your baffle"} onClick={props.onOpen}>
          <span className="bfrd-open-label">{props.fileName ?? "Open .frd…"}</span>
        </Button>
      )}
    </FieldRow>
  );
}

/**
 * The Driver curve window: one per app, opened from Baffle step, Save & Export or Open / Import.
 * Its size and driver place are Baffle step's own fields (one baffle in the app), but it never
 * turns the baffle step on: the charts only change with Baffle step's Free-standing.
 */
export function BaffleFrdSheet(props: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  sd_cm2?: number;
  onBaffle: (patch: Partial<BaffleState>) => void;
  file: FrdFile | null;
  setFile: (f: FrdFile | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const s = props.state;
  const sb = s.baffle;
  const isBox = s.volume.shape === "box";
  const useBox = sb.fromBox && isBox;
  const b = baffleGeometry(s, props.sd_cm2);
  const f = props.file;
  const [typedCone, setTypedCone] = useState<number | null>(null);
  const cone = typedCone ?? coneFromSd(props.sd_cm2);
  const [over, setOver] = useState(false);
  const picker = useRef<{ open: () => void }>(null);

  const load = async (file: File) => {
    const r = await loadFrd(file);
    if (r.file) props.setFile(r.file);
    props.setError(r.error);
  };

  const problem = b ? fitProblem(b, cone, driverOffBaffle(s)) : "Type the baffle's width and height.";
  const trusted = b ? baffleTrustedTo(withCone(b, cone)) : 5000;
  const curves = useMemo(() => {
    if (problem || !b) return null;
    const bb = withCone(b, cone);
    const only = baffleOnly(bb, f);
    return { freq: Float64Array.from(only.f), h: Float64Array.from(only.v), file: f ? Float64Array.from(f.curve.v) : null, out: f ? Float64Array.from(onBaffle(f, bb).v) : null };
  }, [problem, f, b?.width, b?.height, b?.x, b?.y, b?.c, cone]);

  const more: MenuItem[] = [
    { label: f ? "Load another file…" : "Load a file…", icon: <Icon name="open" />, onSelect: () => picker.current?.open() },
    ...(problem || !b ? [] : [{ label: "Export baffle only (.frd)", icon: <Icon name="download" />, onSelect: () => downloadFile(baffleOnlyDownload(b, cone, f)) }]),
    ...(f ? [{ kind: "separator" as const }, { label: "Remove the curve", danger: true, onSelect: () => props.setFile(null) }] : []),
  ];

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Driver curve on this baffle"
      icon="baffle"
      className="bfrd"
      footer={
        <>
          <Menu label="More" iconOnly icon="more" variant="secondary" align="start" items={more} className="bfrd-more" />
          <Button variant="primary" icon="download" className="bfrd-export" disabled={!f || !!problem || !b} onClick={() => f && b && downloadFile(frdDownload(b, cone, f))}>
            Export FRD
          </Button>
        </>
      }
    >
      <div className="bfrd-grid">
        <div className="bfrd-charts">
          {curves?.out && curves.file && (
            <LogChart
              title="On this baffle"
              shortTitle="On baffle"
              unit="dB"
              freq={curves.freq}
              series={[
                { label: "Half space (file)", color: "var(--muted)", y: curves.file, dash: "5 4" },
                { label: "On this baffle", color: "var(--accent)", y: curves.out },
              ]}
              markers={[{ f: trusted, label: `Approximate above ${kHz(trusted)}`, color: "var(--warn)" }]}
              rowHeading="Curve"
              noPeak
              chartId="bfrd-spl"
            />
          )}
          {curves && (
            <LogChart
              title="Baffle effect"
              unit="dB"
              freq={curves.freq}
              series={[{ label: "Baffle", color: "var(--draw)", y: curves.h }]}
              markers={[{ f: trusted, label: "", color: "var(--warn)" }]}
              yMin={-9}
              yMax={3}
              rowHeading="Curve"
              noPeak
              chartId="bfrd-h"
            />
          )}
        </div>
        <div className="bfrd-side">
          <KitFields>
          {f ? (
            <div className="bfrd-file">
              <Icon name="file" />
              <span className="bfrd-file-name">{f.name}</span>
              <span className="bfrd-file-meta">
                {f.curve.f.length} points · {kHz(f.curve.f[0]!)}–{kHz(f.curve.f[f.curve.f.length - 1]!)} · {f.curve.phase ? "with phase" : "no phase"}
              </span>
            </div>
          ) : (
            <div
              className="bfrd-drop"
              data-over={over || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void load(file);
              }}
            >
              <Icon name="upload" />
              <p>Drop a .frd here, or</p>
              <FileButton accept={FRD_ACCEPT} openRef={f ? undefined : picker} onFile={(file) => void load(file)}>
                Choose a file…
              </FileButton>
            </div>
          )}
          {f && (
            <span className="bfrd-hidden-picker" aria-hidden="true">
              <FileButton accept={FRD_ACCEPT} openRef={picker} onFile={(file) => void load(file)}>
                Load another file…
              </FileButton>
            </span>
          )}
          {props.error && <p className="warn">{props.error}</p>}
          {isBox && (
            <Select<"box" | "own">
              label="Baffle size"
              help="Take the baffle (front panel) size from the volume calculator's box, or type it in. The same as Baffle step's."
              value={useBox ? "box" : "own"}
              options={[
                { value: "box", text: "From the box" },
                { value: "own", text: "Enter here" },
              ]}
              onChange={(x) => props.onBaffle({ fromBox: x === "box" })}
            />
          )}
          {useBox && b ? (
            <>
              <Fixed label="Width" unit="cm" value={(b.width * 100).toFixed(1)} title="Outside width of the box (volume calculator)" />
              <Fixed label="Height" unit="cm" value={(b.height * 100).toFixed(1)} title="Outside height of the box (volume calculator)" />
            </>
          ) : (
            <>
              <Num label="Width" q="len" value={sb.width_cm} min={1} help="Width of the front panel." onChange={(width_cm) => props.onBaffle({ width_cm })} />
              <Num label="Height" q="len" value={sb.height_cm} min={1} help="Height of the front panel." onChange={(height_cm) => props.onBaffle({ height_cm })} />
            </>
          )}
          <Num label="From left" q="len" value={sb.x_cm} min={0} help="Driver centre, from the left edge." onChange={(x_cm) => props.onBaffle({ x_cm })} />
          <Num label="From top" q="len" value={sb.y_cm} min={0} help="Driver centre, from the top edge." onChange={(y_cm) => props.onBaffle({ y_cm })} />
          <Num
            label="Cone diameter"
            unit="mm"
            value={cone}
            min={0}
            help="The radiating diameter (about the middle of the surround). Starts from the design's driver Sd; type another if the curve is another driver's."
            onChange={setTypedCone}
          />
          <Fixed label="Distance" value={String(b?.distance ?? 1)} unit="m" help="Listening distance on axis, as the baffle step uses." />
          {problem && <p className="warn">{problem}</p>}
          <p className="hint">{sb.on ? "Same baffle as Baffle step on the charts." : "The charts stay in a wall (half space): this window doesn't turn the baffle step on."}</p>
          <p className="hint">Expects a half-space (infinite-baffle) curve. Curves measured on a test baffle already include some of its diffraction.</p>
          <p className="hint">Approximate above {kHz(trusted)}: the cone&rsquo;s beaming isn&rsquo;t modelled (ripple there is usually ≤ 1 dB).</p>
          {f && !f.curve.phase && <p className="hint">No phase in this file: the export carries only the baffle&rsquo;s phase. Use minimum phase in your crossover tool.</p>}
          {!f && <p className="hint">Load a driver curve to export it on this baffle. ⋯ → Export baffle only saves the baffle effect by itself.</p>}
          </KitFields>
        </div>
      </div>
    </Sheet>
  );
}
