import { useState } from "react";
import { Sparkle } from "./Logo.tsx";
import type { PassiveBranch } from "@sbg/engine";
import { Num, Select } from "./components.tsx";
import { Button, Disclosure, FieldRow, Menu, Section, Switch, type MenuItem, helpEntries } from "./ui/index.ts";
import type { AppState } from "./state.ts";

/** What each field of this row does: the fields' help and the row's ⓘ sheet (fields that only show after a choice too). */
const HELP: Record<string, string> = {
  "Use": "Coils, capacitors and resistors between the amplifier and the drivers: a passive low-pass for a subwoofer or a full-range driver, a Zobel, or an L-pad. The impedance chart then shows what the amplifier sees.",
  "L": "A coil (inductor). 0 = none.",
  "C": "A capacitor. 0 = none.",
  "Joined": "How this branch's parts are joined: one after another (series) or side by side (parallel).",
};

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

const PART = { r: { name: "resistor", title: "Resistor" }, l: { name: "inductor", title: "Inductor (coil)" }, c: { name: "capacitor", title: "Capacitor" } } as const;

const fitted = (b: PassiveBranch | undefined) => !!b && ((b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0);

/** A branch's parts in a few words, for its closed row: "L 2.2 mH · R 0.3 Ω". */
const branchText = (b: PassiveBranch) =>
  [b.l_mH ? `L ${b.l_mH} mH` : "", b.c_uF ? `C ${b.c_uF} µF` : "", b.r ? `R ${b.r} Ω` : ""].filter(Boolean).join(" · ") || "Empty";

/** Coils, capacitors and resistors between the amplifier and the drivers. */
export function PassiveSection(props: { value: Passive; re: number; le_mh: number; onChange: (p: Passive) => void }) {
  const p = props.value;
  // Most networks need two branches: show 3 and 4 when they're used or asked for.
  const [more, setMore] = useState(false);
  const shown = more || fitted(p.branches[2]) || fitted(p.branches[3]) ? 4 : 2;
  const setBranch = (k: number, b: PassiveBranch) => props.onChange({ ...p, branches: p.branches.map((x, i) => (i === k ? b : x)) });
  const clean = (b: PassiveBranch, patch: Partial<PassiveBranch>): PassiveBranch => {
    const out: PassiveBranch = { ...b, ...patch };
    for (const key of ["r", "l_mH", "c_uF"] as const) if (!(out[key]! > 0)) delete out[key];
    return out;
  };
  const parts = p.branches.reduce((n, b) => n + (b.r ? 1 : 0) + (b.l_mH ? 1 : 0) + (b.c_uF ? 1 : 0), 0);
  const fills: MenuItem[] = STARTS.map((s) => ({
    label: s.label,
    // The Zobel is worked out from the driver's Re and Le; the others are fixed starting values.
    icon: s.id === "zobel" ? <Sparkle /> : undefined,
    onSelect: () => props.onChange({ on: true, branches: s.branches(props.re, props.le_mh || 1) }),
  }));
  return (
    <Section help={helpEntries(HELP)} icon="passive" title="Passive parts" value={p.on ? (parts ? `${parts} part${parts > 1 ? "s" : ""}` : "On, empty") : "Off"}>
      <FieldRow
        label="Use"
        help={HELP["Use"]}
      >
        {(id) => <Switch id={id} checked={p.on} aria-label="Use passive parts" onChange={(on) => props.onChange({ ...p, on })} />}
      </FieldRow>
      {p.on && (
        <>
          <div className="sg-actions">
            <Menu label="Fill from" variant="ghost" align="end" items={fills} />
          </div>
          {p.branches.slice(0, shown).map((b, k) => (
            <Disclosure key={k} title={`Branch ${PLACE[k]}`} value={branchText(b)} defaultOpen={k === 0}>
              <Num icon={PART.r} help={k % 2 === 0 ? "A resistor in line, or the coil's own resistance (DCR). 0 = none." : "A resistor across the drivers. 0 = none."} label="R" unit="Ω" value={b.r ?? 0} min={0} onChange={(r) => setBranch(k, clean(b, { r }))} />
              <Num icon={PART.l} help={HELP["L"]} label="L" unit="mH" value={b.l_mH ?? 0} min={0} onChange={(l_mH) => setBranch(k, clean(b, { l_mH }))} />
              <Num icon={PART.c} help={HELP["C"]} label="C" unit="µF" value={b.c_uF ?? 0} min={0} onChange={(c_uF) => setBranch(k, clean(b, { c_uF }))} />
              <Select<"series" | "parallel">
                help={HELP["Joined"]}
                label="Joined"
                value={b.join ?? "series"}
                options={[
                  { value: "series", text: "In series" },
                  { value: "parallel", text: "In parallel" },
                ]}
                onChange={(join) => setBranch(k, join === "parallel" ? { ...b, join } : (({ join: _, ...rest }) => rest)(b))}
              />
            </Disclosure>
          ))}
          {shown < 4 && (
            <div className="sg-actions">
              <Button variant="ghost" icon="plus" onClick={() => setMore(true)}>
                Branches 3 and 4
              </Button>
            </div>
          )}
          <p className="hint">
            Branches 1 and 3 sit in line with the drivers, 2 and 4 across them, from the amplifier (Hornresp&rsquo;s Filter Wizard layout). A part at 0
            isn&rsquo;t fitted; a coil&rsquo;s resistance (DCR) goes in as R.
          </p>
        </>
      )}
    </Section>
  );
}

const round = (v: number) => Number(v.toPrecision(3));
