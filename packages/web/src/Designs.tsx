import { useState, type ReactNode } from "react";
import { prAddedMassForFb, prFb, portLengthForFb, ventedFb } from "@sbg/engine";
import { Card, Fixed, Num, Select } from "./components.tsx";
import { COLORS, portOf } from "./sim.ts";
import type { AppState } from "./state.ts";

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "–");

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

export function VentedCard(props: {
  v: AppState["vented"];
  vb_l: number;
  vbField: ReactNode;
  onChange: (v: AppState["vented"]) => void;
}) {
  const { v } = props;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<AppState["vented"]>) => props.onChange({ ...v, ...patch });
  const fb = ventedFb(props.vb_l, portOf(v), v.count);

  const tune = () => {
    const len = portLengthForFb(props.vb_l, portOf(v, 0), v.targetFb, v.count);
    if (!(len > 0)) {
      setMsg(
        `Even a zero-length port tunes below ${v.targetFb} Hz with this port area. Use a bigger port (or more ports), or a lower tuning.`,
      );
      return;
    }
    setMsg("");
    set({ length_cm: Math.round(len * 10) / 10 });
  };

  return (
    <Card title="Ported" color={COLORS.vented} on={v.on} onToggle={(on) => set({ on })}>
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
        {props.vbField}
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
        Length is the physical port length; end correction (0.732 × diameter, like WinISD) is added automatically.
        {v.shape === "slot" && " A slot along a box wall behaves slightly longer than this model assumes."}
      </p>
    </Card>
  );
}

export function PrCard(props: {
  pr: AppState["pr"];
  vb_l: number;
  vbField: ReactNode;
  picker: ReactNode;
  onChange: (p: AppState["pr"]) => void;
}) {
  const { pr } = props;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<AppState["pr"]>) => props.onChange({ ...pr, ...patch });
  const setP = (patch: Partial<AppState["pr"]["params"]>) => set({ params: { ...pr.params, ...patch } });
  const fb = prFb(props.vb_l, pr.params, pr.count, pr.addedMass_g);

  const tune = () => {
    const add = prAddedMassForFb(props.vb_l, pr.params, pr.targetFb, pr.count);
    if (add < 0) {
      const bare = prFb(props.vb_l, pr.params, pr.count, 0);
      setMsg(
        `With no added mass these PRs already tune to ${f1(bare)} Hz, below ${pr.targetFb} Hz. Use a lighter or stiffer PR, fewer PRs, or a smaller box.`,
      );
      return;
    }
    setMsg("");
    set({ addedMass_g: Math.round(add) });
  };

  return (
    <Card title="Passive radiators" color={COLORS.pr} on={pr.on} onToggle={(on) => set({ on })}>
      {props.picker}
      <p className="pr-name">{pr.name}</p>
      <div className="fields">
        {props.vbField}
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
    </Card>
  );
}
