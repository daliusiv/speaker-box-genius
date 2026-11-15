import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { Fixed, KitFields, Num, Select } from "./components.tsx";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./iconPaths.ts";
import { Button, Chip, collectHelp, Disclosure, FieldRow, HelpSheet, InlineText, Menu, MenuItemButton, MiniResponse, Section, Segmented, Stepper, type HelpEntry, type MenuItem } from "./ui/index.ts";
import { PassiveRadiatorBrowser } from "./Library.tsx";
import { loadPrChoice, type DbIndex } from "./library.ts";
import { PrTuning } from "./PrTuning.tsx";
import { LineBody, type ImportedDriver } from "./LineBody.tsx";

/** What the volume calculator and build sheet need from a chosen PR. */
export interface PrPhysical {
  displacement_l?: number;
  cutout_mm?: number;
}
import { KIND_COLORS, KIND_LABEL, PORT_LIMIT, portOf, portRoom_cm, type PresetPreview } from "./sim.ts";
import { useUnits } from "./units.ts";
import { bandpassLossesFrom, NO_LOSS, qText } from "./state.ts";
import { alignmentHelp, flatPresetHelp, moreVentedFor, prTuning, withPreset, ventedAlignmentFor, ventedPresetPatch, type PortPicker } from "./presets.ts";
import { SLOT_WALL_K, slotTuningRange } from "./ports.ts";
import { PrFinder, type FinderContext } from "./PrFinder.tsx";
import { StuffingFields, type StuffingFitContext } from "./StuffingFields.tsx";
import { stuffFactor, stuffable, stuffingEffect, type StuffableKind, type Stuffing } from "./stuffing.ts";

/** The preset chip's label: which flat vented alignment this driver gets. */
const alignLabel = (a: AlignmentDriver | null, drivers: number) => {
  const v = a && ventedAlignmentFor(a, drivers);
  return v ? v.name : a?.style === "textbook" ? "QB3 / B4" : "QB3";
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
  /** Port end correction in use (Settings → Ports). */
  ec: number;
  /** Solved driver for alignment presets; null while parameters are incomplete. */
  align: AlignmentDriver | null;
  drivers: number;
  /** The volume calculator's outside depth when it's linked to this box (a port on the back is that far from the cone). */
  backDepth_cm: number | null;
  /** A design's response for the Preset picker's curves (null while the driver is incomplete). */
  preview?: (d: DesignState) => PresetPreview | null;
  onChange: (d: D) => void;
}

const PATH_HELP =
  "In front of the box (Settings → SPL), a port further away arrives later and adds up differently with the cone; from radiated power it's how far apart the two are, as Hornresp's Acoustic Path Length. It shows above about c / (4 × distance): 20 cm → about 430 Hz on axis, a little lower in phase and group delay.";

/** Where a box's port or passive radiators sit relative to the cone: next to it, on the back, or a set distance away. */
function VentPosition(p: { at: VentedDesign["ventAt"]; distance_cm: number | undefined; what: "port" | "PRs"; backDepth_cm: number | null; onChange: (patch: Pick<VentedDesign, "ventAt" | "ventDistance_cm">) => void }) {
  const value = p.at ?? "front";
  const back = p.backDepth_cm !== null ? ` (${Math.round(p.backDepth_cm)} cm further)` : "";
  return (
    <>
      <Select<"front" | "back" | "custom">
        help={`Where the ${p.what} sit${p.what === "port" ? "s" : ""} relative to the driver. ${PATH_HELP}`}
        label="Position"
        value={value}
        options={[
          { value: "front", text: "Beside driver" },
          { value: "back", text: `On the back${back}` },
          { value: "custom", text: "Further away by…" },
        ]}
        onChange={(at) => p.onChange(at === "front" ? { ventAt: undefined } : at === "custom" ? { ventAt: at, ventDistance_cm: p.distance_cm ?? (p.backDepth_cm !== null ? Math.round(p.backDepth_cm) : 30) } : { ventAt: at })}
      />
      {value === "custom" && (
        <Num label="Distance" q="len" value={p.distance_cm ?? 0} min={0} title={`How far the ${p.what} ${p.what === "port" ? "is" : "are"} from the cone. ${PATH_HELP}`} onChange={(x) => p.onChange({ ventAt: "custom", ventDistance_cm: x })} />
      )}
      {value === "back" && p.backDepth_cm === null && <p className="hint full">On the back: link the volume calculator (box or wedge) to this design for its depth, or use “Further away by…”. Until then it counts as next to the driver.</p>}
    </>
  );
}

/** The volume to build for a preset's (acting) volume, to 0.1 L. */
const toBuilt = (acting: number, fill: number) => Math.round((acting / fill) * 10) / 10;

const LINKED_NOTE = "Presets change the box volume, so they're off while the volume calculator feeds this design.";

/** One preset: its name, what it is, the box it gives (null: it can't be reached), and how to apply it. */
interface PresetOption {
  name: string;
  help: string;
  design: DesignState | null;
  /** Its tuning (ported and PR boxes). */
  fb?: number;
  apply: () => void;
}

/** Each preset in a line, for the picker (the long texts stay in the row's help). */
const PRESET_LINE: Record<string, string> = {
  "Qtc 0.5": "Critically damped: best transients, gentle roll-off",
  "Qtc 0.577": "Bessel: flattest group delay",
  "Qtc 0.707": "Butterworth: flattest response, smallest box for the extension",
  QB3: "Flat: the usual vented box for this driver",
  B4: "Butterworth: flat, the textbook vented box",
  Keele: "Flat, for drivers of Qts 0.38–0.6 (Keele)",
  SC4: "Sub-Chebyshev: about QB3's size, tuned lower, gentler roll-off",
  C4: "Chebyshev: a little ripple for a little more extension",
  SBB4: "Sub-boom box: tuned to Fs; gentle roll-off, good transients",
  BB4: "Boom box: tuned to Fs; a peak before the roll-off",
  SQB3: "Super QB3: QB3 carried past B4; a peak before the roll-off",
};
const lineOf = (o: PresetOption) => PRESET_LINE[o.name] ?? o.help.split(/(?<=[.:]) /)[0]!;

