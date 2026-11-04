import { useState, type ReactNode } from "react";
import {
  portEffectiveLength,
  prAddedMassForFb,
  prFb,
  prGroupsAddedMassForFb,
  prGroupsFb,
  portLengthForFb,
  sealedVolumeForAlignment,
  ventedFb,
  type AlignmentDriver,
  type Air,
} from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { PassiveRadiatorBrowser } from "./Library.tsx";
import { loadPrChoice, type DbIndex } from "./library.ts";
import { PrTuning } from "./PrTuning.tsx";
import { LineBody, type ImportedDriver } from "./LineBody.tsx";

/** What the volume calculator and build sheet need from a chosen PR. */
export interface PrPhysical {
  displacement_l?: number;
  cutout_mm?: number;
}
import { KIND_LABEL, PORT_LIMIT, portOf } from "./sim.ts";
import { useUnits } from "./units.ts";
import { bandpassLossesFrom } from "./state.ts";
import { prTuning, withPreset, ventedAlignmentFor } from "./presets.ts";
import { PrFinder, type FinderContext } from "./PrFinder.tsx";

/** The preset chip's label: which flat vented alignment this driver gets. */
const alignLabel = (a: AlignmentDriver | null, drivers: number) => {
  const v = a && ventedAlignmentFor(a, drivers);
  return v ? v.name : "QB3 / B4";
};
import type {
  BandpassDesign,
  BandpassLosses,
  BandpassOrder,
  ChamberLosses,
  ChamberOpening,
  DesignKind,
  DesignState,
  PortFields,
  PrDesign,
  PrGroupState,
  VentedDesign,
} from "./state.ts";

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "–");

interface CommonProps<D extends DesignState> {
  design: D;
  color: string;
  /** Effective Vb (from the volume calculator when linked). */
  vb_l: number;
  linked: boolean;
  air: Air;
  /** Solved driver for alignment presets; null while parameters are incomplete. */
  align: AlignmentDriver | null;
  drivers: number;
  onChange: (d: D) => void;
}

const LINKED_NOTE = "Presets change the box volume, so they're off while the volume calculator feeds this design.";

function Presets(props: { children: ReactNode; note?: string }) {
  return (
    <div className="presets">
      <span>Presets:</span>
      {props.children}
      {props.note && <p className="hint">{props.note}</p>}
    </div>
  );
}

