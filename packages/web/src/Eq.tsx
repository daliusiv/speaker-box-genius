import type { EqStage } from "@sbg/engine";
import { Card, Num, Select } from "./components.tsx";
import type { Design } from "./sim.ts";
import { newId, type AppState, type EqItem } from "./state.ts";

const TYPE_LABEL: Record<EqStage["type"], string> = {
  linkwitz: "Linkwitz Transform",
  peak: "Peaking EQ",
  lowshelf: "Low shelf",
};

export function EqPanel(props: { state: AppState; designs: Design[]; onChange: (eq: EqItem[]) => void }) {
  const { state } = props;
  const eq = state.eq;
  const set = (item: EqItem) => props.onChange(eq.map((e) => (e.id === item.id ? item : e)));
  const remove = (item: EqItem) => props.onChange(eq.filter((e) => e.id !== item.id));
  const sealedResult = (id: string) => props.designs.find((d) => d.design.id === id && d.design.kind === "sealed")?.result;

  const add = (type: EqStage["type"]) => {
    const id = newId(eq);
    if (type === "linkwitz") {
      // Aim it at the first sealed design and start from its fc / Qtc.
      const sealed = props.designs.find((d) => d.design.kind === "sealed");
      const fc = sealed?.result.summary.fc ?? 40;
      const qtc = sealed?.result.summary.qtc ?? 0.7;
      props.onChange([
        ...eq,
        {
          id,
          on: true,
          target: sealed?.design.id ?? "all",
          type,
          f0: round(fc),
          q0: round(qtc, 3),
          fp: Math.min(20, round(fc / 1.5)),
          qp: 0.707,
        },
      ]);
    } else if (type === "peak") {
      props.onChange([...eq, { id, on: true, target: "all", type, freq: 40, gain_db: -3, q: 2 }]);
    } else {
      props.onChange([...eq, { id, on: true, target: "all", type, freq: 30, gain_db: 6, q: 0.707 }]);
    }
  };

  const targets = [{ value: "all", text: "All designs" }, ...state.designs.map((d) => ({ value: d.id, text: d.name }))];

  return (
    <Card title="EQ">
      {eq.length === 0 && <p className="hint">No EQ. Add a Linkwitz Transform to a sealed box, or shape any design.</p>}
      {eq.map((e) => {
        const r = e.type === "linkwitz" ? sealedResult(e.target) : undefined;
        return (
          <div key={e.id} className={`eq-item${e.on ? "" : " off"}`}>
            <div className="eq-head">
              <b>{TYPE_LABEL[e.type]}</b>
              <input
                type="checkbox"
                checked={e.on}
                aria-label={`Use ${TYPE_LABEL[e.type]}`}
                onChange={(x) => set({ ...e, on: x.currentTarget.checked })}
              />
              <button className="icon" title="Remove" aria-label={`Remove ${TYPE_LABEL[e.type]}`} onClick={() => remove(e)}>
                ✕
              </button>
            </div>
            <div className="fields">
              <Select help="Which designs this EQ stage applies to." label="Applies to" value={targets.some((t) => t.value === e.target) ? e.target : "all"} options={targets} onChange={(target) => set({ ...e, target })} />
              {e.type === "linkwitz" && (
                <>
                  <Num help="Linkwitz Transform: the sealed box's current resonance (fc). Taken from the design; change it only to experiment." label="f0" unit="Hz" value={e.f0} onChange={(f0) => set({ ...e, f0 })} />
                  <Num help="Linkwitz Transform: the box's current Q (Qtc)." label="Q0" value={e.q0} onChange={(q0) => set({ ...e, q0 })} />
                  <Num help="Linkwitz Transform: the resonance you want instead. Lower extends the bass (and needs more excursion and power)." label="fp" unit="Hz" value={e.fp} onChange={(fp) => set({ ...e, fp })} />
                  <Num help="Linkwitz Transform: the Q you want. 0.707 is flat (Butterworth); 0.5 is tighter, more gradual." label="Qp" value={e.qp} onChange={(qp) => set({ ...e, qp })} />
                </>
              )}
              {(e.type === "peak" || e.type === "lowshelf") && (
                <>
                  <Num help="Centre (or corner) frequency of this EQ band." label="Freq" unit="Hz" value={e.freq} onChange={(freq) => set({ ...e, freq })} />
                  <Num help="Boost (+) or cut (−) in dB. Every +6 dB needs four times the power and doubles the excursion." label="Gain" unit="dB" value={e.gain_db} min={-30} onChange={(gain_db) => set({ ...e, gain_db: Math.min(24, gain_db) })} />
                  <Num help="Width of the band: higher Q is narrower. About 0.7 for broad shaping, 2–5 to fix a peak." label="Q" value={e.q} onChange={(q) => set({ ...e, q })} />
                </>
              )}
            </div>
            {e.type === "linkwitz" && (
              <div className="row">
                <button
                  className="secondary"
                  disabled={!r}
                  title={r ? "Use the sealed design's fc and Qtc as f0 and Q0" : "Pick a sealed design under “Applies to”"}
                  onClick={() => r && set({ ...e, f0: round(r.summary.fc!), q0: round(r.summary.qtc!, 3) })}
                >
                  Match sealed design
                </button>
                <span className="hint">
                  Bass boost {(40 * Math.log10(e.f0 / e.fp)).toFixed(1)} dB at DC. Check the excursion chart.
                </span>
              </div>
            )}
          </div>
        );
      })}
      <div className="add-design">
        <span>Add:</span>
        <button className="secondary" onClick={() => add("linkwitz")}>
          + Linkwitz Transform
        </button>
        <button className="secondary" onClick={() => add("peak")}>
          + Peaking
        </button>
        <button className="secondary" onClick={() => add("lowshelf")}>
          + Low shelf
        </button>
      </div>
      <p className="hint">EQ sits before the amplifier, so boosts raise excursion and lower the power limit too.</p>
    </Card>
  );
}

const round = (v: number, digits = 1) => Number(v.toFixed(digits));