/**
 * The box's presets, first in the card: a picker that looks like a field, showing the one it was
 * last sized with ("Custom" after a hand edit). Its list gives each preset's box, F3, a line on what
 * it is and its response for this driver (worked out as the list opens).
 */
function PresetRow(props: { current?: string; options: PresetOption[]; disabled?: boolean; note?: string; color: string; preview?: (d: DesignState) => PresetPreview | null }) {
  const { fmt } = useUnits();
  const [previews, setPreviews] = useState<(PresetPreview | null)[]>([]);
  const known = props.options.some((o) => o.name === props.current);
  const help = props.note ?? props.options.map((o) => `${o.name}: ${o.help}`).join(" ");
  const off = props.disabled || props.options.length === 0;
  const items: MenuItem[] = props.options.map((o, i) => {
    const pv = previews[i];
    const nums = o.design ? [fmt(builtOf(o.design), "vol"), o.fb ? `${o.fb.toFixed(1)} Hz` : "", pv?.f3 ? `F3 ${pv.f3.toFixed(0)} Hz` : ""].filter(Boolean).join(" · ") : "Can't be reached";
    return {
      label: o.name,
      detail: nums,
      description: lineOf(o),
      checked: o.name === props.current,
      icon: pv ? <MiniResponse freq={pv.freq} db={pv.db} color={props.color} /> : <span className="ui-mini-response" aria-hidden="true" />,
      onSelect: o.apply,
    };
  });
  return (
    <FieldRow label="Preset" help={help}>
      {() => (
        <Menu
          label="Preset"
          field
          pinned
          align="end"
          className="bx-preset"
          value={known ? props.current : off && props.note ? "Off (linked)" : "Custom"}
          disabled={off}
          items={items}
          footer="Change Vb or the port by hand and it reads Custom."
          onOpen={() => setPreviews(props.options.map((o) => (o.design && props.preview ? props.preview(o.design) : null)))}
        />
      )}
    </FieldRow>
  );
}

/** A design's net volume as built (a bandpass's rear chamber). */
const builtOf = (d: DesignState) => ("vb_l" in d ? d.vb_l : 0);

/** A folded card's one-line summary: its size and tuning, F3 and how many limits it's over. */
export interface DesignGlance {
  vb_l: number;
  fb?: number;
  f3: number | null;
  over: number;
}

/**
 * What the head's subtitle says of an open box: its type, unless the name already says it
 * ("Ported 2" needs no "Ported" under it), and the preset it was last sized with.
 */
const kindLine = (d: DesignState) =>
  [d.name.toLowerCase().startsWith(KIND_LABEL[d.kind].toLowerCase()) ? null : KIND_LABEL[d.kind], d.preset].filter(Boolean).join(" · ");

/**
 * Card shell shared by all design types: fold, colour, editable name over a subtitle (the type
 * and preset, or a folded box's one-line summary), show on the charts, and a ⋯ menu.
 */