/** Card shell shared by all design types: colour, editable name, on/off, duplicate, delete. */
function DesignShell(props: {
  design: DesignState;
  color: string;
  canDelete: boolean;
  onChange: (patch: Partial<DesignState>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Driver letter, shown once there are several drivers. */
  driverTag?: string;
  children: ReactNode;
}) {
  const d = props.design;
  return (
    <section className={`card design${d.on ? "" : " off"}`}>
      <div className="design-head">
        <span className="swatch" style={{ background: props.color }} />
        <input
          className="design-name"
          data-help-title="Design name"
          data-help="Name this design: it labels its curves on every chart. Duplicate a design to compare a variation side by side."
          value={d.name}
          aria-label="Design name"
          onChange={(e) => props.onChange({ name: e.currentTarget.value })}
        />
        {/* The type, unless the name already says it ("Ported 2" needs no "Ported" beside it). */}
        {!d.name.toLowerCase().startsWith(KIND_LABEL[d.kind].toLowerCase()) && <span className="kind">{KIND_LABEL[d.kind]}</span>}
        {d.preset && (
          <span className="preset-tag" title={`Last sized with the ${d.preset} preset`}>
            {d.preset}
          </span>
        )}
        {props.driverTag && (
          <span className="driver-tag" title={`Uses driver ${props.driverTag}`}>
            {props.driverTag}
          </span>
        )}
        <input
          type="checkbox"
          checked={d.on}
          onChange={(e) => props.onChange({ on: e.currentTarget.checked })}
          aria-label={`Show ${d.name}`}
          title="Show on the charts"
        />
        <button className="icon" title="Duplicate this design" aria-label={`Duplicate ${d.name}`} onClick={props.onDuplicate}>
          ⧉
        </button>
        {props.canDelete && (
          <button className="icon" title="Delete this design" aria-label={`Delete ${d.name}`} onClick={props.onDelete}>
            ✕
          </button>
        )}
      </div>
      {d.on && props.children}
    </section>
  );
}

function VbField(props: { vb_l: number; value: number; linked: boolean; label?: string; onChange: (v: number) => void }) {
  const label = props.label ?? "Vb";
  return props.linked ? (
    <Fixed label={label} num={props.vb_l} q="vol" title="From the volume calculator" />
  ) : (
    <Num help="Net internal air volume of the box (after the driver, port and bracing)." label={label} q="vol" value={props.value} onChange={props.onChange} />
  );
}

function TuneRow(props: { target: number; onTarget: (v: number) => void; button: string; title?: string; onApply: () => void }) {
  return (
    <div className="tune">
      <Num help="The tuning frequency you want. Press the button to size the port (or PR mass) for it." label="Tune to" unit="Hz" value={props.target} onChange={props.onTarget} />
      <button className="secondary" onClick={props.onApply} title={props.title}>
        {props.button}
      </button>
    </div>
  );
}

function SealedBody(p: CommonProps<DesignState & { kind: "sealed" }>) {
  const [msg, setMsg] = useState("");
  const apply = (qtc: number) => {
    if (!p.align) return;
    const vb = sealedVolumeForAlignment(p.align, qtc, p.drivers);
    if (vb === null) {
      setMsg(`This driver's Qts is already above ${qtc}; no sealed box can reach it.`);
      return;
    }
    setMsg("");
    p.onChange({ ...p.design, vb_l: Math.round(vb * 10) / 10, ...withPreset(p.design.name, `Qtc ${qtc}`) });
  };
  return (
    <>
      <div className="fields">
        <VbField vb_l={p.vb_l} value={p.design.vb_l} linked={p.linked} onChange={(vb_l) => p.onChange({ ...p.design, vb_l })} />
      </div>
      <Presets note={p.linked ? LINKED_NOTE : undefined}>
        {[0.5, 0.577, 0.707].map((q) => (
          <button key={q} className="chip" disabled={!p.align || p.linked} onClick={() => apply(q)} title={QTC_TITLES[q]}>
            Qtc {q}
          </button>
        ))}
      </Presets>
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

const QTC_TITLES: Record<number, string> = {
  0.5: "Critically damped: best transient response, gentle roll-off",
  0.577: "Bessel: flattest group delay",
  0.707: "Butterworth: flattest amplitude, smallest box for the extension",
};

/** Only replace a default name, so the user's own names survive presets. */

interface PortContext {
  /** Peak port velocity in the displayed convention (above the subsonic cut-off), if simulated. */
  portVelocity: number | null;
  /** Bandpass: the same for the rear chamber's port. */
  rearPortVelocity: number | null;
  /** Largest internal box dimension (cm) when the volume calculator feeds this design. */
  internalMax_cm: number | null;
  /** Where portVelocity was taken: the throat, or the mouths of a port flared at both ends. */
  portVelocityAt?: "throat" | "ends";
  /** Port compression at this drive (when switched on in Settings). */
  portCompression?: { db: number; f: number } | null;
  /** Drive level, for wording. */
  drive?: string;
}

/** Warnings and suggestions about the port itself: does it fit, will it chuff, where does it resonate. */
function PortChecks(props: {
  v: PortFields & { flare_cm?: number };
  vb_l: number;
  air: Air;
  ctx: Pick<PortContext, "portVelocity" | "internalMax_cm" | "portVelocityAt" | "portCompression" | "drive">;
}) {
  const { v, vb_l, air, ctx } = props;
  const { fmt } = useUnits();
  const port = portOf(v);
  const leff = portEffectiveLength(port); // m
  const pipe = air.c / (2 * leff);
  const notes: { warn: boolean; chip: string; text: string }[] = [];

  // Will it fit? Keep at least one port diameter (or slot height) clear of the opposite wall.
  const clearance = v.shape === "round" ? v.diameter_cm : v.slotHeight_cm;
  const cube = Math.cbrt(vb_l * 1000);
  const room = (ctx.internalMax_cm ?? cube) - clearance;
  if (v.length_cm > room) {
    notes.push({
      warn: true,
      chip: "Port too long to fit",
      text:
        `The port is ${fmt(v.length_cm, "len")} long, but ${ctx.internalMax_cm ? "this box" : "a cube-shaped box of this volume"} ` +
        `only has room for about ${fmt(Math.max(0, room), "len")} in a straight line. Use a bent (L-shaped) port, a slot along a wall, or a bigger port area with a shorter length.`,
    });
  }

  // Chuffing: air speed scales with 1/area, so suggest the area that brings it under the line.
  if (ctx.portVelocity !== null && ctx.portVelocity > PORT_LIMIT) {
    const k = ctx.portVelocity / PORT_LIMIT;
    const fbNow = ventedFb(vb_l, port, v.count, undefined, air);
    const bigger: typeof port =
      v.shape === "round"
        ? { ...port, shape: "round", diameter_cm: v.diameter_cm * Math.sqrt(k) }
        : { ...port, shape: "slot", width_cm: v.slotWidth_cm * k, height_cm: v.slotHeight_cm };
    const newLen = portLengthForFb(vb_l, { ...bigger, length_cm: 0 }, fbNow, v.count, undefined, air);
    const size = v.shape === "round" ? `${fmt(v.diameter_cm * Math.sqrt(k), "len")} diameter` : `${fmt(v.slotWidth_cm * k, "len")} wide`;
    const ports = Math.ceil(v.count * k);
    const ends = ctx.portVelocityAt === "ends";
    notes.push({
      warn: true,
      chip: `Chuffing: ${ctx.portVelocity.toFixed(1)} m/s`,
      text: ends
        ? `Air speed at the flared ends reaches ${ctx.portVelocity.toFixed(1)} m/s. A bigger port, more ports or a larger flare radius brings it down (the flares set the noise, not the narrow middle).`
        : `Port air speed reaches ${ctx.portVelocity.toFixed(1)} m/s. To stay under ${PORT_LIMIT} m/s at this power: about ${size} ` +
          `(length ≈ ${fmt(newLen, "len")} for the same tuning)${ports > v.count ? `, or ${ports} ports of the current size` : ""}` +
          (v.shape === "round" && !(v.flare_cm! > 0) ? `. Flared ends also help a lot: try a flare radius of about ${fmt(v.diameter_cm / 4, "len")}.` : "."),
    });
  }

  // Port compression (Settings): what the port loses to turbulence at this power.
  const pc = ctx.portCompression;
  if (pc && pc.db >= 0.3) {
    notes.push({
      warn: pc.db >= 1.5,
      chip: `Compression −${pc.db.toFixed(1)} dB`,
      text:
        `At ${ctx.drive ?? "this power"} the port loses about ${pc.db.toFixed(1)} dB around ${pc.f.toFixed(0)} Hz to turbulence (approximate model, shown in the SPL chart). ` +
        (v.shape === "round" && !(v.flare_cm! > 0) ? "More port area or flared ends reduce it." : "More port area reduces it further."),
    });
  }

  // The box's own lowest standing wave (half a wavelength across its longest inside dimension):
  // when it lands near the port's pipe resonance it drives the port hard and the port rings.
  const boxMode = air.c / (2 * (ctx.internalMax_cm ?? cube) / 100);
  const coincide = Math.abs(boxMode / pipe - 1) < 0.15;
  notes.push({
    warn: pipe < 300 || coincide,
    chip: coincide ? `Pipe resonance ${pipe.toFixed(0)} Hz meets a box mode` : `Pipe resonance ${pipe.toFixed(0)} Hz`,
    text:
      `The port is also a pipe open at both ends; it resonates at about ${pipe.toFixed(0)} Hz (and ${(2 * pipe).toFixed(0)}, ${(3 * pipe).toFixed(0)} Hz…), ` +
      `letting midrange out of the box as a narrow peak.` +
      (pipe < 300 ? " That's low enough to reach the woofer's working range: cross over well below it, or use a shorter, narrower port." : "") +
      (coincide
        ? ` The box's longest inside dimension (${fmt(ctx.internalMax_cm ?? cube, "len")}${ctx.internalMax_cm ? "" : " for a cube"}) has its own standing wave at about ${boxMode.toFixed(0)} Hz, close to it: the box will drive the port hard there. Damping on the walls (and keeping the port's inner end away from the box's middle) helps, or change the port length a little.`
        : ` The box's own lowest standing wave is about ${boxMode.toFixed(0)} Hz${ctx.internalMax_cm ? "" : " (for a cube)"}.`) +
      " Settings → Ports → \u201cPipe\u201d draws the port's resonances on the SPL chart (the box's standing waves aren't simulated).",
  });

  return <CheckChips notes={notes} />;
}

/**
 * Checks as one-line chips (amber = a problem, plain = information); tapping a chip
 * opens its explanation and advice underneath.
 */
function CheckChips({ notes }: { notes: { warn: boolean; chip: string; text: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = notes.find((n) => n.chip === open);
  return (
    <div className="checks">
      <div className="check-chips">
        {notes.map((n) => (
          <button
            key={n.chip}
            className={`check-chip${n.warn ? " warn" : ""}${open === n.chip ? " open" : ""}`}
            aria-expanded={open === n.chip}
            onClick={() => setOpen(open === n.chip ? null : n.chip)}
          >
            {n.warn && <span aria-hidden="true">⚠ </span>}
            {n.chip}
          </button>
        ))}
      </div>
      {shown && <p className={shown.warn ? "warn check-detail" : "hint check-detail"}>{shown.text}</p>}
    </div>
  );
}

function VentedBody(p: CommonProps<VentedDesign> & { portCtx: PortContext }) {
  const v = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<VentedDesign>) => p.onChange({ ...v, ...patch });
  const fb = ventedFb(p.vb_l, portOf(v), v.count, undefined, p.air);

  const tune = () => {
    const len = portLengthForFb(p.vb_l, portOf(v, 0), v.targetFb, v.count, undefined, p.air);
    if (!(len > 0)) {
      setMsg(`Even a zero-length port tunes below ${v.targetFb} Hz with this port area. Use a bigger port (or more ports), or a lower tuning.`);
      return;
    }
    setMsg("");
    set({ length_cm: Math.round(len * 10) / 10 });
  };

  return (
    <>
      <div className="fields">
        <Select help="Round tube, or a slot (rectangular, often along a wall). Slots are easy to build and less prone to chuffing at the same area."
          label="Port"
          value={v.shape}
          options={[
            { value: "round", text: "Round tube" },
            { value: "slot", text: "Slot (rectangular)" },
          ]}
          onChange={(shape) => set({ shape })}
        />
        <VbField vb_l={p.vb_l} value={v.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        {v.shape === "round" ? (
          <>
            <Num help="Inside diameter of the port tube. Bigger means lower air speed (less chuffing) but a longer port for the same tuning." label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
            <Num
              label="Flare r"
              q="len"
              value={v.flare_cm ?? 0}
              min={0}
              title="Round-over radius at both ends (0 = a straight tube). About a quarter of the diameter is a good start."
              onChange={(x) => set({ flare_cm: x })}
            />
          </>
        ) : (
          <>
            <Num help="Inside width of the slot port." label="Width" q="len" value={v.slotWidth_cm} onChange={(x) => set({ slotWidth_cm: x })} />
            <Num help="Inside height of the slot port (the gap)." label="Height" q="len" value={v.slotHeight_cm} onChange={(x) => set({ slotHeight_cm: x })} />
          </>
        )}
        <Num help="Physical length of the port (tube or slot). Longer tunes lower; end corrections are added automatically." label="Length" q="len" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
        <Num help="Number of identical ports. Two ports have twice the area: half the air speed, but each needs to be longer for the same tuning." label="Ports" value={v.count} onChange={(x) => set({ count: Math.max(1, Math.round(x)) })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Box tuning frequency" />
      </div>
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      <Presets note={p.linked ? LINKED_NOTE : undefined}>
        <button
          className="chip"
          disabled={!p.align || p.linked}
          title="Flat vented alignment: QB3 (B4 at Qts ≈ 0.38) for low-Qts drivers, Keele's alignment for Qts 0.38–0.6"
          onClick={() => {
            const a = p.align && ventedAlignmentFor(p.align, p.drivers);
            if (!a) {
              setMsg("This driver's Qts is above 0.6: it suits a sealed box better than a vented one.");
              return;
            }
            const len = portLengthForFb(a.vb_l, portOf(v, 0), a.fb, v.count, undefined, p.air);
            if (!(len > 0)) {
              setMsg(`${a.name}: ${a.vb_l.toFixed(1)} L tuned to ${a.fb.toFixed(1)} Hz, but this port is too small for that tuning. Increase the port size and try again.`);
              return;
            }
            setMsg("");
            set({
              vb_l: Math.round(a.vb_l * 10) / 10,
              targetFb: Math.round(a.fb * 10) / 10,
              length_cm: Math.round(len * 10) / 10,
              ...withPreset(v.name, a.name),
            });
          }}
        >
          {alignLabel(p.align, p.drivers)}
        </button>
      </Presets>
      {msg && <p className="warn">{msg}</p>}
      <PortChecks v={v} vb_l={p.vb_l} air={p.air} ctx={p.portCtx} />
      <p className="hint">
        Physical port length{v.flare_cm > 0 && v.shape === "round" ? ", end to end including the flares" : ""}; end correction (0.732 ×
        diameter, like WinISD) is added automatically.
        {v.shape === "round" && v.flare_cm > 0 && v.length_cm < 2 * v.flare_cm && " The port is shorter than its two flares: lengthen it or use a smaller radius."}
        {v.shape === "slot" && " A slot along a box wall behaves slightly longer than this model assumes."}
      </p>
    </>
  );
}

/** Combined tuning and the added mass (on the first group) that reaches a target. */

function PrBody(
  p: CommonProps<PrDesign> & {
    db: DbIndex | null;
    onPrPhysical: (x: PrPhysical) => void;
    finder: FinderContext;
    onFound: (patch: Partial<PrDesign>, summary: string, physical?: PrPhysical) => void;
  },
) {
  const pr = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<PrDesign>) => p.onChange({ ...pr, ...patch });
  const setP = (patch: Partial<PrDesign["params"]>) => set({ params: { ...pr.params, ...patch } });
  const setGroup = (i: number, patch: Partial<PrGroupState>) =>
    set({ extra: pr.extra.map((g, k) => (k === i ? { ...g, ...patch } : g)) });
  const t = prTuning(pr, p.vb_l, p.air);
  const unreachable = (target: number) =>
    `Added mass on the first group can't bring the tuning down to ${target} Hz: past a point those PRs just stop moving and the other group sets the tuning. Add mass to the other group, use fewer of them, or a bigger box.`;

  const tune = () => {
    const add = t.massFor(pr.targetFb);
    if (add === Infinity) return setMsg(unreachable(pr.targetFb));
    if (add < 0) {
      setMsg(
        `With no added mass on the first group these PRs already tune to ${f1(t.bare())} Hz, below ${pr.targetFb} Hz. Use a lighter or stiffer PR, fewer PRs, or a smaller box.`,
      );
      return;
    }
    setMsg("");
    set({ addedMass_g: Math.round(add) });
  };

  return (
    <>
      <PassiveRadiatorBrowser
        rows={p.db?.passiveRadiators}
        drivers={p.db?.drivers}
        onPick={(id) =>
          loadPrChoice(id).then(
            ({ name, params, displacement_l, cutout_mm }) => {
              set({ prName: name, params });
              p.onPrPhysical({ displacement_l, cutout_mm });
            },
            () => alert("Couldn't load that passive radiator."),
          )
        }
      />
      <div className="row finder-row-button">
        <PrFinder
          ctx={p.finder}
          design={pr}
          vb_l={p.vb_l}
          linked={p.linked}
          db={p.db}
          onUse={(patch, summary, physical) => p.onFound(patch, summary, physical)}
        />
        <PrTuning ctx={p.finder} design={pr} vb_l={p.vb_l} linked={p.linked} onApply={(patch, summary) => p.onFound(patch, summary)} />
      </div>
      <p className="pr-name">{pr.prName}</p>
      <div className="fields">
        <VbField vb_l={p.vb_l} value={pr.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        <Num help="Number of identical passive radiators. More PRs means more cone area: less excursion each." label="PRs" value={pr.count} onChange={(v) => set({ count: Math.max(1, Math.round(v)) })} />
        <Num help="Mass glued onto the PR cone (grams). More mass tunes the box lower." label="Added mass" unit="g" value={pr.addedMass_g} min={0} onChange={(v) => set({ addedMass_g: v })} />
        <Fixed
          label={t.mixed ? "Fb ≈" : "Fb"}
          unit="Hz"
          value={f1(t.fb)}
          title={
            t.mixed
              ? "Approximate tuning of all the PRs together. With different PRs the response has more than one resonance; this sits between them. The charts show the real behaviour."
              : "Box tuning frequency with the added mass"
          }
        />
        <PrParamFields params={pr.params} onChange={setP} />
      </div>

      {pr.extra.map((g, i) => (
        <PrGroupCard
          key={i}
          title={`Passive radiator group ${i + 2}`}
          group={g}
          db={p.db}
          onChange={(patch) => setGroup(i, patch)}
          onRemove={() => set({ extra: pr.extra.filter((_, k) => k !== i) })}
        />
      ))}
      <div className="add-design">
        <button
          type="button"
          className="secondary"
          title="Put a second kind of passive radiator in the same box (or the same PR with a different added mass)"
          onClick={() =>
            set({ extra: [...pr.extra, { prName: pr.prName, count: 1, addedMass_g: pr.addedMass_g, params: { ...pr.params } }] })
          }
        >
          + Add a different passive radiator
        </button>
      </div>

      <TuneRow
        target={pr.targetFb}
        onTarget={(x) => set({ targetFb: x })}
        button="Set added mass"
        title={t.mixed ? "Sets the added mass on group 1's PRs; the other groups stay as they are" : undefined}
        onApply={tune}
      />
      <Presets note={p.linked ? LINKED_NOTE : undefined}>
        <button
          className="chip"
          disabled={!p.align || p.linked}
          title="Box size and tuning of the flat vented alignment (QB3/B4, or Keele's for Qts 0.38–0.6), reached with added mass"
          onClick={() => {
            const a = p.align && ventedAlignmentFor(p.align, p.drivers);
            if (!a) {
              setMsg("This driver's Qts is above 0.6: it suits a sealed box better than a vented one.");
              return;
            }
            const add = t.massFor(a.fb, a.vb_l);
            if (add === Infinity) return setMsg(unreachable(Math.round(a.fb * 10) / 10));
            if (add < 0) {
              setMsg(`${a.name} wants ${a.vb_l.toFixed(1)} L at ${a.fb.toFixed(1)} Hz, but these PRs tune lower than that even with no added mass. Try a lighter or stiffer PR, or fewer PRs.`);
              return;
            }
            setMsg("");
            set({
              vb_l: Math.round(a.vb_l * 10) / 10,
              targetFb: Math.round(a.fb * 10) / 10,
              addedMass_g: Math.round(add),
              ...withPreset(pr.name, a.name),
            });
          }}
        >
          {alignLabel(p.align, p.drivers)}
        </button>
      </Presets>
      {msg && <p className="warn">{msg}</p>}
      <p className="hint">
        Added mass is per passive radiator. PR Mms is the bare moving mass from the datasheet.
        {t.mixed &&
          " With mixed PRs each group gets its own excursion curve and Xmax line; the tuning helpers adjust group 1's added mass."}
      </p>
    </>
  );
}

/** One group of identical passive radiators: database picker, count, added mass and parameters. */
function PrGroupCard(props: {
  title?: string;
  group: PrGroupState;
  db: DbIndex | null;
  onChange: (patch: Partial<PrGroupState>) => void;
  onRemove?: () => void;
}) {
  const g = props.group;
  return (
    <div className={props.title ? "pr-group" : undefined}>
      {props.title && (
        <div className="pr-group-head">
          <h3>{props.title}</h3>
          {props.onRemove && (
            <button type="button" className="icon" aria-label={`Remove ${props.title}`} title="Remove this group" onClick={props.onRemove}>
              ×
            </button>
          )}
        </div>
      )}
      <PassiveRadiatorBrowser
        rows={props.db?.passiveRadiators}
        drivers={props.db?.drivers}
        onPick={(id) =>
          loadPrChoice(id).then(
            ({ name, params }) => props.onChange({ prName: name, params }),
            () => alert("Couldn't load that passive radiator."),
          )
        }
      />
      <p className="pr-name">{g.prName}</p>
      <div className="fields">
        <Num help="Number of identical passive radiators in this group." label="PRs" value={g.count} onChange={(v) => props.onChange({ count: Math.max(1, Math.round(v)) })} />
        <Num help="Mass glued onto each PR cone in this group (grams). More mass tunes lower." label="Added mass" unit="g" value={g.addedMass_g} min={0} onChange={(v) => props.onChange({ addedMass_g: v })} />
        <PrParamFields params={g.params} onChange={(patch) => props.onChange({ params: { ...g.params, ...patch } })} />
      </div>
    </div>
  );
}

/**
 * A bandpass chamber that opens through passive radiators: one or more groups,
 * the chamber's tuning, and a helper that sets group 1's added mass.
 */
function ChamberPrs(props: {
  groups: PrGroupState[];
  vb_l: number;
  air: Air;
  target: number;
  db: DbIndex | null;
  onTarget: (fb: number) => void;
  onChange: (groups: PrGroupState[]) => void;
}) {
  const [msg, setMsg] = useState("");
  const gs = props.groups;
  const engine = gs.map((g) => ({ pr: g.params, count: g.count, addedMass_g: g.addedMass_g }));
  const mixed = gs.length > 1;
  const fb = mixed ? prGroupsFb(props.vb_l, engine, props.air) : prFb(props.vb_l, gs[0]!.params, gs[0]!.count, gs[0]!.addedMass_g, props.air);
  const setGroup = (i: number, patch: Partial<PrGroupState>) => props.onChange(gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const tune = () => {
    const add = mixed
      ? prGroupsAddedMassForFb(props.vb_l, engine, props.target, 0, props.air)
      : prAddedMassForFb(props.vb_l, gs[0]!.params, props.target, gs[0]!.count, props.air);
    if (add === Infinity) {
      return setMsg(
        `Added mass on group 1 can't bring this chamber down to ${props.target} Hz: past a point those PRs stop moving and the other group sets the tuning.`,
      );
    }
    if (add < 0) return setMsg(`With no added mass these PRs already tune this chamber below ${props.target} Hz. Use a lighter or stiffer PR, fewer PRs, or a smaller chamber.`);
    setMsg("");
    setGroup(0, { addedMass_g: Math.round(add) });
  };
  return (
    <>
      {gs.map((g, i) => (
        <PrGroupCard
          key={i}
          title={mixed ? `Group ${i + 1}` : undefined}
          group={g}
          db={props.db}
          onChange={(patch) => setGroup(i, patch)}
          onRemove={mixed ? () => props.onChange(gs.filter((_, k) => k !== i)) : undefined}
        />
      ))}
      <div className="fields">
        <Fixed
          label={mixed ? "Fb ≈" : "Fb"}
          unit="Hz"
          value={f1(fb)}
          title={mixed ? "Approximate tuning of all this chamber's PRs together; the charts show the real behaviour." : "Tuning of this chamber's PRs"}
        />
      </div>
      <div className="add-design">
        <button
          type="button"
          className="secondary"
          onClick={() => props.onChange([...gs, { ...gs[gs.length - 1]!, count: 1, params: { ...gs[gs.length - 1]!.params } }])}
        >
          + Add a different passive radiator
        </button>
      </div>
      <TuneRow
        target={props.target}
        onTarget={props.onTarget}
        button="Set added mass"
        title={mixed ? "Sets the added mass on group 1's PRs" : undefined}
        onApply={tune}
      />
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

function PrParamFields(props: { params: PrDesign["params"]; onChange: (patch: Partial<PrDesign["params"]>) => void }) {
  const { params, onChange } = props;
  return (
    <>
      <Num help="Moving mass of the passive radiator (its datasheet value, without added mass)." label="PR Mms" unit="g" value={params.mms_g} onChange={(v) => onChange({ mms_g: v })} />
      <Num help="Compliance of the PR's suspension, as an equivalent air volume. Bigger means a softer suspension." label="PR Vas" unit="L" value={params.vas_l} onChange={(v) => onChange({ vas_l: v })} />
      <Num help="Mechanical Q of the PR: its own losses. Higher means a lossless, sharper resonance." label="PR Qms" value={params.qms} onChange={(v) => onChange({ qms: v })} />
      <Num help="Effective cone area of the passive radiator." label="PR Sd" unit="cm²" value={params.sd_cm2} onChange={(v) => onChange({ sd_cm2: v })} />
      <Num help="Maximum one-way excursion of the passive radiator before it bottoms out." label="PR Xmax" unit="mm" value={params.xmax_mm} onChange={(v) => onChange({ xmax_mm: v })} />
    </>
  );
}

/** Shape, size, length and count of one port, with its tuning and a "set length" helper. */
function PortEditor(props: {
  port: PortFields;
  /** Volume of the chamber the port tunes. */
  vb_l: number;
  air: Air;
  onChange: (p: PortFields) => void;
}) {
  const v = props.port;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<PortFields>) => props.onChange({ ...v, ...patch });
  const fb = ventedFb(props.vb_l, portOf(v), v.count, undefined, props.air);
  const tune = () => {
    const len = portLengthForFb(props.vb_l, portOf(v, 0), v.targetFb, v.count, undefined, props.air);
    if (!(len > 0)) {
      setMsg(`Even a zero-length port tunes below ${v.targetFb} Hz with this port area. Use a bigger port (or more ports), or a lower tuning.`);
      return;
    }
    setMsg("");
    set({ length_cm: Math.round(len * 10) / 10 });
  };
  return (
    <>
      <div className="fields">
        <Select help="Round tube, or a slot (rectangular, often along a wall)."
          label="Port"
          value={v.shape}
          options={[
            { value: "round", text: "Round tube" },
            { value: "slot", text: "Slot (rectangular)" },
          ]}
          onChange={(shape) => set({ shape })}
        />
        {v.shape === "round" ? (
          <Num help="Inside diameter of this chamber's port tube." label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
        ) : (
          <>
            <Num help="Inside width of the slot port." label="Width" q="len" value={v.slotWidth_cm} onChange={(x) => set({ slotWidth_cm: x })} />
            <Num help="Inside height of the slot port (the gap)." label="Height" q="len" value={v.slotHeight_cm} onChange={(x) => set({ slotHeight_cm: x })} />
          </>
        )}
        <Num help="Physical length of this chamber's port. Longer tunes lower." label="Length" q="len" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
        <Num help="Number of identical ports in this chamber." label="Ports" value={v.count} onChange={(x) => set({ count: Math.max(1, Math.round(x)) })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Tuning of this chamber with its port" />
      </div>
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

const BP_ORDERS: { value: BandpassOrder; text: string }[] = [
  { value: "4", text: "4th order (closed rear, open front)" },
  { value: "6p", text: "6th order (both chambers open to the outside)" },
  { value: "6s", text: "6th order series-tuned (rear opens into front)" },
];

const OPENINGS: { value: ChamberOpening; text: string }[] = [
  { value: "port", text: "Port" },
  { value: "pr", text: "Passive radiators" },
];

/**
 * Box losses for a bandpass: the shared values from Settings, or each chamber's own.
 * Qp only shows for a chamber that opens through a port.
 */
function BandpassLossesEditor(p: {
  losses: BandpassLosses | null;
  shared: ChamberLosses;
  frontPort: boolean;
  /** null: closed rear chamber (4th order). */
  rearPort: boolean | null;
  onChange: (l: BandpassLosses | null) => void;
}) {
  const l = p.losses;
  const chamber = (which: "front" | "rear", label: string, port: boolean) => {
    const c = l![which];
    const setC = (patch: Partial<ChamberLosses>) => p.onChange({ ...l!, [which]: { ...c, ...patch } });
    return (
      <>
        <Num label={`${label} Ql`} value={c.ql} onChange={(ql) => setC({ ql })} title="Leakage: lower means a leakier chamber" />
        <Num label={`${label} Qa`} value={c.qa} onChange={(qa) => setC({ qa })} title="Absorption: lower means more stuffing" />
        {port && <Num label={`${label} Qp`} value={c.qp} onChange={(qp) => setC({ qp })} title="Port friction: lower means a lossier port" />}
      </>
    );
  };
  return (
    <>
      <h3>Box losses</h3>
      <div className="fields">
        <Select<"shared" | "own"> help="Use the box losses from Settings for both chambers, or set leakage, absorption and port loss per chamber (like WinISD)."
          label="Losses"
          value={l ? "own" : "shared"}
          options={[
            { value: "shared", text: `Same as Settings (Ql ${p.shared.ql}, Qa ${p.shared.qa}, Qp ${p.shared.qp})` },
            { value: "own", text: "Per chamber" },
          ]}
          onChange={(v) => p.onChange(v === "own" ? bandpassLossesFrom(p.shared) : null)}
        />
      </div>
      {l && (
        <>
          <div className="fields">
            {chamber("front", "Front", p.frontPort)}
            {chamber("rear", "Rear", p.rearPort === true)}
            <Num
              label="Baffle Q"
              value={l.qicl}
              onChange={(qicl) => p.onChange({ ...l, qicl })}
              title="Leakage between the chambers, around the driver and through the baffle (WinISD's Qiclfr)"
            />
          </div>
          <p className="hint">
            Q values at each chamber's tuning: lower means more loss. Stuffing one chamber lowers its Qa; a leaky rear
            chamber lowers its Ql. Baffle Q is the leak between the chambers, around the driver and through the baffle (WinISD's default 100).
          </p>
        </>
      )}
    </>
  );
}

function BandpassBody(p: CommonProps<BandpassDesign> & { portCtx: PortContext; db: DbIndex | null; losses: ChamberLosses }) {
  const b = p.design;
  const set = (patch: Partial<BandpassDesign>) => p.onChange({ ...b, ...patch });
  const rearOpen = b.order !== "4";
  const into = b.order === "6s" ? "into the front chamber" : "to the outside";
  return (
    <>
      <div className="fields">
        <Select help="4th order: sealed rear, ported front. 6th order: both chambers vented (parallel to the outside, or series through the front)." label="Type" value={b.order} options={BP_ORDERS} onChange={(order) => set({ order })} />
        <VbField label="Rear Vb" vb_l={p.vb_l} value={b.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        <Num help="Air volume of the front chamber (the one the cone fires into)." label="Front Vb" q="vol" value={b.frontVb_l} onChange={(frontVb_l) => set({ frontVb_l })} />
      </div>
      <h3>Front chamber (to the outside)</h3>
      <div className="fields">
        <Select help="How this chamber opens: through a port, or through passive radiators." label="Opening" value={b.frontOpening} options={OPENINGS} onChange={(frontOpening) => set({ frontOpening })} />
      </div>
      {b.frontOpening === "port" ? (
        <>
          <PortEditor port={b.front} vb_l={b.frontVb_l} air={p.air} onChange={(front) => set({ front })} />
          <PortChecks v={b.front} vb_l={b.frontVb_l} air={p.air} ctx={{ portVelocity: p.portCtx.portVelocity, internalMax_cm: null }} />
        </>
      ) : (
        <ChamberPrs
          groups={b.frontPrs}
          vb_l={b.frontVb_l}
          air={p.air}
          target={b.front.targetFb}
          db={p.db}
          onTarget={(targetFb) => set({ front: { ...b.front, targetFb } })}
          onChange={(frontPrs) => set({ frontPrs })}
        />
      )}
      {rearOpen && (
        <>
          <h3>Rear chamber ({into})</h3>
          <div className="fields">
            <Select help="How this chamber opens: through a port, or through passive radiators." label="Opening" value={b.rearOpening} options={OPENINGS} onChange={(rearOpening) => set({ rearOpening })} />
          </div>
          {b.rearOpening === "port" ? (
            <>
              <PortEditor port={b.rear} vb_l={p.vb_l} air={p.air} onChange={(rear) => set({ rear })} />
              <PortChecks
                v={b.rear}
                vb_l={p.vb_l}
                air={p.air}
                ctx={{ portVelocity: p.portCtx.rearPortVelocity, internalMax_cm: p.portCtx.internalMax_cm }}
              />
            </>
          ) : (
            <ChamberPrs
              groups={b.rearPrs}
              vb_l={p.vb_l}
              air={p.air}
              target={b.rear.targetFb}
              db={p.db}
              onTarget={(targetFb) => set({ rear: { ...b.rear, targetFb } })}
              onChange={(rearPrs) => set({ rearPrs })}
            />
          )}
        </>
      )}
      <p className="hint">
        The driver sits in the wall between the chambers{rearOpen ? "" : ", firing into the front chamber"}. All the sound
        comes out of the {rearOpen && b.order === "6p" ? "two chambers' openings" : "front chamber's opening"}, so expect a
        band-limited response.
        {(b.frontOpening === "pr" || (rearOpen && b.rearOpening === "pr")) &&
          " Passive radiators replace a port's air mass with a cone: no port noise, and a small box can tune low."}
        {p.linked && " The volume calculator feeds the rear chamber."}
      </p>
      <BandpassLossesEditor
        losses={b.losses}
        shared={p.losses}
        frontPort={b.frontOpening === "port"}
        rearPort={rearOpen ? b.rearOpening === "port" : null}
        onChange={(losses) => set({ losses })}
      />
    </>
  );
}

export function DesignCard(props: {
  design: DesignState;
  color: string;
  vb_l: number;
  linked: boolean;
  canDelete: boolean;
  db: DbIndex | null;
  air: Air;
  align: AlignmentDriver | null;
  drivers: number;
  portCtx: PortContext;
  /** Box losses from Settings (a bandpass can override them per chamber). */
  losses: ChamberLosses;
  /** Open the volume calculator for this design (linking it). */
  onDimensions: () => void;
  /** For the passive radiator finder. */
  finder: FinderContext;
  /** A finder result applied to a PR design (an undoable step). */
  onFound: (d: DesignState, patch: Partial<PrDesign>, summary: string, physical?: PrPhysical) => void;
  /** Stop taking the volume from the calculator (keeping the current volume). */
  onUnlink: () => void;
  onChange: (d: DesignState) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPrPhysical: (x: PrPhysical) => void;
  /** Transmission lines: simulated tuning. */
  lineFb?: number | null;
  /** Transmission lines: replace the driver with one read from a Hornresp record. */
  onImportDriver?: (x: ImportedDriver) => void;
  /** Transmission lines: all the drivers' displacement (L) and the wall thickness (mm). */
  driverDisp_l?: number;
  wall_mm?: number;
  /** Several drivers: which one this design uses (absent when there's only driver A). */
  driverChoice?: { value: string; options: { id: string; name: string }[]; onChange: (id: string) => void };
}) {
  const d = props.design;
  const common = {
    color: props.color,
    vb_l: props.vb_l,
    linked: props.linked,
    air: props.air,
    align: props.align,
    drivers: props.drivers,
  };
  return (
    <DesignShell
      design={d}
      color={props.color}
      canDelete={props.canDelete}
      onChange={(patch) => props.onChange({ ...d, ...patch } as DesignState)}
      onDuplicate={props.onDuplicate}
      onDelete={props.onDelete}
      driverTag={props.driverChoice?.value}
    >
      {props.driverChoice && (
        <div className="fields design-driver">
          <Select<string>
            label="Driver"
            value={props.driverChoice.value}
            options={props.driverChoice.options.map((o) => ({ value: o.id, text: `${o.id}: ${o.name}` }))}
            help="Which driver this design uses (drivers A–D are set up on the Driver tab). Duplicate a design and give the copy another driver to compare them in the same box."
            onChange={props.driverChoice.onChange}
          />
        </div>
      )}
      {d.kind === "sealed" && <SealedBody {...common} design={d} onChange={props.onChange} />}
      {d.kind === "vented" && <VentedBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} />}
      {d.kind === "bandpass" && (
        <BandpassBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} db={props.db} losses={props.losses} />
      )}
      {d.kind === "line" && (
        <LineBody
          design={d}
          onChange={props.onChange}
          driver={props.finder.driver}
          sim={props.finder.sim}
          align={props.align}
          drivers={props.drivers}
          fb={props.lineFb ?? null}
          exitVelocity={props.portCtx.portVelocity}
          compression={props.portCtx.portCompression ?? null}
          driverDisp_l={props.driverDisp_l ?? 0}
          wall_mm={props.wall_mm ?? 18}
          onImportDriver={props.onImportDriver}
        />
      )}
      {d.kind === "pr" && (
        <PrBody
          {...common}
          design={d}
          onChange={props.onChange}
          db={props.db}
          onPrPhysical={props.onPrPhysical}
          finder={props.finder}
          onFound={(patch, summary, physical) => props.onFound(d, patch, summary, physical)}
        />
      )}
      {d.kind !== "line" && <p className="dims-link hint">
        {props.linked ? (
          <>
            {d.kind === "bandpass" ? "Rear chamber volume" : "Box volume"} comes from the volume calculator ·{" "}
            <button className="link" onClick={props.onDimensions}>
              Edit dimensions
            </button>{" "}
            ·{" "}
            <button className="link" onClick={props.onUnlink}>
              Unlink
            </button>
          </>
        ) : (
          <button className="link" onClick={props.onDimensions}>
            {d.kind === "bandpass" ? "Size the rear chamber from dimensions…" : "Size from dimensions…"}
          </button>
        )}
      </p>}
    </DesignShell>
  );
}

export function AddDesign(props: { disabled: boolean; onAdd: (k: DesignKind) => void }) {
  return (
    <div className="add-design">
      <span>Add design:</span>
      {(["sealed", "vented", "pr", "bandpass", "line"] as const).map((k) => (
        <button key={k} className="secondary" disabled={props.disabled} onClick={() => props.onAdd(k)}>
          + {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
