import { useEffect, useState } from "react";
import {
  parseDatasheet,
  parseQuantity,
  TS_PARAMS,
  type Quantity,
  type SolveResult,
  type TsParam,
  type TsValues,
} from "@sbg/engine";
import { DATASHEET_TOLERANCE, splitConflicts } from "./datasheetCheck.ts";

const QUANTITY: Record<TsParam, Quantity> = {
  fs: "plain",
  qms: "plain",
  qes: "plain",
  qts: "plain",
  vas_l: "volume",
  re: "plain",
  sd_cm2: "area",
  mms_g: "mass",
  cms_mm_per_n: "compliance",
  bl: "plain",
  rms: "plain",
};

/** What each T/S parameter is, for the help strip. */
const TS_HELP: Record<TsParam, string> = {
  fs: "Free-air resonance: the frequency the cone bounces at on its own, out of a box. Lower usually means deeper bass is possible.",
  qts: "Total Q: how damped that resonance is (Qms and Qes together). Below ~0.4 suits ported boxes, 0.4–0.7 sealed, higher needs a big box or open baffle.",
  qms: "Mechanical Q: the damping from the suspension's own losses. Usually 2–10.",
  qes: "Electrical Q: the damping from the motor (magnet and coil). Usually much lower than Qms, so it sets most of Qts.",
  vas_l: "Equivalent compliance volume: the air volume as springy as the suspension. Bigger Vas usually needs a bigger box.",
  re: "DC resistance of the voice coil (measure it with a meter). Lower than the nominal impedance.",
  sd_cm2: "Effective cone area (including about a third of the surround). More area moves more air for the same excursion.",
  mms_g: "Moving mass: cone, coil and the air load moving with them.",
  cms_mm_per_n: "Suspension compliance: how far the cone moves per newton of force. The springier, the higher.",
  bl: "Motor strength: force per amp of coil current (tesla-metres). Higher Bl means more control and efficiency.",
  rms: "Mechanical resistance: the suspension's losses (kg/s). Goes with Qms.",
};

const ORDER: TsParam[] = ["fs", "qts", "qms", "qes", "vas_l", "re", "sd_cm2", "mms_g", "cms_mm_per_n", "bl", "rms"];

function fmt(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  return Number(v.toPrecision(3)).toString();
}

export interface Extras {
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
}

/**
 * T/S parameter editor. Typed values are "entered" (bold, never changed by the
 * app). Everything else is derived and shown greyed out as a placeholder.
 */
