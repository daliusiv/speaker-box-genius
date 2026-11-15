import { baffleStepFrequency } from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { useUnits } from "./units.ts";
import { Chip, Menu, RadioCards, Section, type MenuItem, helpEntries } from "./ui/index.ts";
import { baffleOf } from "./sim.ts";
import { newId, type AppState, type EqItem } from "./state.ts";

/** What each field of this row does: the fields' help and the row's ⓘ sheet (fields that only show after a choice too). */
const HELP: Record<string, string> = {
  "Baffle size": "Take the baffle (front panel) size from the volume calculator's box, or type it in.",
  "Width": "Width of the front panel. Narrower baffles move the baffle step higher in frequency.",
  "Height": "Height of the front panel.",
  "Step at": "Where the step is half done (−3 dB). Shown on the SPL and maximum SPL charts (up to 1 kHz while this is on); the F3 in the summary stays the infinite-baffle one.",
};

type BaffleState = AppState["baffle"];

/**
 * Baffle step: a free-standing speaker loses up to 6 dB of bass compared with the
 * half-space (infinite baffle) simulation, below a frequency set by the baffle size.
 */
export function BaffleSection(props: { state: AppState; sd_cm2?: number; onChange: (b: BaffleState) => void; onAddEq: (item: EqItem) => void }) {
  const s = props.state;
  const b = s.baffle;
  const set = (patch: Partial<BaffleState>) => props.onChange({ ...b, ...patch });
  const isBox = s.volume.shape === "box";
  const useBox = b.fromBox && isBox;
  const w = useBox ? s.volume.width_cm : b.width_cm;
  const h = useBox ? s.volume.height_cm : b.height_cm;
  const baffle = baffleOf(s, props.sd_cm2);
  let fStep: number | null = null;
  try {
    fStep = baffle ? baffleStepFrequency(baffle) : null;
  } catch {
    fStep = null;
  }
  const outside = b.x_cm <= 0 || b.x_cm >= w || b.y_cm <= 0 || b.y_cm >= h;

  const addShelf = (gain_db: number) => {
    if (!fStep) return;
    props.onAddEq({
      id: newId(s.eq),
      on: true,
      target: "all",
      type: "lowshelf",
      freq: Math.round(fStep),
      gain_db,
      q: 0.5,
    });
  };

  const { fmt } = useUnits();
  const compensate: MenuItem[] = [
    { label: "+3 dB (near a wall)", onSelect: () => addShelf(3) },
    { label: "+6 dB (free-standing)", onSelect: () => addShelf(6) },
  ];
  return (
    <Section help={helpEntries(HELP)} icon="baffle" title="Baffle step" value={b.on ? `${fmt(w, "len", 0)} × ${fmt(h, "len", 0)}${fStep ? ` · ${fStep.toFixed(0)} Hz` : ""}` : "Off"}>
      <RadioCards<"off" | "on">
        legend="Baffle"
        value={b.on ? "on" : "off"}
        options={[
          { value: "off", title: "Infinite baffle", description: "Half space, like WinISD: the box sits in a wall", aside: <Chip>usual</Chip> },
          { value: "on", title: "Free-standing", description: "On a stand or the floor: shows the baffle step, up to −6 dB of bass" },
        ]}
        onChange={(x) => set({ on: x === "on" })}
      />
      {b.on && (
        <>
          {isBox && (
            <Select<"box" | "own">
              help={HELP["Baffle size"]}
              label="Baffle size"
              value={b.fromBox ? "box" : "own"}
              options={[
                { value: "box", text: "From the box" },
                { value: "own", text: "Enter here" },
              ]}
              onChange={(x) => set({ fromBox: x === "box" })}
            />
          )}
          {useBox ? (
            <>
              <Fixed label="Width" unit="cm" value={w.toFixed(1)} title="Outside width of the box (volume calculator)" />
              <Fixed label="Height" unit="cm" value={h.toFixed(1)} title="Outside height of the box (volume calculator)" />
            </>
          ) : (
            <>
              <Num help={HELP["Width"]} label="Width" q="len" value={b.width_cm} min={1} onChange={(width_cm) => set({ width_cm })} />
              <Num help={HELP["Height"]} label="Height" q="len" value={b.height_cm} min={1} onChange={(height_cm) => set({ height_cm })} />
            </>
          )}
          <Num label="From left" q="len" value={b.x_cm} min={0} title="Driver centre, from the left edge" onChange={(x_cm) => set({ x_cm })} />
          <Num label="From top" q="len" value={b.y_cm} min={0} title="Driver centre, from the top edge" onChange={(y_cm) => set({ y_cm })} />
          <Fixed
            label="Step at"
            unit="Hz"
            value={fStep ? fStep.toFixed(0) : "–"}
            help={HELP["Step at"]}
          />
          {outside && <p className="warn">The driver is off the baffle: check its position against the width and height.</p>}
          {fStep && (
            <>
              <p className="hint">
                Falls from about {Math.round(fStep * 2)} Hz, −3 dB at {Math.round(fStep)} Hz, nearly −6 dB by {Math.round(fStep / 3)} Hz. A wall or the floor behind
                gives some back, so most designs make up 3–4 dB.
              </p>
              <div className="sg-actions">
                <Menu label="Compensate" variant="ghost" align="end" items={compensate} />
              </div>
            </>
          )}
        </>
      )}
    </Section>
  );
}
