import { useRef, type ReactNode } from "react";
import type { AppState } from "./state.ts";
import type { NameKind } from "./driverName.ts";
import { ModifiedLine } from "./ModifiedLine.tsx";
import { Icon } from "./Icon.tsx";
import { Button, ButtonLink, Chip, collectHelp, FieldRow, HelpButton, Menu, Notice, NumberField, RadioCards, Readout, Section, Segmented, Select, Sheet, Stepper, TextField, type MenuItem } from "./ui/index.ts";

/**
 * The Driver tab's card: the driver, how many, then one row per group of settings (each shows
 * its current values while closed). The T/S parameters open from "Edit T/S": inline on wider
 * screens, in a full-screen sheet on phones, and by themselves when something needs attention.
 * Built from src/ui/ only (lint-migrated.json).
 */
export interface DriverCardProps {
  state: AppState;
  set: <K extends keyof AppState>(k: K, v: AppState[K]) => void;
  /** Phone layout (< 768 px): T/S in a sheet. */
  phone: boolean;
  /** The manufacturer's page, when the driver came from the database. */
  specs?: { url: string; title: string };
  /** The database picker for the main driver (DriverBrowser). */
  picker: ReactNode;
  /** Plausibility flag and other notes about the driver itself. */
  notes?: ReactNode;
  /** A database driver whose values were changed: what changed, and a reset to the database's values. */
  modified?: Modified | null;
  /** The driver's name, first in Edit T/S: fixed for a database driver, editable otherwise. */
  name: { kind: NameKind; onChange: (name: string) => void };
  ts: {
    /** The T/S editor (fields, paste box, conflicts). */
    editor: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Something needs a look (missing values, conflicts, pasting): open on wide screens, a notice on phones. */
    attention?: string;
    fill: readonly MenuItem[];
    submitUrl: string;
    /** Opens the website form; without it the menu links to the GitHub issue form. */
    onSubmit?: () => void;
    onClear: () => void;
  };
  sections: { open: ReadonlySet<string>; onToggle: (key: string, open: boolean) => void };
  compare: { picker: ReactNode; onSwap: () => void; onStop: () => void; modified?: Modified | null };
  amp?: { nominal: number; re: number; low?: { z: number; f: number; name?: string } } | null;
  /** As-wired Re and Qes for a dual-coil driver. */
  dvcNote?: string;
}

interface Modified {
  text: string;
  onReset: () => void;
}

const RESET_HELP =
  "This driver came from the database and some of its values were changed here (typed, pasted or measured). Reset puts the database's published values and name back; your boxes, the number of drivers, their wiring and the volume calculator stay as they are. Undo brings your values back.";

/** "Changed from the database: T/S." with a Reset (one line under the driver it's about). */
function ModifiedNote(props: { modified: Modified; what: string }) {
  return <ModifiedLine text={props.modified.text} help={RESET_HELP} resetLabel={`Reset ${props.what} to the database's values`} onReset={props.modified.onReset} />;
}

const ohms = (x: number) => (x >= 10 ? x.toFixed(0) : Number(x.toPrecision(2)).toString());
const hz = (f: number) => (f < 100 ? f.toFixed(1) : f.toFixed(0));
const num = (v: number) => String(Number(v.toPrecision(4)));

