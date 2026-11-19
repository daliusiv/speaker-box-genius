import { useCallback, useState } from "react";
import { Button, FieldRow, NumberField, Popover, Select, Sheet, Switch } from "./ui/index.ts";
import { Icon } from "./Icon.tsx";
import {
  clampCrest,
  clampTarget,
  CREST_MAX,
  fmtCrest,
  presetOf,
  SIGNAL_PRESETS,
  signalLabel,
  TARGET_MAX,
  TARGET_MIN,
  type ProgramSignal,
  type SignalPreset,
} from "./programSignal.ts";
import { track } from "./telemetry.ts";

const HINT =
  "Crest factor is the signal's peak ÷ RMS: a sine is 3 dB. Xmax, port speed and amp volts and current limit the peaks; the driver's power rating and amp watts the average. Target SPL is average SPL at the charts' reference; blank measures headroom over the drive curve.";

/** The Max SPL chart's Program button: a popover on wide screens, a bottom sheet on phones. Changes apply live. */
export function ProgramControl(props: { signal: ProgramSignal; onChange: (s: ProgramSignal) => void; narrow: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { signal } = props;
  const label = signalLabel(signal);
  const full = signal.program ? `Program signal: ${label}${signal.target_dB !== null ? `, target ${fmtCrest(signal.target_dB)} dB` : ""}` : "Program signal: off (sine)";
  const body = <ProgramFields signal={signal} onChange={props.onChange} />;
  if (props.narrow) {
    return (
      <>
        <Button variant="ghost" className="program-button" aria-haspopup="dialog" aria-label={full} onClick={() => {
          track("tool_opened", { tool: "program" });
          setOpen(true);
        }}>
          <Icon name="wave" />
          {signal.program ? `${fmtCrest(signal.crest_dB)} dB` : "Sine"}
          <span className="program-caret" aria-hidden="true">
            ▾
          </span>
        </Button>
        <Sheet
          open={open}
          onClose={close}
          bottom
          title="Program signal"
          footer={
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          }
        >
          {body}
        </Sheet>
      </>
    );
  }
  return (
    <Popover
      open={open}
      onClose={close}
      label="Program signal"
      trigger={(id) => (
        <Button
          variant="ghost"
          className="program-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={full}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="wave" />
          Program: {label}
          <span className="program-caret" aria-hidden="true">
            ▾
          </span>
        </Button>
      )}
    >
      {body}
    </Popover>
  );
}

/** Program on/off, the signal, its crest factor and the target: the same in the popover and the sheet. */
export function ProgramFields(props: { signal: ProgramSignal; onChange: (s: ProgramSignal) => void }) {
  const { signal, onChange } = props;
  // "Custom" stays picked while its crest factor happens to equal a preset's (until another is picked).
  const [custom, setCustom] = useState(false);
  const preset: SignalPreset = custom ? "custom" : presetOf(signal.crest_dB);
  return (
    <div className="program-body">
      <FieldRow label="Program signal">
        {(id) => <Switch id={id} checked={signal.program} onChange={(program) => onChange({ ...signal, program })} />}
      </FieldRow>
      <FieldRow label="Signal">
        {(id) => (
          <Select<SignalPreset>
            id={id}
            value={preset}
            options={[...SIGNAL_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: "custom", label: "Custom" }]}
            onChange={(v) => {
              setCustom(v === "custom");
              const p = SIGNAL_PRESETS.find((x) => x.id === v);
              onChange({ ...signal, program: true, ...(p ? { crest_dB: p.crest_dB } : {}) });
            }}
          />
        )}
      </FieldRow>
      <FieldRow label="Crest factor">
        {(id) => (
          <NumberField
            id={id}
            value={Number(fmtCrest(signal.crest_dB))}
            unit="dB"
            min={3}
            max={CREST_MAX}
            placeholder="3–20"
            onChange={(v) => {
              if (v === undefined) return;
              setCustom(true);
              onChange({ ...signal, program: true, crest_dB: clampCrest(v) });
            }}
          />
        )}
      </FieldRow>
      <FieldRow label="Target SPL">
        {(id) => (
          <NumberField
            id={id}
            value={signal.target_dB ?? undefined}
            unit="dB"
            min={TARGET_MIN}
            max={TARGET_MAX}
            placeholder="None"
            onChange={(v) => onChange({ ...signal, target_dB: v === undefined ? null : clampTarget(v) })}
          />
        )}
      </FieldRow>
      <p className="hint">{HINT}</p>
    </div>
  );
}
