import { useState, type ReactNode } from "react";
import {
  portEffectiveLength,
  prAddedMassForFb,
  prFb,
  prGroupsAddedMassForFb,
  prGroupsFb,
  portLengthForFb,
  qb3Alignment,
  sealedVolumeForAlignment,
  ventedFb,
  type AlignmentDriver,
  type Air,
} from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { PassiveRadiatorBrowser } from "./Library.tsx";
import { loadPassiveRadiator, type DbIndex } from "./library.ts";
import { KIND_LABEL, PORT_LIMIT, portOf, prGroupsOf } from "./sim.ts";
import { useUnits } from "./units.ts";
import type { BandpassDesign, BandpassOrder, DesignKind, DesignState, PortFields, PrDesign, PrGroupState, VentedDesign } from "./state.ts";

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
  children: ReactNode;
}) {
  const d = props.design;
  return (
    <section className={`card design${d.on ? "" : " off"}`}>
      <div className="design-head">
        <span className="swatch" style={{ background: props.color }} />
        <input
          className="design-name"
          value={d.name}
          aria-label="Design name"
          onChange={(e) => props.onChange({ name: e.currentTarget.value })}
        />
        <span className="kind">{KIND_LABEL[d.kind]}</span>
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
    <Num label={label} q="vol" value={props.value} onChange={props.onChange} />
  );
}