export function DriverCard(p: DriverCardProps) {
  const { state: s, set } = p;
  const card = useRef<HTMLElement>(null);
  const tsBox = useRef<HTMLDivElement>(null);
  const tsOpen = p.ts.open;
  // One row: the typed / calculated key, then every action in one menu (fill from, submit, clear).
  const tools = (
    <div className="dv-ts-tools">
      <span className="dv-ts-key" aria-hidden="true">
        <i className="dv-key-typed" />
        Typed
        <i className="dv-key-calc" />
        Calculated
      </span>
      <Menu
        label="T/S actions"
        iconOnly
        icon="more"
        variant="secondary"
        align="end"
        className="dv-ts-more"
        items={[
          { kind: "heading", label: "Fill from" },
          ...p.ts.fill,
          { kind: "separator" },
          p.ts.onSubmit ? { label: "Submit to database…", onSelect: p.ts.onSubmit } : { kind: "link", label: "Submit to database", href: p.ts.submitUrl, icon: <Icon name="external" /> },
          { kind: "separator" },
          { label: "Clear all values", danger: true, onSelect: p.ts.onClear },
        ]}
      />
    </div>
  );
  const nameRow =
    p.name.kind === "database" ? (
      <div className="ui-field dv-name" data-help="The name shared links, images and exports use. A database driver keeps the database's name; change a T/S value and it becomes yours to rename, with “(edited)” added." data-help-title="Name">
        <span className="ui-field-label">Name</span>
        <span className="dv-name-fixed">
          <b>{s.driverName}</b>
        </span>
      </div>
    ) : (
      <div className="dv-name">
        <FieldRow
          label="Name"
          help="The name shared links, images and exports use. A database driver keeps the database's name; change a T/S value and it becomes yours to rename, with “(edited)” added."
        >
          {(id) => <TextField id={id} value={s.driverName} placeholder="Brand and model" onChange={(e) => p.name.onChange(e.currentTarget.value)} />}
        </FieldRow>
      </div>
    );
  const sec = (key: string) => ({ open: p.sections.open.has(key), onToggle: (o: boolean) => p.sections.onToggle(key, o) });
  const unitsLabel = s.isobaric ? "Pairs" : "Number of drivers";

  return (
    <section ref={card} className="ui-card dv-card" aria-labelledby="dv-title">
      <div className="ui-card-head">
        <h2 className="ui-card-title" id="dv-title">
          Driver
        </h2>
        {p.specs && <ButtonLink href={p.specs.url} target="_blank" icon="datasheet" label={p.specs.title} />}
        <Button variant="ghost" icon="sliders" aria-expanded={tsOpen} onClick={() => p.ts.onOpenChange(!tsOpen)}>
          Edit T/S
        </Button>
        <HelpButton className="ui-card-help" title="Driver" icon="speaker" collect={() => collectHelp(card.current, { skipRows: true, only: (el) => !el.closest(".ui-sheet") })} />
      </div>

      <div className="dv-body">
        {p.picker}
        {p.notes}
        {p.ts.attention && !tsOpen && (
          <Notice tone="warn">
            {p.ts.attention}{" "}
            <Button variant="ghost" size="sm" onClick={() => p.ts.onOpenChange(true)}>
              Edit T/S
            </Button>
          </Notice>
        )}
      </div>

      {!p.phone && tsOpen && (
        <div className="dv-ts" role="region" aria-label="T/S parameters">
          {nameRow}
          {p.modified && <ModifiedNote modified={p.modified} what="the driver" />}
          {tools}
          <div ref={tsBox}>{p.ts.editor}</div>
        </div>
      )}
      {p.phone && (
        <Sheet
          open={p.ts.open}
          onClose={() => p.ts.onOpenChange(false)}
          title="T/S parameters"
          className="dv-ts-sheet"
          footer={
            <Button variant="primary" onClick={() => p.ts.onOpenChange(false)}>
              Done
            </Button>
          }
          actions={<HelpButton title="T/S parameters" icon="sliders" collect={() => collectHelp(tsBox.current)} />}
        >
          {nameRow}
          {p.modified && <ModifiedNote modified={p.modified} what="the driver" />}
          {tools}
          <div ref={tsBox}>{p.ts.editor}</div>
        </Sheet>
      )}

      <div className="dv-body">
        <FieldRow label={unitsLabel} help="How many drivers (or isobaric pairs) share the box. More drivers move more air; the box volume is shared between them.">
          {(id) => <Stepper id={id} label={unitsLabel} value={s.drivers} min={1} max={64} onChange={(v) => set("drivers", v)} />}
        </FieldRow>
        {p.modified && !tsOpen && <ModifiedNote modified={p.modified} what="the driver" />}
      </div>

      <Section icon="signal" title="Large signal" value={`Xmax ${s.xmax_mm > 0 ? `${num(s.xmax_mm)} mm` : "not set"} · Pe ${s.pe_w > 0 ? `${num(s.pe_w)} W` : "not set"}`} {...sec("large")}>
        <FieldRow label="Xmax" help="Maximum one-way excursion the cone can make while staying linear (from the datasheet). The excursion chart turns red above it. Empty when an imported file didn't have it: no redline until you enter it.">
          {(id) => <NumberField id={id} value={s.xmax_mm > 0 ? s.xmax_mm : undefined} placeholder="not set" unit="mm" positive onChange={(v) => set("xmax_mm", v ?? 0)} />}
        </FieldRow>
        <FieldRow label="Pe" help="Thermal power rating: how much power the voice coil can take continuously. Sets the thermal limit in the Max SPL chart. Empty when an imported file didn't have it.">
          {(id) => <NumberField id={id} value={s.pe_w > 0 ? s.pe_w : undefined} placeholder="not set" unit="W" positive onChange={(v) => set("pe_w", v ?? 0)} />}
        </FieldRow>
      </Section>

      <Section icon="sliders" title="Coil & suspension" value={`Le ${num(s.le_mh)} mH · ${s.fdd ? "FDD" : "from Qms"}`} {...sec("coil")}>
        <FieldRow label="Le" help="Voice-coil inductance from the datasheet. It makes the impedance rise with frequency and rolls off the top end; Settings can leave it out, like WinISD.">
          {(id) => <NumberField id={id} value={s.le_mh} unit="mH" min={0} onChange={(v) => v !== undefined && set("le_mh", v)} />}
        </FieldRow>
        <div data-help="How the voice coil's inductance is modelled. Le (with the optional L2 and R2) is the usual datasheet way. Semi-inductance is Hornresp's model (Thorborg and Futtrup): Re + Leb + (Le ∥ Rss ∥ Ke·√jω), which follows a real coil's impedance from a measured sweep more closely; its values come from fitting tools or forum posts." data-help-title="Coil model">
          <RadioCards<"le" | "semi">
            legend="Coil model"
            value={s.semi ? "semi" : "le"}
            options={[
              { value: "le", title: "Le (+ L2/R2)", description: "Datasheet values", aside: <Chip>Default</Chip> },
              { value: "semi", title: "Semi-inductance", description: "Fitted, like Hornresp" },
            ]}
            onChange={(m) => set("semi", m === "semi" ? (s.semi ?? { leb_mh: 0, le_mh: s.le_mh, ke: 0, rss_ohm: 0 }) : undefined)}
          />
        </div>
        {s.semi ? (
          <>
            <FieldRow label="Re′" help="Semi-inductance model: the coil's resistance in this model (Hornresp's Re′), when fitted apart from Re. 0 = Re. Bl stays as the T/S give it.">
              {(id) => <NumberField id={id} value={s.semi!.re_ohm ?? 0} unit="Ω" min={0} onChange={(v) => v !== undefined && set("semi", { ...s.semi!, re_ohm: v })} />}
            </FieldRow>
            <FieldRow label="Leb" help="Semi-inductance model: the coil's inductance outside the pole piece, in series with the rest.">
              {(id) => <NumberField id={id} value={s.semi!.leb_mh} unit="mH" min={0} onChange={(v) => v !== undefined && set("semi", { ...s.semi!, leb_mh: v })} />}
            </FieldRow>
            <FieldRow label="Le (semi)" help="Semi-inductance model: the inductance in parallel with Rss and Ke. Not the datasheet Le, which this model replaces.">
              {(id) => <NumberField id={id} value={s.semi!.le_mh} unit="mH" min={0} onChange={(v) => v !== undefined && set("semi", { ...s.semi!, le_mh: v })} />}
            </FieldRow>
            <FieldRow label="Ke" help="Semi-inductance model: the semi-inductance (eddy currents in the pole piece), in semi-henries. 0 = none.">
              {(id) => <NumberField id={id} value={s.semi!.ke} unit="sH" min={0} onChange={(v) => v !== undefined && set("semi", { ...s.semi!, ke: v })} />}
            </FieldRow>
            <FieldRow label="Rss" help="Semi-inductance model: losses from a shorting ring, in parallel with Le and Ke. 0 = none.">
              {(id) => <NumberField id={id} value={s.semi!.rss_ohm} unit="Ω" min={0} onChange={(v) => v !== undefined && set("semi", { ...s.semi!, rss_ohm: v })} />}
            </FieldRow>
          </>
        ) : (
          <>
            <FieldRow label="L2" help="Optional: second, lossy inductance (L2R2 coil model). 0 = plain Le. Fill in from a measured sweep.">
              {(id) => <NumberField id={id} value={s.l2_mh} unit="mH" min={0} onChange={(v) => v !== undefined && set("l2_mh", v)} />}
            </FieldRow>
            <FieldRow label="R2" help="Optional: resistance across L2 (eddy-current losses). Used only when L2 is also set.">
              {(id) => <NumberField id={id} value={s.r2_ohm} unit="Ω" min={0} onChange={(v) => v !== undefined && set("r2_ohm", v)} />}
            </FieldRow>
          </>
        )}
        <div data-help="How the suspension's losses are modelled. From Qms: one resistance (Rms), the usual T/S way. Frequency-dependent damping is Hornresp's FDD model: the suspension's compliance becomes complex (Cms − j·Ams), a loss that stays the same fraction of its stiffness at every frequency, as rubber and foam surrounds behave, plus its own Rms. It mostly changes the impedance peak and the response near Fs." data-help-title="Suspension losses">
          <RadioCards<"qms" | "fdd">
            legend="Suspension losses"
            value={s.fdd ? "fdd" : "qms"}
            options={[
              { value: "qms", title: "From Qms", description: "One resistance, the T/S way", aside: <Chip>Default</Chip> },
              { value: "fdd", title: "Frequency-dependent", description: "FDD, like Hornresp" },
            ]}
            onChange={(m) => set("fdd", m === "fdd" ? (s.fdd ?? { rms: 0, ams_mm_per_n: 0 }) : undefined)}
          />
        </div>
        {s.fdd && (
          <>
            <FieldRow label="Rms (FDD)" help="FDD model: the suspension's viscous resistance, in place of the Rms from Qms.">
              {(id) => <NumberField id={id} value={s.fdd!.rms} unit="N·s/m" min={0} onChange={(v) => v !== undefined && set("fdd", { ...s.fdd!, rms: v })} />}
            </FieldRow>
            <FieldRow label="Ams" help="FDD model: the lossy part of the compliance (Hornresp shows it in m/N: 3.00E-04 m/N is 0.3 mm/N). Ams ÷ Cms is the loss factor. 0 = off.">
              {(id) => <NumberField id={id} value={s.fdd!.ams_mm_per_n} unit="mm/N" min={0} onChange={(v) => v !== undefined && set("fdd", { ...s.fdd!, ams_mm_per_n: v })} />}
            </FieldRow>
          </>
        )}
      </Section>

      <Section
        icon="circuit"
        title="Wiring"
        value={[s.isobaric ? "Isobaric" : "Normal", s.dvc.on ? "dual coil" : "single coil", s.drivers > 1 ? s.wiring : null, `${num(s.nominal_ohms)} Ω`].filter(Boolean).join(" · ")}
        {...sec("wiring")}
      >
        <FieldRow label="Loading" help="Normal: each driver faces out. Isobaric: two drivers work as one (face to face or front to back), needing half the box for the same bass but 3 dB less efficiency.">
          {(id) => (
            <Segmented<"standard" | "isobaric">
              id={id}
              label="Loading"
              value={s.isobaric ? "isobaric" : "standard"}
              options={[
                { value: "standard", label: "Normal" },
                { value: "isobaric", label: "Isobaric" },
              ]}
              onChange={(x) => set("isobaric", x === "isobaric")}
            />
          )}
        </FieldRow>
        {s.isobaric && (
          <FieldRow label="Pair coils" help="How the two coils of each isobaric pair are wired together: parallel halves the impedance, series doubles it.">
            {(id) => (
              <Segmented<"parallel" | "series">
                id={id}
                label="Pair coils"
                value={s.isoCoils}
                options={[
                  { value: "parallel", label: "Parallel" },
                  { value: "series", label: "Series" },
                ]}
                onChange={(x) => set("isoCoils", x)}
              />
            )}
          </FieldRow>
        )}
        <FieldRow label="Voice coils" help="Dual voice coil (DVC) drivers have two coils you can wire in series or parallel. Choose Dual to get those options.">
          {(id) => (
            <Segmented<"single" | "dual">
              id={id}
              label="Voice coils"
              value={s.dvc.on ? "dual" : "single"}
              options={[
                { value: "single", label: "Single" },
                { value: "dual", label: "Dual" },
              ]}
              onChange={(x) => set("dvc", { ...s.dvc, on: x === "dual" })}
            />
          )}
        </FieldRow>
        {s.dvc.on && (
          <>
            <FieldRow label="Values are for" help="Datasheets for DVC drivers give T/S values for one coil or for both coils wired a certain way. Say which, so the wiring below is calculated correctly.">
              {(id) => (
                <Select<"one" | "parallel" | "series">
                  id={id}
                  value={s.dvc.entered}
                  options={[
                    { value: "parallel", label: "Both coils in parallel" },
                    { value: "series", label: "Both coils in series" },
                    { value: "one", label: "One coil" },
                  ]}
                  onChange={(entered) => set("dvc", { ...s.dvc, entered })}
                />
              )}
            </FieldRow>
            <FieldRow label="Coils wired" help="How you will wire the two voice coils: series doubles the impedance, parallel halves it. It changes the load on the amplifier, not the bass shape.">
              {(id) => (
                <Segmented<"parallel" | "series">
                  id={id}
                  label="Coils wired"
                  value={s.dvc.wired}
                  options={[
                    { value: "parallel", label: "Parallel" },
                    { value: "series", label: "Series" },
                  ]}
                  onChange={(wired) => set("dvc", { ...s.dvc, wired })}
                />
              )}
            </FieldRow>
          </>
        )}
        {s.drivers > 1 && (
          <FieldRow label={s.isobaric ? "Pairs wired" : "Drivers wired"} help="How several drivers (or pairs) are wired to the amplifier: parallel lowers the impedance, series raises it.">
            {(id) => (
              <Segmented<"parallel" | "series">
                id={id}
                label="Wiring"
                value={s.wiring}
                options={[
                  { value: "parallel", label: "Parallel" },
                  { value: "series", label: "Series" },
                ]}
                onChange={(x) => set("wiring", x)}
              />
            )}
          </FieldRow>
        )}
        <FieldRow label="Znom" help="Nominal impedance printed on the driver (4, 8 Ω…). Only used when the drive is set as watts into the nominal impedance; the simulation itself uses Re.">
          {(id) => <NumberField id={id} value={s.nominal_ohms} unit="Ω" positive onChange={(v) => v !== undefined && set("nominal_ohms", v)} />}
        </FieldRow>
        {p.dvcNote && <p className="hint dv-note">{p.dvcNote}</p>}
        {p.amp && (
          <>
            <Readout label="Amp load (nominal)" value={`${ohms(p.amp.nominal)} Ω · Re ${p.amp.re.toFixed(2)} Ω`} />
            {p.amp.low && <Readout label="Amp load (min)" value={`${p.amp.low.z.toFixed(2)} Ω @ ${hz(p.amp.low.f)} Hz`} />}
            {p.amp.low?.name && <p className="hint dv-note">Lowest in {p.amp.low.name}.</p>}
          </>
        )}
        <details className="why dv-note">
          <summary>How wiring works</summary>
          <p className="hint">
            {s.isobaric
              ? `Each pair is two drivers working as one (face to face or one behind the other): same Fs and Qts, half the Vas, so about half the box. ${s.drivers * 2} drivers in total. `
              : "Multiple drivers share each box. "}
            Wiring changes the impedance the amplifier sees and the voltage each driver gets; power is what the amplifier delivers into the whole set.
          </p>
        </details>
      </Section>

      <Section icon="charts" title="Compare" value={s.compare ? s.compare.driverName : "Off"} {...sec("compare")}>
        <div className="dv-compare" data-help="Shows a second driver in every box as faint dashed curves, with the same settings and, unless you give it its own number below, the same number of drivers and wiring. Swap makes it the main driver (to edit it or size boxes for it)." data-help-title="Compare with another driver">
          {p.compare.picker}
        </div>
        {p.compare.modified && <ModifiedNote modified={p.compare.modified} what="the comparison driver" />}
        {s.compare ? (
          <>
            <div className="dv-compare-actions">
              <Button variant="ghost" size="sm" onClick={p.compare.onSwap}>
                ⇅ Swap with main
              </Button>
              <Button variant="ghost" size="sm" icon="close" onClick={p.compare.onStop}>
                Stop comparing
              </Button>
            </div>
            <FieldRow label="Its drivers" help="How many of the comparison driver share each box: the same as the main driver (like for like), or its own number, to compare one 15″ with two 10″.">
              {(id) => {
                const c = s.compare!;
                const counts = [1, 2, 3, 4, 6, 8];
                return (
                  <Select<string>
                    id={id}
                    value={c.drivers === undefined ? "same" : String(c.drivers)}
                    options={[
                      { value: "same", label: `Same as main (${s.drivers})` },
                      ...counts.map((n) => ({ value: String(n), label: `${n}` })),
                      ...(c.drivers !== undefined && !counts.includes(c.drivers) ? [{ value: String(c.drivers), label: String(c.drivers) }] : []),
                    ]}
                    onChange={(x) => {
                      const { drivers: _d, wiring: _w, ...rest } = c;
                      set("compare", x === "same" ? rest : { ...rest, drivers: Number(x), wiring: c.wiring ?? s.wiring });
                    }}
                  />
                );
              }}
            </FieldRow>
            {s.compare.drivers !== undefined && s.compare.drivers > 1 && (
              <FieldRow label="Its wiring" help="How the comparison drivers are wired to the amplifier: parallel lowers the impedance, series raises it.">
                {(id) => (
                  <Segmented<"parallel" | "series">
                    id={id}
                    label="Its wiring"
                    value={s.compare!.wiring ?? s.wiring}
                    options={[
                      { value: "parallel", label: "Parallel" },
                      { value: "series", label: "Series" },
                    ]}
                    onChange={(wiring) => set("compare", { ...s.compare!, wiring })}
                  />
                )}
              </FieldRow>
            )}
          </>
        ) : (
          <p className="hint dv-note">Shown as faint dashed curves in every box.</p>
        )}
      </Section>
    </section>
  );
}