function DesignShell(props: {
  design: DesignState;
  color: string;
  canDelete: boolean;
  folded: boolean;
  onFold: (folded: boolean) => void;
  glance?: DesignGlance;
  linked: boolean;
  onChange: (patch: Partial<DesignState>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDimensions?: () => void;
  onUnlink?: () => void;
  children: ReactNode;
}) {
  const d = props.design;
  const { fmt } = useUnits();
  const g = props.glance;
  const open = d.on && !props.folded;
  const card = useRef<HTMLElement>(null);
  const [help, setHelp] = useState<HelpEntry[] | null>(null);
  const items: MenuItem[] = [
    { label: "Duplicate", icon: <Icon name="copy" />, onSelect: props.onDuplicate },
    ...(props.onDimensions
      ? [{ label: props.linked ? "Edit dimensions…" : d.kind === "bandpass" ? "Rear chamber from dimensions…" : "Size from dimensions…", icon: <Icon name="ruler" />, onSelect: props.onDimensions }]
      : []),
    ...(props.linked && props.onUnlink ? [{ label: "Unlink from dimensions", icon: <Icon name="unlink" />, onSelect: props.onUnlink }] : []),
    // The card's own fields (name, preset, volume, tuning); each row explains its own with its ⓘ.
    ...(open ? [{ label: "About these fields", icon: <Icon name="info" />, onSelect: () => setHelp(collectHelp(card.current, { skipRows: true })) }] : []),
    ...(props.canDelete ? [{ kind: "separator" as const }, { label: "Delete", icon: <Icon name="trash" />, onSelect: props.onDelete }] : []),
  ];
  return (
    <section ref={card} className="ui-card bx-card" data-design={d.id} data-kind={d.kind} data-off={d.on ? undefined : true}>
      <div className="bx-head">
        <Button
          variant="ghost"
          icon="chevronDown"
          className="bx-fold"
          label={props.folded ? `Open ${d.name}` : `Fold ${d.name}`}
          title={props.folded ? "Open this design" : "Fold to one line"}
          aria-expanded={open}
          disabled={!d.on}
          onClick={() => props.onFold(!props.folded)}
        />
        <span className="bx-swatch" style={{ background: props.color }} aria-hidden="true" />
        <div className="bx-name">
          <InlineText
            data-help-title="Design name"
            data-help="Name this design: it labels its curves on every chart. Duplicate a design to compare a variation side by side."
            value={d.name}
            aria-label="Design name"
            onChange={(e) => props.onChange({ name: e.currentTarget.value })}
          />
          {d.on && props.folded && g ? (
            <span className="bx-sub">
              {fmt(g.vb_l, "vol", 1)}
              {g.fb ? ` · Fb ${g.fb.toFixed(1)} Hz` : ""}
              {g.f3 === null ? " · F3 –" : ` · F3 ${g.f3.toFixed(0)} Hz`}
              {" · "}
              {g.over > 0 ? <span className="bx-over">⚠ {g.over} over</span> : <span className="bx-ok">OK</span>}
            </span>
          ) : (
            (kindLine(d) || !d.on) && <span className="bx-sub">{[kindLine(d), d.on ? "" : "Hidden from the charts"].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <Button
          variant="ghost"
          icon={d.on ? "eye" : "eyeOff"}
          className="bx-eye"
          label={`Show ${d.name} on the charts`}
          title={d.on ? "Showing on the charts: click to hide" : "Hidden from the charts: click to show"}
          aria-pressed={d.on}
          onClick={() => props.onChange({ on: !d.on })}
        />
        <Menu label={`More for ${d.name}`} icon="more" iconOnly align="end" items={items} />
      </div>
      {open && props.children}
      <HelpSheet open={help !== null} onClose={() => setHelp(null)} title={d.name || "This box"} icon={KIND_ICON[d.kind]} entries={help ?? []} />
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
    <>
      <hr className="bx-div" />
      <Num help="The tuning frequency you want. Press the button to size the port (or PR mass) for it." label="Tune to" unit="Hz" value={props.target} onChange={props.onTarget} />
      <div className="bx-actions">
        <Button variant="ghost" onClick={props.onApply} title={props.title}>
          <Sparkle />
          {props.button}
        </Button>
      </div>
    </>
  );
}

function SealedBody(p: CommonProps<DesignState & { kind: "sealed" }>) {
  const [msg, setMsg] = useState("");
  /** The box a Qtc preset gives, or null when this driver's Qts is already above it. */
  const make = (qtc: number) => {
    const vb = p.align ? sealedVolumeForAlignment(p.align, qtc, p.drivers) : null;
    return vb === null ? null : { ...p.design, vb_l: toBuilt(vb, p.fill), ...withPreset(p.design.name, `Qtc ${qtc}`) };
  };
  const apply = (qtc: number) => {
    const next = make(qtc);
    if (!next) return setMsg(`This driver's Qts is already above ${qtc}; no sealed box can reach it.`);
    setMsg("");
    p.onChange(next);
  };
  const usable = !!p.align && !p.linked;
  return (
    <div className="bx-body">
      <PresetRow
        current={p.design.preset}
        disabled={!usable}
        note={p.linked ? LINKED_NOTE : undefined}
        color={p.color}
        preview={p.preview}
        options={usable ? [0.5, 0.577, 0.707].map((q) => ({ name: `Qtc ${q}`, help: QTC_TITLES[q]!, design: make(q), apply: () => apply(q) })) : []}
      />
      <VbField vb_l={p.built_l} value={p.design.vb_l} linked={p.linked} onChange={(vb_l) => p.onChange({ ...p.design, vb_l, preset: undefined })} />
      {msg && <p className="warn">{msg}</p>}
    </div>
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
  /** The calculator's enclosure's lowest standing wave (Hz), when it feeds this design. */
  boxMode_hz?: number | null;
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
  ec: number;
  ctx: Pick<PortContext, "portVelocity" | "internalMax_cm" | "boxMode_hz" | "portVelocityAt" | "portCompression" | "drive" | "portLimit">;
}) {
  const { v, vb_l, air, ec, ctx } = props;
  const { fmt } = useUnits();
  const port = portOf(v);
  const leff = portEffectiveLength(port, ec); // m
  const pipe = air.c / (2 * leff);
  // WinISD's "1st port resonance" uses the physical length (no end corrections), so it reads higher.
  const pipeWinisd = air.c / (2 * (v.length_cm / 100));
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
        `only has room for about ${fmt(Math.max(0, room), "len")} in a straight line. Use a bent (L-shaped) port or a slot along a wall, or make the box bigger. A smaller port area would also tune shorter, but its air moves faster.`,
      fix: "Length",
    });
  }

  // Chuffing: air speed scales with 1/area, so suggest the area that brings it under the line.
  const limit = ctx.portLimit ?? PORT_LIMIT;
  if (ctx.portVelocity !== null && ctx.portVelocity > limit) {
    const k = ctx.portVelocity / limit;
    const fbNow = ventedFb(vb_l, port, v.count, ec, air);
    const bigger: typeof port =
      v.shape === "round"
        ? { ...port, shape: "round", diameter_cm: v.diameter_cm * Math.sqrt(k) }
        : { ...port, shape: "slot", width_cm: v.slotWidth_cm * k, height_cm: v.slotHeight_cm };
    const newLen = portLengthForFb(vb_l, { ...bigger, length_cm: 0 }, fbNow, v.count, ec, air);
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

  // A slot along the box walls: the walls run on past its inner end, so it acts longer than any
  // end correction for a free tube says. How much can't be worked out reliably, so give the
  // tuning as a range (K 0.9–1.5) and how to trim, unless the user has set their own K.
  const range = slotTuningRange(v, vb_l, ec, air);
  if (range) {
    notes.push({
      warn: false,
      chip: `Along the walls: ~${range.low.toFixed(1)}–${range.high.toFixed(1)} Hz`,
      text:
        `A slot built along the box walls usually tunes lower than calculated: its walls carry on past the inner end, so more air moves with it, ` +
        `and no simulator (this one, WinISD or Hornresp) can work out how much. Builders typically report a few hertz. At this length expect roughly ` +
        `${range.low.toFixed(1)}–${range.high.toFixed(1)} Hz rather than ${range.fb.toFixed(1)} Hz. Build it at ${fmt(v.length_cm, "len")}, measure the impedance, ` +
        `and if the dip is low, shorten the slot a little at a time towards about ${fmt(range.trim_cm, "len")} (its length for ${range.fb.toFixed(1)} Hz with an end correction of ${SLOT_WALL_K.mid}). ` +
        `A slot that stands clear of the walls tunes as calculated. If you've measured your own slots, enter their end correction in Settings → Ports.`,
    });
  }

  // The box's own lowest standing wave (for a box, half a wavelength across its longest inside
  // dimension; spheres and tubes from their own modes): when it lands near the port's pipe
  // resonance it drives the port hard and the port rings.
  const known = ctx.boxMode_hz != null && Number.isFinite(ctx.boxMode_hz);
  const boxMode = known ? ctx.boxMode_hz! : air.c / (2 * cube / 100);
  const coincide = Math.abs(boxMode / pipe - 1) < 0.15;
  notes.push({
    warn: pipe < 300 || coincide,
    chip: coincide ? `Pipe resonance ${pipe.toFixed(0)} Hz meets a box mode` : `Pipe resonance ${pipe.toFixed(0)} Hz`,
    text:
      `The port is also a pipe open at both ends; it resonates at about ${pipe.toFixed(0)} Hz (and ${(2 * pipe).toFixed(0)}, ${(3 * pipe).toFixed(0)} Hz…), ` +
      `letting midrange out of the box as a narrow peak. That's from the port's length with its end corrections; WinISD's \u201c1st port resonance\u201d leaves them out and shows about ${pipeWinisd.toFixed(0)} Hz.` +
      (pipe < 300 ? " That's low enough to reach the woofer's working range: cross over well below it, or use a shorter, narrower port." : "") +
      (coincide
        ? ` The box's own lowest standing wave${known ? "" : ` (for a cube ${fmt(cube, "len")} inside)`} is at about ${boxMode.toFixed(0)} Hz, close to it: the box will drive the port hard there. Damping on the walls (and keeping the port's inner end away from the box's middle) helps, or change the port length a little.`
        : ` The box's own lowest standing wave is about ${boxMode.toFixed(0)} Hz${known ? "" : " (for a cube)"}.`) +
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
  while (el && !el.classList.contains("card") && !el.classList.contains("ui-card")) {
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      // Kit rows (label | box) and the older label-above fields.
      const labels = [...sib.querySelectorAll(".ui-field-label, label > span:first-child")].filter((x) => x.textContent === label);
      const input = labels.at(-1)?.parentElement?.querySelector("input");
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
          <Chip key={n.chip} tone={n.warn ? "warn" : "neutral"} pressed={open === n.chip} onClick={() => setOpen(open === n.chip ? null : n.chip)}>
            {n.warn && <span aria-hidden="true">⚠ </span>}
            {n.chip}
          </Chip>
        ))}
      </div>
      {shown && (
        <div className={shown.warn ? "warn check-detail" : "hint check-detail"}>
          <p>{shown.text}</p>
          {shown.fix && (
            <Button variant="ghost" size="sm" className="check-fix" onClick={(e) => focusField(e.currentTarget.closest(".checks") as HTMLElement, shown.fix!)}>
              Change {shown.fix} →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function VentedBody(p: CommonProps<VentedDesign> & { portCtx: PortContext; pickPort?: PortPicker }) {
  const v = p.design;
  const [msg, setMsg] = useState("");
  const { fmt } = useUnits();
  const set = (patch: Partial<VentedDesign>) => p.onChange({ ...v, ...patch });
  /** A hand edit to the box or port: it no longer is the preset it was sized with. */
  const edit = (patch: Partial<VentedDesign>) => set({ ...patch, preset: undefined });
  const fb = ventedFb(p.vb_l, portOf(v), v.count, p.ec, p.air);

  const tune = () => {
    const len = portLengthForFb(p.vb_l, portOf(v, 0), v.targetFb, v.count, p.ec, p.air);
    if (!(len > 0)) {
      setMsg(`Even a zero-length port tunes below ${v.targetFb} Hz with this port area. Use a bigger port (or more ports), or a lower tuning.`);
      return;
    }
    setMsg("");
    edit({ length_cm: Math.round(len * 10) / 10 });
  };

  /**
   * A vented alignment's box and tuning. This port keeps its size and gets the length for it
   * when that fits the box straight (the "Port too long to fit" rule); otherwise the port is
   * changed to one that fits, as Size all boxes picks it.
   */
  const presetOut = (a: { name: string; vb_l: number; fb: number }) => ventedPresetPatch(v, a, p.fill, p.air, p.portCtx.internalMax_cm, p.pickPort, p.ec);
  const applyAlignment = (a: { name: string; vb_l: number; fb: number }) => {
    const out = presetOut(a);
    setMsg(out.msg);
    if (out.patch) set(out.patch);
  };
  /** The box a preset gives (for the picker's curve), or null when it can't be built. */
  const ventedOption = (a: { name: string; vb_l: number; fb: number }, help: string): PresetOption => {
    const out = presetOut(a);
    return { name: a.name, help, fb: a.fb, design: out.patch ? { ...v, ...out.patch } : null, apply: () => applyAlignment(a) };
  };
  const flat = p.align && ventedAlignmentFor(p.align, p.drivers);
  const presets: PresetOption[] =
    !p.align || p.linked
      ? []
      : [
          ...(flat ? [ventedOption(flat, flatPresetHelp(p.align, false))] : []),
          ...moreVentedFor(p.align, p.drivers).map((a) => ventedOption(a, alignmentHelp(a))),
        ];
  const endNote =
    `Physical port length${v.flare_cm > 0 && v.shape === "round" ? ", end to end including the flares" : ""}; end correction (${p.ec} × diameter${p.ec === 0.732 ? ", like WinISD" : ", from Settings"}) is added automatically.` +
    (v.shape === "slot" ? " A slot along the box walls acts longer than this: see its tuning range below." : "");

  return (
    <>
      <div className="bx-body">
        <PresetRow
          current={v.preset}
          disabled={presets.length === 0}
          note={p.linked ? LINKED_NOTE : !flat && p.align ? "This driver's Qts is above about 0.6: it suits a sealed box better than a vented one." : undefined}
          color={p.color}
          preview={p.preview}
          options={presets}
        />
        <VbField vb_l={p.built_l} value={v.vb_l} linked={p.linked} onChange={(vb_l) => edit({ vb_l })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Box tuning frequency" />
        {msg && <p className="warn">{msg}</p>}
      </div>
      <Section icon="port" title="Port" value={portText(v, fmt)}>
        <PortRows
          port={v}
          what="port"
          lengthHelp={endNote}
          onChange={(patch) => edit(patch)}
          shapeHelp="Round tube, or a slot (rectangular, often along a wall). Slots are easy to build and less prone to chuffing at the same area."
        />
        <VentPosition at={v.ventAt} distance_cm={v.ventDistance_cm} what="port" backDepth_cm={p.backDepth_cm} onChange={set} />
        <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
        {v.shape === "round" && v.flare_cm > 0 && v.length_cm < 2 * v.flare_cm && <p className="warn">The port is shorter than its two flares: lengthen it or use a smaller radius.</p>}
        <PortChecks v={v} vb_l={p.vb_l} air={p.air} ec={p.ec} ctx={p.portCtx} />
      </Section>
    </>
  );
}

/** A port's one-line summary for its section: "Round 7.5 cm × 2 · 21.5 cm". */
function portText(v: PortFields & { flare_cm?: number }, fmt: ReturnType<typeof useUnits>["fmt"]): string {
  const size = v.shape === "round" ? `Round ${fmt(v.diameter_cm, "len")}` : `Slot ${fmt(v.slotWidth_cm, "len")} × ${fmt(v.slotHeight_cm, "len")}`;
  return `${size}${v.count > 1 ? ` × ${v.count}` : ""} · ${fmt(v.length_cm, "len")}`;
}

/** A port's shape, size, flare, length and count, as kit rows. */
function PortRows(props: { port: PortFields & { flare_cm?: number }; what: string; shapeHelp: string; lengthHelp?: string; onChange: (patch: Partial<PortFields & { flare_cm: number }>) => void }) {
  const v = props.port;
  const set = props.onChange;
  return (
    <>
      <div className="ui-field" data-help={props.shapeHelp} data-help-title="Shape">
        <span className="ui-field-label">Shape</span>
        <Segmented<"round" | "slot">
          label="Port shape"
          value={v.shape}
          options={[
            { value: "round", label: "Round" },
            { value: "slot", label: "Slot" },
          ]}
          onChange={(shape) => set({ shape })}
        />
      </div>
      {v.shape === "round" ? (
        <>
          <Num help="Inside diameter of the port tube. Bigger means lower air speed (less chuffing) but a longer port for the same tuning." label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
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
      <Num help={`Physical length of the ${props.what}. Longer tunes lower. ${props.lengthHelp ?? ""}`.trim()} label="Length" q="len" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
      <div className="ui-field" data-help="Number of identical ports. Two ports have twice the area: half the air speed, but each needs to be longer for the same tuning." data-help-title="Ports">
        <span className="ui-field-label">Ports</span>
        <Stepper label="Ports" value={v.count} min={1} max={16} onChange={(count) => set({ count })} />
      </div>
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
  /** A hand edit to the box or its PRs: it no longer is the preset it was sized with. */
  const edit = (patch: Partial<PrDesign>) => set({ ...patch, preset: undefined });
  const setGroup = (i: number, patch: Partial<PrGroupState>) => edit({ extra: pr.extra.map((g, k) => (k === i ? { ...g, ...patch } : g)) });
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
    edit({ addedMass_g: Math.round(add) });
  };

  /** A vented alignment's box and tuning, reached with added mass on these PRs. */
  /** The PR box a preset gives (its volume, tuning and added mass), or why it can't be reached. */
  const prPreset = (a: { name: string; vb_l: number; fb: number }): Partial<PrDesign> | string => {
    const add = t.massFor(a.fb, a.vb_l);
    if (add === Infinity) return unreachable(Math.round(a.fb * 10) / 10);
    if (add < 0) return `${a.name} wants ${a.vb_l.toFixed(1)} L at ${a.fb.toFixed(1)} Hz, but these PRs tune lower than that even with no added mass. Try a lighter or stiffer PR, or fewer PRs.`;
    return { vb_l: toBuilt(a.vb_l, p.fill), targetFb: Math.round(a.fb * 10) / 10, addedMass_g: Math.round(add), ...withPreset(pr.name, a.name) };
  };
  const applyPrAlignment = (a: { name: string; vb_l: number; fb: number }) => {
    const out = prPreset(a);
    if (typeof out === "string") return setMsg(out);
    setMsg("");
    set(out);
  };
  const prOption = (a: { name: string; vb_l: number; fb: number }, help: string): PresetOption => {
    const out = prPreset(a);
    return { name: a.name, help, fb: a.fb, design: typeof out === "string" ? null : { ...pr, ...out }, apply: () => applyPrAlignment(a) };
  };
  const flat = p.align && ventedAlignmentFor(p.align, p.drivers);
  const presets: PresetOption[] =
    !p.align || p.linked
      ? []
      : [
          ...(flat ? [prOption(flat, flatPresetHelp(p.align, true))] : []),
          ...moreVentedFor(p.align, p.drivers).map((a) => prOption(a, `${alignmentHelp(a)} Reached with added mass.`)),
        ];
  const count = pr.count + pr.extra.reduce((n, g) => n + g.count, 0);

  return (
    <>
      <div className="bx-body">
        <PresetRow
          current={pr.preset}
          disabled={presets.length === 0}
          note={p.linked ? LINKED_NOTE : !flat && p.align ? "This driver's Qts is above about 0.6: it suits a sealed box better than a vented one." : undefined}
          color={p.color}
          preview={p.preview}
          options={presets}
        />
        <VbField vb_l={p.built_l} value={pr.vb_l} linked={p.linked} onChange={(vb_l) => edit({ vb_l })} />
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
        <div className="bx-actions">
          <PrTuning ctx={p.finder} design={pr} vb_l={p.vb_l} linked={p.linked} onApply={(patch, summary) => p.onFound(patch, summary)} />
        </div>
        {msg && <p className="warn">{msg}</p>}
      </div>
      <Section icon="radiator" title={t.mixed ? "Passive radiators" : "Passive radiator"} value={`${prShort(pr.prName)} × ${count}${pr.addedMass_g > 0 ? ` · +${short(pr.addedMass_g)} g` : ""}`}>
        <PrGroupFields
          title={t.mixed ? "Group 1" : undefined}
          group={pr}
          db={p.db}
          countHelp="Number of identical passive radiators. More PRs means more cone area: less excursion each."
          massHelp="Mass glued onto each PR cone (grams, per passive radiator). More mass tunes the box lower."
          noParams
          onPick={(id) =>
            loadPrChoice(id).then(
              ({ name, params, displacement_l, cutout_mm }) => {
                edit({ prName: name, params });
                p.onPrPhysical({ displacement_l, cutout_mm });
              },
              () => alert("Couldn't load that passive radiator."),
            )
          }
          onChange={(patch) => edit(patch)}
        />
        <VentPosition at={pr.ventAt} distance_cm={pr.ventDistance_cm} what="PRs" backDepth_cm={p.backDepth_cm} onChange={set} />
        <TuneRow
          target={pr.targetFb}
          onTarget={(x) => set({ targetFb: x })}
          button="Set added mass"
          title={t.mixed ? "Sets the added mass on group 1's PRs; the other groups stay as they are" : undefined}
          onApply={tune}
        />
        <PrParams params={pr.params} onChange={(patch) => edit({ params: { ...pr.params, ...patch } })} />
        {pr.extra.map((g, i) => (
          <PrGroupFields
            key={i}
            title={`Group ${i + 2}`}
            group={g}
            db={p.db}
            onChange={(patch) => setGroup(i, patch)}
            onRemove={() => edit({ extra: pr.extra.filter((_, k) => k !== i) })}
          />
        ))}
        {t.mixed && <p className="hint">With mixed PRs each group gets its own excursion curve and Xmax line; the tuning helpers adjust group 1's added mass.</p>}
        <div className="bx-actions">
          <PrFinder ctx={p.finder} design={pr} vb_l={p.vb_l} linked={p.linked} db={p.db} onUse={(patch, summary, physical) => p.onFound(patch, summary, physical)} />
          <Button
            variant="ghost"
            icon="plus"
            title="Put a second kind of passive radiator in the same box (or the same PR with a different added mass)"
            onClick={() => edit({ extra: [...pr.extra, { prName: pr.prName, count: 1, addedMass_g: pr.addedMass_g, params: { ...pr.params } }] })}
          >
            Add a different PR
          </Button>
        </div>
      </Section>
    </>
  );
}

/** "EX10-PR" from "Example Audio EX10-PR": the PR's model, for a section's summary. */
const prShort = (name: string) => {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words.slice(-1)[0]! : name || "PR";
};

/**
 * One group of identical passive radiators: its picker (the chosen PR on the button), how many
 * and the mass on each, and its datasheet parameters behind a row. A titled group (mixed PRs)
 * sits in a bordered block with a remove button.
 */
function PrGroupFields(props: {
  title?: string;
  group: PrGroupState;
  db: DbIndex | null;
  countHelp?: string;
  massHelp?: string;
  onPick?: (id: string) => void;
  onChange: (patch: Partial<PrGroupState>) => void;
  onRemove?: () => void;
  /** Leave the parameters out (the PR box shows group 1's after its tuning rows). */
  noParams?: boolean;
}) {
  const g = props.group;
  const body = (
    <>
      <div className="bx-picker">
        <PassiveRadiatorBrowser
          rows={props.db?.passiveRadiators}
          drivers={props.db?.drivers}
          current={g.prName}
          onPick={
            props.onPick ??
            ((id) =>
              loadPrChoice(id).then(
                ({ name, params }) => props.onChange({ prName: name, params }),
                () => alert("Couldn't load that passive radiator."),
              ))
          }
        />
      </div>
      <div className="ui-field" data-help={props.countHelp ?? "Number of identical passive radiators in this group."} data-help-title="PRs">
        <span className="ui-field-label">PRs</span>
        <Stepper label="Passive radiators" value={g.count} min={1} max={16} onChange={(count) => props.onChange({ count })} />
      </div>
      <Num help={props.massHelp ?? "Mass glued onto each PR cone in this group (grams). More mass tunes lower."} label="Added mass" unit="g" value={g.addedMass_g} min={0} onChange={(v) => props.onChange({ addedMass_g: v })} />
      {!props.noParams && <PrParams params={g.params} onChange={(patch) => props.onChange({ params: { ...g.params, ...patch } })} />}
    </>
  );
  if (!props.title) return body;
  return (
    <div className="bx-group">
      <div className="bx-group-head">
        <span>{props.title}</span>
        {props.onRemove && <Button variant="ghost" icon="trash" label={`Remove ${props.title}`} onClick={props.onRemove} />}
      </div>
      {body}
    </div>
  );
}

/** A PR's datasheet parameters behind one row that shows them while closed. */
function PrParams(props: { params: PrDesign["params"]; onChange: (patch: Partial<PrDesign["params"]>) => void }) {
  const q = props.params;
  return (
    <Disclosure title="PR parameters" value={`Mms ${short(q.mms_g)} g · Sd ${short(q.sd_cm2)} cm² · ${q.xmech ? "Xmech" : "Xmax"} ${short(q.xmax_mm)} mm`}>
      <PrParamFields params={q} onChange={props.onChange} />
      <p className="hint">From the datasheet. PR Mms is the bare moving mass, without added mass.</p>
    </Disclosure>
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
        <PrGroupFields
          key={i}
          title={mixed ? `Group ${i + 1}` : undefined}
          group={g}
          db={props.db}
          onChange={(patch) => setGroup(i, patch)}
          onRemove={mixed ? () => props.onChange(gs.filter((_, k) => k !== i)) : undefined}
        />
      ))}
      <Fixed
        label={mixed ? "Fb ≈" : "Fb"}
        unit="Hz"
        value={f1(fb)}
        title={mixed ? "Approximate tuning of all this chamber's PRs together; the charts show the real behaviour." : "Tuning of this chamber's PRs"}
      />
      <TuneRow
        target={props.target}
        onTarget={props.onTarget}
        button="Set added mass"
        title={mixed ? "Sets the added mass on group 1's PRs" : undefined}
        onApply={tune}
      />
      {msg && <p className="warn">{msg}</p>}
      <div className="bx-actions">
        <Button variant="ghost" icon="plus" onClick={() => props.onChange([...gs, { ...gs[gs.length - 1]!, count: 1, params: { ...gs[gs.length - 1]!.params } }])}>
          Add a different PR
        </Button>
      </div>
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
      <Num
        help={
          params.xmech
            ? "The maker's mechanical limit (Xmech): where the PR bottoms out. They publish no linear Xmax, so its suspension stiffens somewhat before this."
            : "One-way linear excursion of the passive radiator (Xmax)."
        }
        label={params.xmech ? "PR Xmech" : "PR Xmax"}
        unit="mm"
        value={params.xmax_mm}
        onChange={(v) => onChange({ xmax_mm: v })}
      />
    </>
  );
}

/** One bandpass chamber's port: its rows, the chamber's tuning and a "set length" helper. */
function PortEditor(props: {
  port: PortFields;
  /** Volume of the chamber the port tunes. */
  vb_l: number;
  air: Air;
  ec: number;
  onChange: (p: PortFields) => void;
}) {
  const v = props.port;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<PortFields>) => props.onChange({ ...v, ...patch });
  const fb = ventedFb(props.vb_l, portOf(v), v.count, props.ec, props.air);
  const tune = () => {
    const len = portLengthForFb(props.vb_l, portOf(v, 0), v.targetFb, v.count, props.ec, props.air);
    if (!(len > 0)) {
      setMsg(`Even a zero-length port tunes below ${v.targetFb} Hz with this port area. Use a bigger port (or more ports), or a lower tuning.`);
      return;
    }
    setMsg("");
    set({ length_cm: Math.round(len * 10) / 10 });
  };
  return (
    <>
      <PortRows port={v} what="chamber's port" shapeHelp="Round tube, or a slot (rectangular, often along a wall)." onChange={set} />
      <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Tuning of this chamber with its port" />
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

const BP_ORDERS: { value: BandpassOrder; text: string }[] = [
  { value: "4", text: "4th order" },
  { value: "6p", text: "6th parallel" },
  { value: "6s", text: "6th series" },
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
            chamber lowers its Ql. Baffle Q is the leak between the chambers, around the driver and through the baffle (WinISD's default 100). VituixCAD has no leak between the chambers: clear it to compare.
          </p>
        </>
      )}
    </>
  );
}

function BandpassBody(p: CommonProps<BandpassDesign> & { portCtx: PortContext; db: DbIndex | null; losses: ChamberLosses; onSize?: () => void }) {
  const b = p.design;
  const { fmt } = useUnits();
  const set = (patch: Partial<BandpassDesign>) => p.onChange({ ...b, ...patch });
  const rearOpen = b.order !== "4";
  const into = b.order === "6s" ? "into the front chamber" : "to the outside";
  const opening = (o: ChamberOpening, port: PortFields, prs: PrGroupState[]) =>
    o === "port" ? `Port · ${portText(port, fmt)}` : `${prs.reduce((n, g) => n + g.count, 0)} PR${prs.length > 1 || prs[0]!.count > 1 ? "s" : ""} · ${prShort(prs[0]!.prName)}`;
  const typeHelp =
    "4th order: a closed rear chamber, the front open to the outside. 6th parallel: both chambers open to the outside. 6th series: the rear chamber opens into the front, which opens to the outside. " +
    `The driver sits in the wall between the chambers. All the sound comes out of the ${rearOpen && b.order === "6p" ? "two chambers' openings" : "front chamber's opening"}, so expect a band-limited response.`;
  return (
    <>
      <div className="bx-body">
        <Select help={typeHelp} label="Type" value={b.order} options={BP_ORDERS} onChange={(order) => set({ order })} />
        <Num help="Air volume of the front chamber (the one the cone fires into)." label="Front Vb" q="vol" value={b.frontVb_l} onChange={(frontVb_l) => set({ frontVb_l })} />
        <VbField label="Rear Vb" vb_l={p.built_l} value={b.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        {p.onSize && b.order !== "6s" && (
          <div className="bx-actions">
            <Button
              variant="ghost"
              onClick={p.onSize}
              disabled={p.linked}
              title={
                p.linked
                  ? "The volume calculator sets the rear chamber: unlink it to size both chambers."
                  : "Both chambers, their ports and tunings for the lowest flat band (up to at least 80 Hz) in the same total volume. Undo takes it back."
              }
            >
              <Sparkle />
              Size this bandpass
            </Button>
          </div>
        )}
      </div>
      <Section icon="port" title="Front chamber" value={opening(b.frontOpening, b.front, b.frontPrs)}>
        <Select help="How this chamber opens to the outside: through a port, or through passive radiators." label="Opening" value={b.frontOpening} options={OPENINGS} onChange={(frontOpening) => set({ frontOpening })} />
        {b.frontOpening === "port" ? (
          <>
            <PortEditor port={b.front} vb_l={b.frontVb_l} air={p.air} ec={p.ec} onChange={(front) => set({ front })} />
            <PortChecks
              v={b.front}
              vb_l={b.frontVb_l}
              air={p.air}
              ec={p.ec}
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
      </Section>
      {rearOpen && (
        <Section icon="port" title="Rear chamber" value={opening(b.rearOpening, b.rear, b.rearPrs)}>
          <Select help={`How this chamber opens ${into}: through a port, or through passive radiators.`} label="Opening" value={b.rearOpening} options={OPENINGS} onChange={(rearOpening) => set({ rearOpening })} />
          {b.order === "6p" && (
            <Num
              label="Apart"
              q="len"
              value={b.ventDistance_cm ?? 0}
              min={0}
              help={`How far this chamber's opening is from the front chamber's (0 = side by side). ${PATH_HELP}`}
              onChange={(x) => set({ ventDistance_cm: x > 0 ? x : undefined })}
            />
          )}
          {b.rearOpening === "port" ? (
            <>
              <PortEditor port={b.rear} vb_l={p.vb_l} air={p.air} ec={p.ec} onChange={(rear) => set({ rear })} />
              <PortChecks
                v={b.rear}
                vb_l={p.vb_l}
                air={p.air}
                ec={p.ec}
                ctx={{ portVelocity: p.portCtx.rearPortVelocity, internalMax_cm: p.portCtx.internalMax_cm, boxMode_hz: p.portCtx.boxMode_hz, portLimit: p.portCtx.portLimit }}
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
        </Section>
      )}
      <Section icon="sliders" title="Box losses" value={b.losses ? "Per chamber" : "As in Settings"}>
        <BandpassLossesEditor
          losses={b.losses}
          shared={p.losses}
          frontPort={b.frontOpening === "port"}
          rearPort={rearOpen ? b.rearOpening === "port" : null}
          onChange={(losses) => set({ losses })}
        />
      </Section>
    </>
  );
}

/** A box's stuffing, in a few words for its section: "None", "Lined walls", "Fibre 8 g/L". */
const stuffingText = (st: Stuffing | undefined) =>
  !st || st.mode === "none"
    ? "None"
    : st.mode === "lined"
      ? "Lined walls"
      : st.mode === "fill"
        ? `Fibre ${short(st.gL)} g/L`
        : `${st.gain_pct >= 0 ? "+" : ""}${short(st.gain_pct)} % · Qa ${short(st.qa)}`;

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
  /** Port end correction in use (Settings → Ports). */
  ec: number;
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
  /** The volume calculator's outside depth when it's linked to this design (box or wedge), for a port on the back. */
  backDepth_cm?: number | null;
  /** A design's response for the Preset picker's curves. */
  preview?: (d: DesignState) => PresetPreview | null;
  /** Folded to its header and a one-line summary (phones and desktop alike). */
  folded?: boolean;
  onFold?: (folded: boolean) => void;
  glance?: DesignGlance;
}) {
  const d = props.design;
  // What the box acts as over what is built: stuffing, or Qa's volume gain.
  const fill = props.built_l > 0 ? props.vb_l / props.built_l : stuffFactor(d);
  const common = {
    color: props.color,
    vb_l: props.vb_l,
    built_l: props.built_l,
    fill,
    linked: props.linked,
    air: props.air,
    ec: props.ec,
    align: props.align,
    drivers: props.drivers,
    backDepth_cm: props.backDepth_cm ?? null,
    preview: props.preview,
  };
  return (
    <DesignShell
      design={d}
      color={props.color}
      canDelete={props.canDelete}
      folded={props.folded ?? false}
      onFold={props.onFold ?? (() => undefined)}
      glance={props.glance}
      linked={props.linked}
      onChange={(patch) => props.onChange({ ...d, ...patch } as DesignState)}
      onDuplicate={props.onDuplicate}
      onDelete={props.onDelete}
      onDimensions={d.kind !== "line" ? props.onDimensions : undefined}
      onUnlink={props.onUnlink}
    >
      <KitFields>
        {d.kind === "sealed" && <SealedBody {...common} design={d} onChange={props.onChange} />}
        {d.kind === "vented" && <VentedBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} pickPort={props.pickPort} />}
        {d.kind === "bandpass" && (
          <BandpassBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} db={props.db} losses={props.losses} onSize={props.onSizeBandpass} />
        )}
        {d.kind === "line" && (
          <div className="bx-body">
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
          </div>
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
          <Section icon="stuffing" title="Stuffing" value={stuffingText(d.stuffing)}>
            <StuffingFields design={d as DesignState & { kind: StuffableKind }} built_l={props.built_l} air={props.air} ec={props.ec} fit={props.fit} onChange={props.onChange} />
          </Section>
        )}
      </KitFields>
    </DesignShell>
  );
}

/** Each box type's icon (the + Box menu draws it in the colour the new box gets). */
const KIND_ICON: Record<DesignKind, IconName> = { sealed: "box", vented: "port", pr: "radiator", bandpass: "box", line: "line" };

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
  // Desktop: the side panel is a scroll box that clipped the menu (all boxes folded left too little
  // room under the button). Pin the menu to the window under the button, as tall as fits.
  const [place, setPlace] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (!open || !matchMedia("(min-width: 861px)").matches) {
      setPlace(undefined);
      return;
    }
    const fit = () => {
      const b = ref.current?.querySelector("button")?.getBoundingClientRect();
      if (!b) return;
      const top = b.bottom + 6;
      setPlace({ position: "fixed", left: b.left, top, maxHeight: Math.max(160, innerHeight - top - 12), overflowY: "auto" });
    };
    fit();
    addEventListener("scroll", fit, true);
    addEventListener("resize", fit);
    return () => {
      removeEventListener("scroll", fit, true);
      removeEventListener("resize", fit);
    };
  }, [open]);
  // The colour the next box of each kind gets (the same rule as the charts: the kind's next shade).
  const nextColor = (k: DesignKind) => {
    const shades = KIND_COLORS[k];
    return shades[props.designs.filter((d) => d.kind === k).length % shades.length]!;
  };
  return (
    <div className="ui-menu bx-add" data-align="start" ref={ref}>
      <Button
        icon="plus"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add a box"
        disabled={full}
        title={full ? `Up to ${props.max} designs: delete one to add another` : "Add a box"}
        onClick={() => setOpen(!open)}
      >
        Box
      </Button>
      {open && (
        <div className="ui-menu-list" role="menu" aria-label="Box type" style={place}>
          {ADD_KINDS.map(({ kind, what }) => (
            <MenuItemButton
              key={kind}
              title={what}
              style={{ "--bx-color": nextColor(kind) } as CSSProperties}
              onClick={() => {
                setOpen(false);
                props.onAdd(kind);
              }}
            >
              <Icon name={KIND_ICON[kind]} />
              {KIND_LABEL[kind]}
            </MenuItemButton>
          ))}
        </div>
      )}
    </div>
  );
}
