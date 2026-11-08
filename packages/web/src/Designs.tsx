import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkle } from "./Logo.tsx";
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
import { Fixed, Num, Select, useNarrow } from "./components.tsx";
import { PassiveRadiatorBrowser } from "./Library.tsx";
import { loadPrChoice, type DbIndex } from "./library.ts";
import { PrTuning } from "./PrTuning.tsx";
import { LineBody, type ImportedDriver } from "./LineBody.tsx";

/** What the volume calculator and build sheet need from a chosen PR. */
export interface PrPhysical {
  displacement_l?: number;
  cutout_mm?: number;
}
import { KIND_COLORS, KIND_LABEL, PORT_LIMIT, portOf, portRoom_cm } from "./sim.ts";
import { useUnits } from "./units.ts";
import { bandpassLossesFrom, NO_LOSS, qText } from "./state.ts";
import { alignmentHelp, moreVentedFor, prTuning, withPreset, ventedAlignmentFor, ventedPresetPatch, type PortPicker } from "./presets.ts";
import { PrFinder, type FinderContext } from "./PrFinder.tsx";
import { StuffingFields, type StuffingFitContext } from "./StuffingFields.tsx";
import { stuffFactor, stuffable, stuffingEffect, type StuffableKind } from "./stuffing.ts";

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
/** Up to one decimal, without a trailing ".0" (330, 18, 12.5). */
const short = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "–");

interface CommonProps<D extends DesignState> {
  design: D;
  color: string;
  /** The volume the box acts as (the calculator's when linked, scaled by stuffing): for tuning and presets. */
  vb_l: number;
  /** Net volume as built (the calculator's when linked). */
  built_l: number;
  /** How many times bigger stuffing makes the box act (1 = none): presets divide their volume by it. */
  fill: number;
  linked: boolean;
  air: Air;
  /** Solved driver for alignment presets; null while parameters are incomplete. */
  align: AlignmentDriver | null;
  drivers: number;
  onChange: (d: D) => void;
}

/** The volume to build for a preset's (acting) volume, to 0.1 L. */
const toBuilt = (acting: number, fill: number) => Math.round((acting / fill) * 10) / 10;

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

/** A folded card's one-line summary: its size and tuning, F3 and how many limits it's over. */
export interface DesignGlance {
  vb_l: number;
  fb?: number;
  f3: number | null;
  over: number;
}

