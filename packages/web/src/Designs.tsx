import { useState, type ReactNode } from "react";
import { prAddedMassForFb, prFb, portLengthForFb, ventedFb } from "@sbg/engine";
import { Fixed, LibraryPicker, Num, Select } from "./components.tsx";
import { loadPassiveRadiator, type DbIndex } from "./library.ts";
import { KIND_LABEL, portOf } from "./sim.ts";
import type { DesignKind, DesignState, PrDesign, VentedDesign } from "./state.ts";

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "–");

interface CommonProps<D extends DesignState> {
  design: D;
  color: string;
  /** Effective Vb (from the volume calculator when linked). */
  vb_l: number;
  linked: boolean;
  onChange: (d: D) => void;
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

function VbField(props: { vb_l: number; value: number; linked: boolean; onChange: (v: number) => void }) {
  return props.linked ? (
    <Fixed label="Vb" unit="L" value={props.vb_l.toFixed(1)} title="From the volume calculator" />
  ) : (
    <Num label="Vb" unit="L" value={props.value} onChange={props.onChange} />
  );
}

function TuneRow(props: { target: number; onTarget: (v: number) => void; button: string; onApply: () => void }) {
  return (
    <div className="tune">
      <Num label="Tune to" unit="Hz" value={props.target} onChange={props.onTarget} />
      <button className="secondary" onClick={props.onApply}>
        {props.button}
      </button>
    </div>
  );
}

function SealedBody(p: CommonProps<DesignState & { kind: "sealed" }>) {
  return (
    <div className="fields">
      <VbField vb_l={p.vb_l} value={p.design.vb_l} linked={p.linked} onChange={(vb_l) => p.onChange({ ...p.design, vb_l })} />
    </div>
  );
}

function VentedBody(p: CommonProps<VentedDesign>) {
  const v = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<VentedDesign>) => p.onChange({ ...v, ...patch });
  const fb = ventedFb(p.vb_l, portOf(v), v.count);

  const tune = () => {
    const len = portLengthForFb(p.vb_l, portOf(v, 0), v.targetFb, v.count);
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
          <Num label="Port Ø" unit="cm" value={v.diameter_cm} onChange={(x) => set({ diameter_cm: x })} />
        ) : (
          <>
            <Num label="Width" unit="cm" value={v.slotWidth_cm} onChange={(x) => set({ slotWidth_cm: x })} />
            <Num label="Height" unit="cm" value={v.slotHeight_cm} onChange={(x) => set({ slotHeight_cm: x })} />
          </>
        )}
        <Num label="Length" unit="cm" value={v.length_cm} min={0} onChange={(x) => set({ length_cm: x })} />
        <Num label="Ports" value={v.count} onChange={(x) => set({ count: Math.max(1, Math.round(x)) })} />
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Box tuning frequency" />
      </div>
      <TuneRow target={v.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set port length" onApply={tune} />
      {msg && <p className="warn">{msg}</p>}
      <p className="hint">
        Physical port length; end correction (0.732 × diameter, like WinISD) is added automatically.
        {v.shape === "slot" && " A slot along a box wall behaves slightly longer than this model assumes."}
      </p>
    </>
  );
}

function PrBody(p: CommonProps<PrDesign> & { db: DbIndex | null; onPrDisplacement: (l: number) => void }) {
  const pr = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<PrDesign>) => p.onChange({ ...pr, ...patch });
  const setP = (patch: Partial<PrDesign["params"]>) => set({ params: { ...pr.params, ...patch } });
  const fb = prFb(p.vb_l, pr.params, pr.count, pr.addedMass_g);

  const tune = () => {
    const add = prAddedMassForFb(p.vb_l, pr.params, pr.targetFb, pr.count);
    if (add < 0) {
      const bare = prFb(p.vb_l, pr.params, pr.count, 0);
      setMsg(
        `With no added mass these PRs already tune to ${f1(bare)} Hz, below ${pr.targetFb} Hz. Use a lighter or stiffer PR, fewer PRs, or a smaller box.`,
      );
      return;
    }
    setMsg("");
    set({ addedMass_g: Math.round(add) });
  };

  return (
    <>
      <LibraryPicker
        label="Load a passive radiator from the database"
        items={p.db?.passiveRadiators.map((x) => ({ id: x.id, text: `${x.brand} ${x.model} (${x.size_in ?? "?"}")` }))}
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
        <Fixed label="Fb" unit="Hz" value={f1(fb)} title="Box tuning frequency with the added mass" />
        <Num label="PR Mms" unit="g" value={pr.params.mms_g} onChange={(v) => setP({ mms_g: v })} />
        <Num label="PR Vas" unit="L" value={pr.params.vas_l} onChange={(v) => setP({ vas_l: v })} />
        <Num label="PR Qms" value={pr.params.qms} onChange={(v) => setP({ qms: v })} />
        <Num label="PR Sd" unit="cm²" value={pr.params.sd_cm2} onChange={(v) => setP({ sd_cm2: v })} />
        <Num label="PR Xmax" unit="mm" value={pr.params.xmax_mm} onChange={(v) => setP({ xmax_mm: v })} />
      </div>
      <TuneRow target={pr.targetFb} onTarget={(x) => set({ targetFb: x })} button="Set added mass" onApply={tune} />
      {msg && <p className="warn">{msg}</p>}
      <p className="hint">Added mass is per passive radiator. PR Mms is the bare moving mass from the datasheet.</p>
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
  onChange: (d: DesignState) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPrDisplacement: (l: number) => void;
}) {
  const d = props.design;
  const common = { color: props.color, vb_l: props.vb_l, linked: props.linked };
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
      {d.kind === "vented" && <VentedBody {...common} design={d} onChange={props.onChange} />}
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
      {(["sealed", "vented", "pr"] as const).map((k) => (
        <button key={k} className="secondary" disabled={props.disabled} onClick={() => props.onAdd(k)}>
          + {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