export function TsEditor(props: {
  entered: TsValues;
  solved: SolveResult;
  onChange: (ts: TsValues) => void;
  onPaste: (ts: TsValues, extras: Extras) => void;
  /** The datasheet paste box is opened from the driver card's menu. */
  pasting: boolean;
  onPastingChange: (open: boolean) => void;
  /** The values as published in the database, while they're untouched (milder checks). */
  published?: TsValues;
}) {
  const { pasting, onPastingChange: setPasting } = props;
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const { solved } = props;
  const { warn, rounding, worst } = splitConflicts(props.entered, props.published, solved.conflicts);
  const fromDatasheet = rounding.length > 0 || warn.length !== solved.conflicts.length;

  const setParam = (p: TsParam, v: number | undefined) => {
    const next = { ...props.entered };
    if (v === undefined) delete next[p];
    else next[p] = v;
    props.onChange(next);
  };

  const applyPaste = () => {
    const parsed = parseDatasheet(pasteText);
    const ts: TsValues = {};
    for (const p of ORDER) if (parsed[p] !== undefined) ts[p] = parsed[p];
    const n = Object.keys(ts).length;
    if (n === 0) {
      setPasteMsg("No parameters recognised. Try one parameter per line, like “Fs 25.6 Hz”.");
      return;
    }
    props.onPaste(ts, { le_mh: parsed.le_mh, xmax_mm: parsed.xmax_mm, pe_w: parsed.pe_w });
    setPasteMsg("");
    setPasteText("");
    setPasting(false);
  };

  return (
    <div className="ts-editor">
      <div className="fields">
        {ORDER.map((p) => (
          <TsField
            key={p}
            param={p}
            entered={props.entered[p]}
            derived={solved.source[p] === "derived" ? solved.values[p] : undefined}
            conflict={warn.some((c) => c.param === p)}
            onChange={(v) => setParam(p, v)}
          />
        ))}
      </div>

      <p className="hint">
        <b>Bold, orange edge</b> = what you typed (never changed). <span className="derived-sample">Grey, dashed</span> = calculated. Units
        like “1.9 ft³” or “35630 mm²” are converted.
      </p>

      {solved.missing.length > 0 && (
        <p className="warn">
          Still needed to simulate: {solved.missing.map((p) => TS_PARAMS[p].label).join(", ")} (or enough other
          parameters to work them out).
        </p>
      )}
      {warn.length > 0 && (
        <div className="conflicts">
          <p>
            {fromDatasheet ? (
              <>
                <b>The manufacturer's values disagree by more than {Math.round(DATASHEET_TOLERANCE * 100)}%.</b> Check
                them against the datasheet. The simulation uses Fs, Qms, Qes, Vas, Re and Sd.
              </>
            ) : (
              <>
                <b>These values disagree.</b> Datasheets often differ by a few percent. The simulation uses Fs, Qms,
                Qes, Vas, Re and Sd.
              </>
            )}
          </p>
          <ul>
            {warn.map((c) => (
              <li key={c.relation + c.param}>
                {fromDatasheet ? c.message.replace("you entered", "published") : c.message}{" "}
                <button className="link" onClick={() => setParam(c.param, undefined)}>
                  Use calculated
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rounding.length > 0 && warn.length === 0 && (
        <details className="datasheet-note">
          <summary>
            The manufacturer's published values differ by up to {(worst * 100).toFixed(1)}%, which is normal for
            datasheets (they round their figures). The simulation uses Fs, Qms, Qes, Vas, Re and Sd.
          </summary>
          <ul>
            {rounding.map((c) => (
              <li key={c.relation + c.param}>{c.message.replace("you entered", "published")}</li>
            ))}
          </ul>
        </details>
      )}

      {pasting && (
        <div className="paste">
          <textarea
            rows={7}
            autoFocus
            aria-label="Datasheet text"
            value={pasteText}
            onChange={(e) => setPasteText(e.currentTarget.value)}
            placeholder={"Paste the spec table from a datasheet or shop page, e.g.\nFs 25.6 Hz\nVas 1.9 ft³\nSd 356.3 cm²\nXmax 12.3 mm"}
          />
          <div className="row">
            <button onClick={applyPaste}>Use these values</button>
            <button className="secondary" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
          {pasteMsg && <p className="warn">{pasteMsg}</p>}
        </div>
      )}
    </div>
  );
}

function TsField(props: {
  param: TsParam;
  entered: number | undefined;
  derived: number | undefined;
  conflict: boolean;
  onChange: (v: number | undefined) => void;
}) {
  const meta = TS_PARAMS[props.param];
  const [text, setText] = useState(props.entered !== undefined ? String(props.entered) : "");
  const [bad, setBad] = useState(false);

  // Follow external changes (loading a driver, paste, clear).
  useEffect(() => {
    const current = text.trim() === "" ? undefined : parseQuantity(text, QUANTITY[props.param]);
    if (current !== props.entered) {
      setText(props.entered !== undefined ? String(props.entered) : "");
      setBad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.entered]);

  return (
    <label
      className={props.conflict ? "conflict" : undefined}
      data-help={`${TS_HELP[props.param]} Type any values from the datasheet in any order; the rest are calculated (grey).`}
    >
      <span>{meta.label}</span>
      <span className={`ts-input${props.entered !== undefined ? " has-clear" : ""}`}>
        <input
          inputMode="decimal"
          className={`${props.entered !== undefined ? "entered" : "derived"}${bad ? " bad" : ""}`}
          value={text}
          placeholder={props.derived !== undefined ? fmt(props.derived) : "–"}
          onChange={(e) => {
            const t = e.currentTarget.value;
            setText(t);
            if (t.trim() === "") {
              setBad(false);
              props.onChange(undefined);
              return;
            }
            const v = parseQuantity(t, QUANTITY[props.param]);
            const ok = v !== null && v > 0;
            setBad(!ok);
            if (ok) props.onChange(v);
          }}
        />
        {props.entered !== undefined && (
          <button
            className="clear"
            title={`Clear ${meta.label} (let it be calculated)`}
            aria-label={`Clear ${meta.label}`}
            // Mouse convenience: keyboard users can simply delete the text, so keep it out of the tab order.
            tabIndex={-1}
            // Keep focus in the field: on phones the button only shows while the field has focus,
            // and moving focus away would hide it before the tap lands.
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => props.onChange(undefined)}
          >
            ×
          </button>
        )}
      </span>
      <span className="unit">{meta.unit}</span>
    </label>
  );
}
