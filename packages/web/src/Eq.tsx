import type { EqStage } from "@sbg/engine";
import { Sparkle } from "./Logo.tsx";
import { Num, Select } from "./components.tsx";
import { Icon } from "./Icon.tsx";
import type { Design } from "./sim.ts";
import { newId, type AppState, type EqItem } from "./state.ts";
import { Button, Disclosure, FieldRow, Menu, Section, Switch, type MenuItem, helpEntries } from "./ui/index.ts";

/** What each field of this row does: the fields' help and the row's ⓘ sheet (fields that only show after a choice too). */
const HELP: Record<string, string> = {
  "On": "Turn this filter off to compare without it, keeping its settings.",
  "Applies to": "Which designs this EQ stage applies to.",
  "f0": "Linkwitz Transform: the sealed box's current resonance (fc). Taken from the design; change it only to experiment.",
  "Q0": "Linkwitz Transform: the box's current Q (Qtc).",
  "fp": "Linkwitz Transform: the resonance you want instead. Lower extends the bass (and needs more excursion and power).",
  "Qp": "Linkwitz Transform: the Q you want. 0.707 is flat (Butterworth); 0.5 is tighter, more gradual.",
  "Freq": "Centre (or corner) frequency of this EQ band.",
  "Gain": "Boost (+) or cut (−) in dB. Every +6 dB needs four times the power and doubles the excursion.",
  "Q": "Width of the band: higher Q is narrower. About 0.7 for broad shaping, 2–5 to fix a peak.",
};

const TYPE_LABEL: Record<EqStage["type"], string> = {
  linkwitz: "Linkwitz Transform",
  peak: "Peaking",
  lowshelf: "Low shelf",
  highshelf: "High shelf",
  lowshelf1: "Low shelf 6 dB/oct",
};

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;

/** A filter in a few words, for its closed row: "40 Hz · −3 dB · Q 2", "45 → 20 Hz · Q 0.707 · +14 dB". */
export function eqSummary(e: EqItem): string {
  if (e.type === "linkwitz") return `${e.f0} → ${e.fp} Hz · Q ${e.qp} · +${(40 * Math.log10(e.f0 / e.fp)).toFixed(0)} dB`;
  if (e.type === "lowshelf1") return `${e.freq} Hz · ${signed(e.gain_db)} dB · 6 dB/oct`;
  return `${e.freq} Hz · ${signed(e.gain_db)} dB · Q ${e.q}`;
}

/**
 * The EQ: each filter a row that shows its values while closed and opens to On, Applies to and its
 * numbers; + Filter adds one (or clears them all).
 */