function TuneRow(props: { target: number; onTarget: (v: number) => void; button: string; title?: string; onApply: () => void }) {
  return (
    <div className="tune">
      <Num label="Tune to" unit="Hz" value={props.target} onChange={props.onTarget} />
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
    p.onChange({ ...p.design, vb_l: Math.round(vb * 10) / 10, name: renamed(p.design.name, "Sealed", `Sealed Qtc ${qtc}`) });
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
function renamed(current: string, defaultPrefix: string, next: string): string {
  return current.startsWith(defaultPrefix) ? next : current;
}

interface PortContext {
  /** Peak port velocity in the displayed convention (above the subsonic cut-off), if simulated. */
  portVelocity: number | null;
  /** Bandpass: the same for the rear chamber's port. */
  rearPortVelocity: number | null;
  /** Largest internal box dimension (cm) when the volume calculator feeds this design. */
  internalMax_cm: number | null;
}

/** Warnings and suggestions about the port itself: does it fit, will it chuff, where does it resonate. */
function PortChecks(props: { v: PortFields; vb_l: number; air: Air; ctx: Pick<PortContext, "portVelocity" | "internalMax_cm"> }) {
  const { v, vb_l, air, ctx } = props;
  const { fmt } = useUnits();
  const port = portOf(v);
  const leff = portEffectiveLength(port); // m
  const pipe = air.c / (2 * leff);
  const notes: { warn: boolean; text: string }[] = [];

  // Will it fit? Keep at least one port diameter (or slot height) clear of the opposite wall.
  const clearance = v.shape === "round" ? v.diameter_cm : v.slotHeight_cm;
  const cube = Math.cbrt(vb_l * 1000);
  const room = (ctx.internalMax_cm ?? cube) - clearance;
  if (v.length_cm > room) {
    notes.push({
      warn: true,
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
    notes.push({
      warn: true,
      text:
        `Port air speed reaches ${ctx.portVelocity.toFixed(1)} m/s. To stay under ${PORT_LIMIT} m/s at this power: about ${size} ` +
        `(length ≈ ${fmt(newLen, "len")} for the same tuning)${ports > v.count ? `, or ${ports} ports of the current size` : ""}.`,
    });
  }

  notes.push({
    warn: pipe < 300,
    text:
      `Port pipe resonance ≈ ${pipe.toFixed(0)} Hz` +
      (pipe < 300 ? ". That's low enough to leak midrange through the port; line the port's surroundings or cross over well below it." : "."),
  });

  return (
    <ul className="port-checks">
      {notes.map((n) => (
        <li key={n.text} className={n.warn ? "warn" : "hint"}>
          {n.text}
        </li>
      ))}
    </ul>
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
        <Select
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
          <Num label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
        ) : (
          <>
            <Num label="Width" q="len" value={v.slotWidth_cm} onChange={(x) => set({ slotWidth_cm: x })} />
            <Num label="Height" q="len" value={v.slotHeight_cm} onChange={(x) => set({ slotHeight_cm: x })} />
          </>
        )}
        <Num label="Length" q="len" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
        <Num label="Ports" value={v.count} onChange={(x) => set({ count: Math.max(1, Math.round(x)) })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Box tuning frequency" />
      </div>
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      <Presets note={p.linked ? LINKED_NOTE : undefined}>
        <button
          className="chip"
          disabled={!p.align || p.linked}
          title="Quasi-Butterworth 3rd order (B4 when Qts ≈ 0.38): flat response, smallest box for its extension"
          onClick={() => {
            const a = p.align && qb3Alignment(p.align, p.drivers);
            if (!a) {
              setMsg("QB3 needs a driver Qts below about 0.38. This driver suits a sealed box (or a larger, lower-tuned vented box).");
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
              name: renamed(v.name, "Ported", `Ported ${a.name}`),
            });
          }}
        >
          QB3 / B4
        </button>
      </Presets>
      {msg && <p className="warn">{msg}</p>}
      <PortChecks v={v} vb_l={p.vb_l} air={p.air} ctx={p.portCtx} />
      <p className="hint">
        Physical port length; end correction (0.732 × diameter, like WinISD) is added automatically.
        {v.shape === "slot" && " A slot along a box wall behaves slightly longer than this model assumes."}
      </p>
    </>
  );
}

/** Combined tuning and the added mass (on the first group) that reaches a target. */
function prTuning(d: PrDesign, vb_l: number, air: Air) {
  const groups = prGroupsOf(d);
  const mixed = groups.length > 1;
  return {
    mixed,
    fb: mixed ? prGroupsFb(vb_l, groups, air) : prFb(vb_l, d.params, d.count, d.addedMass_g, air),
    /** Added mass per PR in the first group for `fb` (NaN-free; may be negative or Infinity). */
    massFor: (fb: number, vb = vb_l) =>
      mixed ? prGroupsAddedMassForFb(vb, groups, fb, 0, air) : prAddedMassForFb(vb, d.params, fb, d.count, air),
    bare: (vb = vb_l) =>
      mixed ? prGroupsFb(vb, groups.map((g, i) => (i === 0 ? { ...g, addedMass_g: 0 } : g)), air) : prFb(vb, d.params, d.count, 0, air),
  };
}

function PrBody(p: CommonProps<PrDesign> & { db: DbIndex | null; onPrDisplacement: (l: number) => void }) {
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
        onPick={(id) =>
          loadPassiveRadiator(id).then(
            ({ name, params, displacement_l }) => {
              set({ prName: name, params });
              if (displacement_l !== undefined) p.onPrDisplacement(displacement_l);
            },
            () => alert("Couldn't load that passive radiator."),
          )
        }
      />
      <p className="pr-name">{pr.prName}</p>
      <div className="fields">
        <VbField vb_l={p.vb_l} value={pr.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        <Num label="PRs" value={pr.count} onChange={(v) => set({ count: Math.max(1, Math.round(v)) })} />
        <Num label="Added mass" unit="g" value={pr.addedMass_g} min={0} onChange={(v) => set({ addedMass_g: v })} />
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
        <div className="pr-group" key={i}>
          <div className="pr-group-head">
            <h3>Passive radiator group {i + 2}</h3>
            <button
              type="button"
              className="icon"
              aria-label={`Remove passive radiator group ${i + 2}`}
              title="Remove this group"
              onClick={() => set({ extra: pr.extra.filter((_, k) => k !== i) })}
            >
              ×
            </button>
          </div>
          <PassiveRadiatorBrowser
            rows={p.db?.passiveRadiators}
            onPick={(id) =>
              loadPassiveRadiator(id).then(
                ({ name, params }) => setGroup(i, { prName: name, params }),
                () => alert("Couldn't load that passive radiator."),
              )
            }
          />
          <p className="pr-name">{g.prName}</p>
          <div className="fields">
            <Num label="PRs" value={g.count} onChange={(v) => setGroup(i, { count: Math.max(1, Math.round(v)) })} />
            <Num label="Added mass" unit="g" value={g.addedMass_g} min={0} onChange={(v) => setGroup(i, { addedMass_g: v })} />
            <PrParamFields params={g.params} onChange={(patch) => setGroup(i, { params: { ...g.params, ...patch } })} />
          </div>
        </div>
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
          title="Box size and tuning of the QB3 / B4 vented alignment, reached with added mass"
          onClick={() => {
            const a = p.align && qb3Alignment(p.align, p.drivers);
            if (!a) {
              setMsg("QB3 needs a driver Qts below about 0.38. This driver suits a sealed box better.");
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
              name: renamed(pr.name, "Passive radiators", `PR ${a.name}`),
            });
          }}
        >
          QB3 / B4
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

function PrParamFields(props: { params: PrDesign["params"]; onChange: (patch: Partial<PrDesign["params"]>) => void }) {
  const { params, onChange } = props;
  return (
    <>
      <Num label="PR Mms" unit="g" value={params.mms_g} onChange={(v) => onChange({ mms_g: v })} />
      <Num label="PR Vas" unit="L" value={params.vas_l} onChange={(v) => onChange({ vas_l: v })} />
      <Num label="PR Qms" value={params.qms} onChange={(v) => onChange({ qms: v })} />
      <Num label="PR Sd" unit="cm²" value={params.sd_cm2} onChange={(v) => onChange({ sd_cm2: v })} />
      <Num label="PR Xmax" unit="mm" value={params.xmax_mm} onChange={(v) => onChange({ xmax_mm: v })} />
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
        <Select
          label="Port"
          value={v.shape}
          options={[
            { value: "round", text: "Round tube" },
            { value: "slot", text: "Slot (rectangular)" },
          ]}
          onChange={(shape) => set({ shape })}
        />
        {v.shape === "round" ? (
          <Num label="Port Ø" q="len" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
        ) : (
          <>
            <Num label="Width" q="len" value={v.slotWidth_cm} onChange={(x) => set({ slotWidth_cm: x })} />
            <Num label="Height" q="len" value={v.slotHeight_cm} onChange={(x) => set({ slotHeight_cm: x })} />
          </>
        )}
        <Num label="Length" q="len" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
        <Num label="Ports" value={v.count} onChange={(x) => set({ count: Math.max(1, Math.round(x)) })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Tuning of this chamber with its port" />
      </div>
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

const BP_ORDERS: { value: BandpassOrder; text: string }[] = [
  { value: "4", text: "4th order (closed rear, ported front)" },
  { value: "6p", text: "6th order (both chambers ported out)" },
  { value: "6s", text: "6th order series-tuned (rear ports into front)" },
];

function BandpassBody(p: CommonProps<BandpassDesign> & { portCtx: PortContext }) {
  const b = p.design;
  const set = (patch: Partial<BandpassDesign>) => p.onChange({ ...b, ...patch });
  const rearPorted = b.order !== "4";
  return (
    <>
      <div className="fields">
        <Select label="Type" value={b.order} options={BP_ORDERS} onChange={(order) => set({ order })} />
        <VbField label="Rear Vb" vb_l={p.vb_l} value={b.vb_l} linked={p.linked} onChange={(vb_l) => set({ vb_l })} />
        <Num label="Front Vb" q="vol" value={b.frontVb_l} onChange={(frontVb_l) => set({ frontVb_l })} />
      </div>
      <h3>Front chamber port (to the outside)</h3>
      <PortEditor port={b.front} vb_l={b.frontVb_l} air={p.air} onChange={(front) => set({ front })} />
      <PortChecks v={b.front} vb_l={b.frontVb_l} air={p.air} ctx={{ portVelocity: p.portCtx.portVelocity, internalMax_cm: null }} />
      {rearPorted && (
        <>
          <h3>{b.order === "6s" ? "Rear chamber port (into the front chamber)" : "Rear chamber port (to the outside)"}</h3>
          <PortEditor port={b.rear} vb_l={p.vb_l} air={p.air} onChange={(rear) => set({ rear })} />
          <PortChecks
            v={b.rear}
            vb_l={p.vb_l}
            air={p.air}
            ctx={{ portVelocity: p.portCtx.rearPortVelocity, internalMax_cm: p.portCtx.internalMax_cm }}
          />
        </>
      )}
      <p className="hint">
        The driver sits in the wall between the chambers{rearPorted ? "" : ", firing into the ported front chamber"}. All the
        sound comes out of the {rearPorted && b.order === "6p" ? "ports" : "front port"}, so expect a band-limited response.
        {p.linked && " The volume calculator feeds the rear chamber."}
      </p>
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
  onChange: (d: DesignState) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPrDisplacement: (l: number) => void;
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
    >
      {d.kind === "sealed" && <SealedBody {...common} design={d} onChange={props.onChange} />}
      {d.kind === "vented" && <VentedBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} />}
      {d.kind === "bandpass" && <BandpassBody {...common} design={d} onChange={props.onChange} portCtx={props.portCtx} />}
      {d.kind === "pr" && (
        <PrBody {...common} design={d} onChange={props.onChange} db={props.db} onPrDisplacement={props.onPrDisplacement} />
      )}
    </DesignShell>
  );
}

export function AddDesign(props: { disabled: boolean; onAdd: (k: DesignKind) => void }) {
  return (
    <div className="add-design">
      <span>Add design:</span>
      {(["sealed", "vented", "pr", "bandpass"] as const).map((k) => (
        <button key={k} className="secondary" disabled={props.disabled} onClick={() => props.onAdd(k)}>
          + {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
