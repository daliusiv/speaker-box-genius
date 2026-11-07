import type { PassiveBranch } from "@sbg/engine";
import { Card, Num, Select } from "./components.tsx";
import type { AppState } from "./state.ts";

type Passive = AppState["passive"];

const PLACE = ["1 · in line", "2 · across", "3 · in line", "4 · across"];

/** Starting points: each fills the four branches (Re is the driver's, for the Zobel). */
const STARTS: { id: string; label: string; title: string; branches: (re: number, le_mh: number) => PassiveBranch[] }[] = [
  { id: "coil", label: "Series coil", title: "A coil in line: 6 dB/oct low-pass, with the coil's own resistance", branches: () => [{ l_mH: 2, r: 0.3 }, {}, {}, {}] },
  { id: "lp2", label: "2nd-order low-pass", title: "A coil in line and a capacitor across: 12 dB/oct", branches: () => [{ l_mH: 2, r: 0.3 }, { c_uF: 200 }, {}, {}] },
  {
    id: "zobel",
    label: "Zobel",
    title: "A resistor and capacitor across the driver that cancel its coil's rising impedance (R = Re, C = Le / Re²)",
    branches: (re, le) => [{}, {}, {}, { r: round(re), c_uF: round((le / 1000 / re ** 2) * 1e6) }],
  },
  { id: "lpad", label: "Resistor (L-pad)", title: "A resistor in line and one across: turns a driver down", branches: () => [{ r: 2 }, { r: 8 }, {}, {}] },
];

/** Coils, capacitors and resistors between the amplifier and the drivers. */
export function PassivePanel(props: { value: Passive; re: number; le_mh: number; onChange: (p: Passive) => void }) {
  const p = props.value;
  const setBranch = (k: number, b: PassiveBranch) => props.onChange({ ...p, branches: p.branches.map((x, i) => (i === k ? b : x)) });
  const clean = (b: PassiveBranch, patch: Partial<PassiveBranch>): PassiveBranch => {
    const out: PassiveBranch = { ...b, ...patch };
    for (const key of ["r", "l_mH", "c_uF"] as const) if (!(out[key]! > 0)) delete out[key];
    return out;
  };
  return (
    <Card title="Passive parts">
      <div className="fields">
        <Select<"off" | "on"> help="Coils, capacitors and resistors between the amplifier and the drivers: a passive low-pass for a subwoofer or a full-range driver, a Zobel, or an L-pad. The impedance chart then shows what the amplifier sees."
          label="Passive parts"
          value={p.on ? "on" : "off"}
          options={[
            { value: "off", text: "Off" },
            { value: "on", text: "On" },
          ]}
          onChange={(v) => props.onChange({ ...p, on: v === "on" })}
        />
      </div>
      {p.on && (
        <>
          <div className="row">
            {STARTS.map((s) => (
              <button key={s.id} className="secondary" title={s.title} onClick={() => props.onChange({ on: true, branches: s.branches(props.re, props.le_mh || 1) })}>
                {s.label}
              </button>
            ))}
          </div>
          {p.branches.map((b, k) => (
            <div key={k}>
              <h3 className="set-head">Branch {PLACE[k]}</h3>
              <div className="fields">
              <Num help={k % 2 === 0 ? "A resistor in line, or the coil's own resistance (DCR). 0 = none." : "A resistor across the drivers. 0 = none."} label="R" unit="Ω" value={b.r ?? 0} min={0} onChange={(r) => setBranch(k, clean(b, { r }))} />
              <Num help="A coil (inductor). 0 = none." label="L" unit="mH" value={b.l_mH ?? 0} min={0} onChange={(l_mH) => setBranch(k, clean(b, { l_mH }))} />
              <Num help="A capacitor. 0 = none." label="C" unit="µF" value={b.c_uF ?? 0} min={0} onChange={(c_uF) => setBranch(k, clean(b, { c_uF }))} />
              <Select<"series" | "parallel"> help="How this branch's parts are joined: one after another (series) or side by side (parallel)."
                label="Joined"
                value={b.join ?? "series"}
                options={[
                  { value: "series", text: "In series" },
                  { value: "parallel", text: "In parallel" },
                ]}
                onChange={(join) => setBranch(k, join === "parallel" ? { ...b, join } : (({ join: _, ...rest }) => rest)(b))}
              />
              </div>
            </div>
          ))}
          <p className="hint">
            Branches 1 and 3 sit in line with the drivers, 2 and 4 across them, in that order from the amplifier (the layout of Hornresp&rsquo;s
            passive Filter Wizard). A part at 0 isn&rsquo;t fitted. Enter a coil&rsquo;s resistance (DCR) as R in its branch.
          </p>
        </>
      )}
    </Card>
  );
}

const round = (v: number) => Number(v.toPrecision(3));
