import { baffleStepFrequency } from "@sbg/engine";
import { Sparkle } from "./Logo.tsx";
import { Card, Fixed, Num, Select } from "./components.tsx";
import { baffleOf } from "./sim.ts";
import { newId, type AppState, type EqItem } from "./state.ts";

type BaffleState = AppState["baffle"];

/**
 * Baffle step: a free-standing speaker loses up to 6 dB of bass compared with the
 * half-space (infinite baffle) simulation, below a frequency set by the baffle size.
 */
export function BafflePanel(props: { state: AppState; sd_cm2?: number; onChange: (b: BaffleState) => void; onAddEq: (item: EqItem) => void }) {
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

  return (
    <Card title="Baffle step">
      <div className="fields">
        <Select<"off" | "on"> help="Infinite baffle assumes the box is flush in a wall (like WinISD). Free-standing adds the baffle step: bass spreads all round and falls up to 6 dB."
          label="Baffle"
          value={b.on ? "on" : "off"}
          options={[
            { value: "off", text: "Infinite baffle (like WinISD)" },
            { value: "on", text: "Free-standing, with baffle step" },
          ]}
          onChange={(x) => set({ on: x === "on" })}
        />
        {b.on && (
          <>
            {isBox && (
              <Select<"box" | "own"> help="Take the baffle (front panel) size from the volume calculator's box, or type it in."
                label="Baffle size"
                value={b.fromBox ? "box" : "own"}
                options={[
                  { value: "box", text: "Volume calculator's box" },
                  { value: "own", text: "Enter it here" },
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
                <Num help="Width of the front panel. Narrower baffles move the baffle step higher in frequency." label="Width" q="len" value={b.width_cm} min={1} onChange={(width_cm) => set({ width_cm })} />
                <Num help="Height of the front panel." label="Height" q="len" value={b.height_cm} min={1} onChange={(height_cm) => set({ height_cm })} />
              </>
            )}
            <Num label="From left" q="len" value={b.x_cm} min={0} title="Driver centre, from the left edge" onChange={(x_cm) => set({ x_cm })} />
            <Num label="From top" q="len" value={b.y_cm} min={0} title="Driver centre, from the top edge" onChange={(y_cm) => set({ y_cm })} />
            <Fixed label="Step at" unit="Hz" value={fStep ? fStep.toFixed(0) : "–"} title="Where the step is half done (−3 dB)" />
          </>
        )}
      </div>
      {b.on && outside && <p className="warn">The driver is off the baffle: check its position against the width and height.</p>}
      {b.on && fStep && (
        <>
          <p className="hint">
            Free-standing, the output starts to fall below about {Math.round(fStep * 2)} Hz, is 3 dB down at {Math.round(fStep)} Hz and
            nearly 6 dB down by {Math.round(fStep / 3)} Hz, with some ripple above from the baffle edges. Shown on the SPL and maximum SPL
            charts (up to 1 kHz while this is on); the F3 in the summary stays the infinite-baffle one. A wall or the floor close behind
            gives some of it back, so most designs make up 3–4 dB, not all 6.
          </p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => addShelf(3)} title="Low shelf +3 dB below the step, for a speaker near a wall">
<Sparkle />
              Compensate +3 dB (near a wall)
            </button>
            <button type="button" className="secondary" onClick={() => addShelf(6)} title="Low shelf +6 dB below the step, for a speaker well out in the room">
<Sparkle />
              +6 dB (free-standing)
            </button>
          </div>
        </>
      )}
      {!b.on && (
        <p className="hint">
          The simulation assumes an infinite baffle (half space), like WinISD. A real speaker on a stand loses up to 6 dB of bass
          below a frequency set by its front baffle; turn this on to see it, for bookshelf and floor-standing speakers.
        </p>
      )}
    </Card>
  );
}