/** Card shell shared by all design types: colour, editable name, on/off, duplicate, delete, fold. */
function DesignShell(props: {
  design: DesignState;
  color: string;
  canDelete: boolean;
  folded: boolean;
  onFold: (folded: boolean) => void;
  glance?: DesignGlance;
  onChange: (patch: Partial<DesignState>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const d = props.design;
  const { fmt } = useUnits();
  const g = props.glance;
  const open = d.on && !props.folded;
  return (
    <section className={`card design${d.on ? "" : " off"}${props.folded ? " folded" : ""}`} data-design={d.id}>
      <div className="design-head">
        {d.on && (
          <button
            type="button"
            className="icon fold"
            aria-expanded={!props.folded}
            aria-label={props.folded ? `Open ${d.name}` : `Fold ${d.name}`}
            title={props.folded ? "Open this design" : "Fold to one line"}
            onClick={() => props.onFold(!props.folded)}
          >
            {props.folded ? "▸" : "▾"}
          </button>
        )}
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
        <button
          type="button"
          className={`icon eye${d.on ? " on" : ""}`}
          aria-pressed={d.on}
          aria-label={`Show ${d.name} on the charts`}
          title={d.on ? "Showing on the charts: tap to hide" : "Hidden from the charts: tap to show"}
          onClick={() => props.onChange({ on: !d.on })}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" fill={d.on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
            {!d.on && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          </svg>
        </button>
        <button className="icon" title="Duplicate this design" aria-label={`Duplicate ${d.name}`} onClick={props.onDuplicate}>
          ⧉
        </button>
        {props.canDelete && (
          <button className="icon" title="Delete this design" aria-label={`Delete ${d.name}`} onClick={props.onDelete}>
            ✕
          </button>
        )}
      </div>
      {d.on && props.folded && g && (
        <button type="button" className="design-glance" onClick={() => props.onFold(false)} title="Open this design">
          <span>
            {fmt(g.vb_l, "vol", 1)}
            {g.fb ? ` · Fb ${g.fb.toFixed(1)} Hz` : ""}
          </span>
          <span className="muted">{g.f3 === null ? "F3 –" : `F3 ${g.f3.toFixed(0)} Hz`}</span>
          {g.over > 0 ? <span className="over">⚠ {g.over} over</span> : <span className="ok">OK</span>}
        </button>
      )}
      {open && props.children}
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
        <Sparkle />
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
    p.onChange({ ...p.design, vb_l: toBuilt(vb, p.fill), ...withPreset(p.design.name, `Qtc ${qtc}`) });
  };
  return (
    <>
      <div className="fields">
        <VbField vb_l={p.built_l} value={p.design.vb_l} linked={p.linked} onChange={(vb_l) => p.onChange({ ...p.design, vb_l })} />
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
  /** The chuffing line (displayed convention) and whether speeds are shown as RMS. */
  portLimit?: number;
  rms?: boolean;
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
  ctx: Pick<PortContext, "portVelocity" | "internalMax_cm" | "portVelocityAt" | "portCompression" | "drive" | "portLimit">;
}) {
  const { v, vb_l, air, ctx } = props;
  const { fmt } = useUnits();
  const port = portOf(v);
  const leff = portEffectiveLength(port); // m
  const pipe = air.c / (2 * leff);
  const notes: CheckNote[] = [];
  const sizeField = v.shape === "round" ? "Port Ø" : "Width";

  // Will it fit? Keep at least one port diameter (or slot height) clear of the opposite wall.
  const clearance = v.shape === "round" ? v.diameter_cm : v.slotHeight_cm;
  const cube = Math.cbrt(vb_l * 1000);
  const room = portRoom_cm(vb_l, clearance, ctx.internalMax_cm);
  if (v.length_cm > room) {
    notes.push({
      warn: true,
      chip: "Port too long to fit",
      text:
        `The port is ${fmt(v.length_cm, "len")} long, but ${ctx.internalMax_cm ? "this box" : "a cube-shaped box of this volume"} ` +
        `only has room for about ${fmt(Math.max(0, room), "len")} in a straight line. Use a bent (L-shaped) port, a slot along a wall, or a bigger port area with a shorter length.`,
      fix: "Length",
    });
  }

  // Chuffing: air speed scales with 1/area, so suggest the area that brings it under the line.
  const limit = ctx.portLimit ?? PORT_LIMIT;
  if (ctx.portVelocity !== null && ctx.portVelocity > limit) {
    const k = ctx.portVelocity / limit;
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
        : `Port air speed reaches ${ctx.portVelocity.toFixed(1)} m/s. To stay under ${limit} m/s at this power: about ${size} ` +
          `(length ≈ ${fmt(newLen, "len")} for the same tuning)${ports > v.count ? `, or ${ports} ports of the current size` : ""}` +
          (v.shape === "round" && !(v.flare_cm! > 0) ? `. Flared ends also help a lot: try a flare radius of about ${fmt(v.diameter_cm / 4, "len")}.` : "."),
      fix: sizeField,
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
      fix: sizeField,
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
    fix: pipe < 300 || coincide ? "Length" : undefined,
  });

  return <CheckChips notes={notes} />;
}

/** A check on a design: a chip, its explanation, and the field that fixes it (by its label). */
interface CheckNote {
  warn: boolean;
  chip: string;
  text: string;
  fix?: string;
}

/**
 * Puts the cursor in the field with this label: the nearest one before `from` in the same
 * card (a bandpass card has two "Port Ø" fields, one per chamber).
 */
function focusField(from: HTMLElement, label: string) {
  let el: Element | null = from;
  while (el && !el.classList.contains("card")) {
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const spans = [...sib.querySelectorAll("label > span:first-child")].filter((x) => x.textContent === label);
      const input = spans.at(-1)?.parentElement?.querySelector("input");
      if (input) {
        input.scrollIntoView({ block: "center", behavior: "smooth" });
        input.focus({ preventScroll: true });
        input.select();
        return;
      }
    }
    el = el.parentElement;
  }
}

/**
 * Checks as one-line chips (amber = a problem, plain = information); tapping a chip
 * opens its explanation and advice underneath, with a button to the field that fixes it.
 */
function CheckChips({ notes }: { notes: CheckNote[] }) {
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
      {shown && (
        <div className={shown.warn ? "warn check-detail" : "hint check-detail"}>
          <p>{shown.text}</p>
          {shown.fix && (
            <button type="button" className="secondary check-fix" onClick={(e) => focusField(e.currentTarget.closest(".checks") as HTMLElement, shown.fix!)}>
              Change {shown.fix} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VentedBody(p: CommonProps<VentedDesign> & { portCtx: PortContext; pickPort?: PortPicker }) {
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

  /**
   * A vented alignment's box and tuning. This port keeps its size and gets the length for it
   * when that fits the box straight (the "Port too long to fit" rule); otherwise the port is
   * changed to one that fits, as Size all boxes picks it.
   */
  const applyAlignment = (a: { name: string; vb_l: number; fb: number }) => {
    const out = ventedPresetPatch(v, a, p.fill, p.air, p.portCtx.internalMax_cm, p.pickPort);
    setMsg(out.msg);
    if (out.patch) set(out.patch);
  };

  return (
    <>
      {/* Presets first: you usually pick one, then fine-tune the numbers below. */}
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
            applyAlignment(a);
          }}
        >
          {alignLabel(p.align, p.drivers)}
        </button>
        {!p.linked &&
          p.align &&
          moreVentedFor(p.align, p.drivers).map((a) => (
            <button key={a.name} className="chip" title={alignmentHelp(a)} onClick={() => applyAlignment(a)}>
              {a.name}
            </button>
          ))}
      </Presets>
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
        <VbField vb_l={p.built_l} value={v.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
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

  /** A vented alignment's box and tuning, reached with added mass on these PRs. */
  const applyPrAlignment = (a: { name: string; vb_l: number; fb: number }) => {
    const add = t.massFor(a.fb, a.vb_l);
    if (add === Infinity) return setMsg(unreachable(Math.round(a.fb * 10) / 10));
    if (add < 0) {
      setMsg(`${a.name} wants ${a.vb_l.toFixed(1)} L at ${a.fb.toFixed(1)} Hz, but these PRs tune lower than that even with no added mass. Try a lighter or stiffer PR, or fewer PRs.`);
      return;
    }
    setMsg("");
    set({
      vb_l: toBuilt(a.vb_l, p.fill),
      targetFb: Math.round(a.fb * 10) / 10,
      addedMass_g: Math.round(add),
      ...withPreset(pr.name, a.name),
    });
  };

  return (
    <>
      {/* Presets and Best tuning first: you usually pick one, then fine-tune the numbers below. */}
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
            applyPrAlignment(a);
          }}
        >
          {alignLabel(p.align, p.drivers)}
        </button>
        {!p.linked &&
          p.align &&
          moreVentedFor(p.align, p.drivers).map((a) => (
            <button key={a.name} className="chip" title={`${alignmentHelp(a)} Reached with added mass.`} onClick={() => applyPrAlignment(a)}>
              {a.name}
            </button>
          ))}
      </Presets>
      <div className="row finder-row-button">
        <PrTuning ctx={p.finder} design={pr} vb_l={p.vb_l} linked={p.linked} onApply={(patch, summary) => p.onFound(patch, summary)} />
      </div>
      {/* The box: its volume, how many PRs and the mass on each, and the tuning they give. */}
      <div className="fields">
        <VbField vb_l={p.built_l} value={pr.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
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
      </div>
      <TuneRow
        target={pr.targetFb}
        onTarget={(x) => set({ targetFb: x })}
        button="Set added mass"
        title={t.mixed ? "Sets the added mass on group 1's PRs; the other groups stay as they are" : undefined}
        onApply={tune}
      />
      {msg && <p className="warn">{msg}</p>}
      <p className="hint">
        Added mass is per passive radiator.
        {t.mixed &&
          " PRs and Added mass here are group 1's. With mixed PRs each group gets its own excursion curve and Xmax line; the tuning helpers adjust group 1's added mass."}
      </p>

      {/* Which passive radiator: the model and its datasheet parameters. */}
      <PrCard title={t.mixed ? "Passive radiator group 1" : "Passive radiator"} name={pr.prName} params={pr.params} onParams={setP}>
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
        </div>
      </PrCard>
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
      <div className="add-design pr-add">
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
    </>
  );
}

/**
 * One kind of passive radiator: its name, how to pick it (children), optional per-group fields,
 * and its datasheet parameters, folded on phones (they come from the database and rarely change).
 */
function PrCard(props: {
  title: string;
  name: string;
  params: PrDesign["params"];
  onParams: (patch: Partial<PrDesign["params"]>) => void;
  onRemove?: () => void;
  /** Fields that belong to this group in the box (count, added mass). */
  fields?: ReactNode;
  children?: ReactNode;
}) {
  const narrow = useNarrow();
  const q = props.params;
  return (
    <section className="pr-card" aria-label={props.title}>
      <div className="pr-card-head">
        <h3>{props.title}</h3>
        {props.onRemove && (
          <button type="button" className="icon" aria-label={`Remove ${props.title}`} title="Remove this group" onClick={props.onRemove}>
            ×
          </button>
        )}
      </div>
      {props.children}
      <p className="pr-name">{props.name}</p>
      {props.fields && <div className="fields">{props.fields}</div>}
      <details className="pr-specs" open={!narrow}>
        <summary>
          Parameters
          <span className="pr-specs-sum">
            Sd {short(q.sd_cm2)} cm² · Xmax {short(q.xmax_mm)} mm
          </span>
        </summary>
        <div className="fields">
          <PrParamFields params={q} onChange={props.onParams} />
        </div>
        <p className="hint">From the datasheet. PR Mms is the bare moving mass, without added mass.</p>
      </details>
    </section>
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
    <PrCard
      title={props.title ?? "Passive radiator"}
      name={g.prName}
      params={g.params}
      onParams={(patch) => props.onChange({ params: { ...g.params, ...patch } })}
      onRemove={props.onRemove}
      fields={
        <>
          <Num help="Number of identical passive radiators in this group." label="PRs" value={g.count} onChange={(v) => props.onChange({ count: Math.max(1, Math.round(v)) })} />
          <Num help="Mass glued onto each PR cone in this group (grams). More mass tunes lower." label="Added mass" unit="g" value={g.addedMass_g} min={0} onChange={(v) => props.onChange({ addedMass_g: v })} />
        </>
      }
    >
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
    </PrCard>
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
      <div className="add-design pr-add">
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
          <>
            <Num help="Inside diameter of this chamber's port tube." label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
            <Num
              label="Flare r"
              q="len"
              value={v.flare_cm ?? 0}
              min={0}
              title="Round-over radius at both ends (0 = a straight tube). About a quarter of the diameter is a good start: the air speed is then judged at the wider mouths."
              onChange={(x) => set({ flare_cm: x })}
            />
          </>
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
        <Num label={`${label} Ql`} value={c.ql} none={NO_LOSS} onChange={(ql) => setC({ ql })} title="Leakage: lower means a leakier chamber (clear it for none)" />
        <Num label={`${label} Qa`} value={c.qa} none={NO_LOSS} onChange={(qa) => setC({ qa })} title="Absorption: lower means more stuffing (clear it for none)" />
        {port && <Num label={`${label} Qp`} value={c.qp} none={NO_LOSS} onChange={(qp) => setC({ qp })} title="Port friction: lower means a lossier port (clear it for none)" />}
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
            { value: "shared", text: `Same as Settings (Ql ${qText(p.shared.ql)}, Qa ${qText(p.shared.qa)}, Qp ${qText(p.shared.qp)})` },
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
              none={NO_LOSS}
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

function BandpassBody(p: CommonProps<BandpassDesign> & { portCtx: PortContext; db: DbIndex | null; losses: ChamberLosses; onSize?: () => void }) {
  const b = p.design;
  const set = (patch: Partial<BandpassDesign>) => p.onChange({ ...b, ...patch });
  const rearOpen = b.order !== "4";
  const into = b.order === "6s" ? "into the front chamber" : "to the outside";
  return (
    <>
      <div className="fields">
        <Select help="4th order: sealed rear, ported front. 6th order: both chambers vented (parallel to the outside, or series through the front)." label="Type" value={b.order} options={BP_ORDERS} onChange={(order) => set({ order })} />
        <VbField label="Rear Vb" vb_l={p.built_l} value={b.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        <Num help="Air volume of the front chamber (the one the cone fires into)." label="Front Vb" q="vol" value={b.frontVb_l} onChange={(frontVb_l) => set({ frontVb_l })} />
      </div>
      {p.onSize && b.order !== "6s" && (
        <div className="size-all">
          <button type="button" className="secondary" onClick={p.onSize} disabled={p.linked}>
            <Sparkle />
            Size for a flat band
          </button>
          <span className="hint">
            {p.linked
              ? "The volume calculator sets the rear chamber: unlink it to size both chambers."
              : "Both chambers, their ports and tunings for the lowest flat band (up to at least 80 Hz) in the same total volume. Undo takes it back."}
          </span>
        </div>
      )}
      <h3>Front chamber (to the outside)</h3>
      <div className="fields">
        <Select help="How this chamber opens: through a port, or through passive radiators." label="Opening" value={b.frontOpening} options={OPENINGS} onChange={(frontOpening) => set({ frontOpening })} />
      </div>
      {b.frontOpening === "port" ? (
        <>
          <PortEditor port={b.front} vb_l={b.frontVb_l} air={p.air} onChange={(front) => set({ front })} />
          <PortChecks
            v={b.front}
            vb_l={b.frontVb_l}
            air={p.air}
            ctx={{ portVelocity: p.portCtx.portVelocity, internalMax_cm: null, portLimit: p.portCtx.portLimit, portVelocityAt: p.portCtx.portVelocityAt }}
          />
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
                ctx={{ portVelocity: p.portCtx.rearPortVelocity, internalMax_cm: p.portCtx.internalMax_cm, portLimit: p.portCtx.portLimit }}
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
  /** The volume it acts as (with stuffing) and the net volume as built. */
  vb_l: number;
  built_l: number;
  linked: boolean;
  canDelete: boolean;
  db: DbIndex | null;
  air: Air;
  align: AlignmentDriver | null;
  drivers: number;
  portCtx: PortContext;
  /** Ported boxes: a port that fits when a preset's box is too small for the current one. */
  pickPort?: PortPicker;
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
  /** Fitting stuffing to a measured impedance sweep (sealed, ported and PR designs). */
  fit?: StuffingFitContext;
  /** Transmission lines: simulated tuning. */
  lineFb?: number | null;
  /** Bandpass: re-size for the driver within its present volume. */
  onSizeBandpass?: () => void;
  /** Transmission lines: replace the driver with one read from a Hornresp record. */
  onImportDriver?: (x: ImportedDriver) => void;
  /** Transmission lines: all the drivers' displacement (L) and the wall thickness (mm). */
  driverDisp_l?: number;
  wall_mm?: number;
  /** Folded to its header and a one-line summary (phones and desktop alike). */
  folded?: boolean;
  onFold?: (folded: boolean) => void;
  glance?: DesignGlance;
}) {
  const d = props.design;
  const fill = stuffFactor(d);
  const common = {
    color: props.color,
    vb_l: props.vb_l,
    built_l: props.built_l,
    fill,
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
      folded={props.folded ?? false}
      onFold={props.onFold ?? (() => undefined)}
      glance={props.glance}
      onChange={(patch) => props.onChange({ ...d, ...patch } as DesignState)}
      onDuplicate={props.onDuplicate}
      onDelete={props.onDelete}
    >
      {d.kind === "sealed" && <SealedBody {...common} design={d} onChange={props.onChange} />}
      {d.kind === "vented" && <VentedBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} pickPort={props.pickPort} />}
      {d.kind === "bandpass" && (
        <BandpassBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} db={props.db} losses={props.losses} onSize={props.onSizeBandpass} />
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
          portLimit={props.portCtx.portLimit ?? PORT_LIMIT}
          rms={props.portCtx.rms ?? false}
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
          finder={{ ...props.finder, losses: { ...props.finder.losses, qa: stuffingEffect(d.stuffing, "pr").qa ?? props.finder.losses.qa } }}
          onFound={(patch, summary, physical) =>
            // The finder and tuning work with the volume the box acts as: build the stuffed volume.
            props.onFound(d, patch.vb_l !== undefined ? { ...patch, vb_l: toBuilt(patch.vb_l, fill) } : patch, summary, physical)
          }
        />
      )}
      {stuffable(d.kind) && (
        <StuffingFields design={d as DesignState & { kind: StuffableKind }} built_l={props.built_l} air={props.air} fit={props.fit} onChange={props.onChange} />
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

const ADD_KINDS: { kind: DesignKind; what: string }[] = [
  { kind: "sealed", what: "Simplest: tight bass with a gentle roll-off" },
  { kind: "vented", what: "Deeper bass from a port, tuned to a frequency" },
  { kind: "pr", what: "Like ported, with passive radiators instead of a port: no chuffing" },
  { kind: "bandpass", what: "Driver between two chambers: loud over a narrow band" },
  { kind: "line", what: "A folded line or horn behind the driver" },
];

/**
 * One "+ Add a box" button: a menu of the box types, each with the colour its new box will get.
 * Choosing one adds it (the caller scrolls to it) and closes the menu.
 */
export function AddBoxMenu(props: { designs: DesignState[]; max: number; onAdd: (k: DesignKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const full = props.designs.length >= props.max;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    addEventListener("mousedown", close);
    addEventListener("touchstart", close);
    addEventListener("keydown", onKey);
    // Focus the first choice, so the keyboard can pick one straight away.
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      removeEventListener("mousedown", close);
      removeEventListener("touchstart", close);
      removeEventListener("keydown", onKey);
    };
  }, [open]);
  // The colour the next box of each kind gets (the same rule as the charts: the kind's next shade).
  const nextColor = (k: DesignKind) => {
    const shades = KIND_COLORS[k];
    return shades[props.designs.filter((d) => d.kind === k).length % shades.length]!;
  };
  return (
    <div className="share add-box" ref={ref}>
      <button
        type="button"
        className="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={full}
        title={full ? `Up to ${props.max} designs: delete one to add another` : "Add a box design"}
        onClick={() => setOpen(!open)}
      >
        + Add a box
      </button>
      {open && (
        <div className="share-menu menu-left add-box-menu" role="menu" aria-label="Box type">
          {ADD_KINDS.map(({ kind, what }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                props.onAdd(kind);
              }}
            >
              <span className="swatch" style={{ background: nextColor(kind) }} aria-hidden="true" />
              <span className="add-box-text">
                <b>{KIND_LABEL[kind]}</b>
                <span className="hint">{what}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