export function EqSection(props: { state: AppState; designs: Design[]; onChange: (eq: EqItem[]) => void; onClear?: () => void }) {
  const { state } = props;
  const eq = state.eq;
  const set = (item: EqItem) => props.onChange(eq.map((e) => (e.id === item.id ? item : e)));
  const remove = (item: EqItem) => props.onChange(eq.filter((e) => e.id !== item.id));
  const sealedResult = (id: string) => props.designs.find((d) => d.design.id === id && (d.design.kind === "sealed" || d.design.kind === "ib"))?.result;

  const add = (type: EqStage["type"]) => {
    const id = newId(eq);
    if (type === "linkwitz") {
      // Aim it at the first sealed design and start from its fc / Qtc.
      const sealed = props.designs.find((d) => d.design.kind === "sealed" || d.design.kind === "ib");
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
    } else if (type === "highshelf") {
      props.onChange([...eq, { id, on: true, target: "all", type, freq: 100, gain_db: -6, q: 0.707 }]);
    } else {
      props.onChange([...eq, { id, on: true, target: "all", type: "lowshelf", freq: 30, gain_db: 6, q: 0.707 }]);
    }
  };

  const targets = [{ value: "all", text: "All designs" }, ...state.designs.map((d) => ({ value: d.id, text: d.name }))];
  const adds: MenuItem[] = [
    ...(["linkwitz", "peak", "lowshelf", "highshelf"] as const).map((t) => ({ label: TYPE_LABEL[t], onSelect: () => add(t) })),
    ...(eq.length > 1 && props.onClear ? [{ kind: "separator" as const }, { label: "Clear EQ", icon: <Icon name="trash" />, onSelect: props.onClear }] : []),
  ];
  const on = eq.filter((e) => e.on).length;

  return (
    <Section help={helpEntries(HELP)} icon="sliders" title="EQ" value={eq.length === 0 ? "None" : `${eq.length} filter${eq.length > 1 ? "s" : ""}${on < eq.length ? ` · ${eq.length - on} off` : ""}`}>
      {eq.length === 0 && <p className="hint">No EQ. Add a Linkwitz Transform to a sealed box or infinite baffle, or shape any design.</p>}
      {eq.map((e) => {
        const r = e.type === "linkwitz" ? sealedResult(e.target) : undefined;
        return (
          <Disclosure key={e.id} title={TYPE_LABEL[e.type]} value={`${e.on ? "" : "Off · "}${eqSummary(e)}`} off={!e.on}>
            <FieldRow label="On" help={HELP["On"]}>
              {(id) => <Switch id={id} checked={e.on} aria-label={`Use ${TYPE_LABEL[e.type]}`} onChange={(v) => set({ ...e, on: v })} />}
            </FieldRow>
            <Select help={HELP["Applies to"]} label="Applies to" value={targets.some((t) => t.value === e.target) ? e.target : "all"} options={targets} onChange={(target) => set({ ...e, target })} />
            {e.type === "linkwitz" ? (
              <>
                <Num help={HELP["f0"]} label="f0" unit="Hz" value={e.f0} onChange={(f0) => set({ ...e, f0 })} />
                <Num help={HELP["Q0"]} label="Q0" value={e.q0} onChange={(q0) => set({ ...e, q0 })} />
                <Num help={HELP["fp"]} label="fp" unit="Hz" value={e.fp} onChange={(fp) => set({ ...e, fp })} />
                <Num help={HELP["Qp"]} label="Qp" value={e.qp} onChange={(qp) => set({ ...e, qp })} />
                <p className="hint">Bass boost {(40 * Math.log10(e.f0 / e.fp)).toFixed(1)} dB at DC. Check the excursion chart.</p>
              </>
            ) : (
              <>
                <Num help={HELP["Freq"]} label="Freq" unit="Hz" value={e.freq} onChange={(freq) => set({ ...e, freq })} />
                <Num help={HELP["Gain"]} label="Gain" unit="dB" value={e.gain_db} min={-30} onChange={(gain_db) => set({ ...e, gain_db: Math.min(24, gain_db) })} />
                {e.type === "lowshelf1" ? (
                  <p className="hint">A gentle shelf, 6 dB/octave: half its gain at Freq. The Dipole EQ uses it for an open baffle.</p>
                ) : (
                  <Num help={HELP["Q"]} label="Q" value={e.q} onChange={(q) => set({ ...e, q })} />
                )}
              </>
            )}
            <div className="sg-actions">
              {e.type === "linkwitz" && (
                <Button
                  variant="ghost"
                  disabled={!r}
                  title={r ? "Use the box's fc and Qtc as f0 and Q0" : "Pick a sealed box or infinite baffle under “Applies to”"}
                  onClick={() => r && set({ ...e, f0: round(r.summary.fc!), q0: round(r.summary.qtc!, 3) })}
                >
                  <Sparkle />
                  Match the box
                </Button>
              )}
              <Button variant="ghost" icon="trash" onClick={() => remove(e)}>
                Remove
              </Button>
            </div>
          </Disclosure>
        );
      })}
      <div className="sg-actions sg-start">
        <Menu label="Filter" variant="secondary" icon="plus" caret={false} align="start" items={adds} />
      </div>
      <p className="hint">EQ sits before the amplifier: boosts raise excursion and power. Or use ✎ Edit on the response chart.</p>
    </Section>
  );
}

const round = (v: number, digits = 1) => Number(v.toFixed(digits));
