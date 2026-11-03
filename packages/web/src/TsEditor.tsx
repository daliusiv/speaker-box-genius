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
}) {
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const { solved } = props;

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
            conflict={solved.conflicts.some((c) => c.param === p)}
            onChange={(v) => setParam(p, v)}
          />
        ))}
      </div>

      <p className="hint">
        <b>Bold</b> = what you typed (never changed). <span className="derived-sample">Grey</span> = calculated. Units
        like “1.9 ft³” or “35630 mm²” are converted.
      </p>

      {solved.missing.length > 0 && (
        <p className="warn">
          Still needed to simulate: {solved.missing.map((p) => TS_PARAMS[p].label).join(", ")} (or enough other
          parameters to work them out).
        </p>
      )}
      {solved.conflicts.length > 0 && (
        <div className="conflicts">
          <p>
            <b>These values disagree.</b> Datasheets often differ by a few percent. The simulation uses Fs, Qms, Qes,
            Vas, Re and Sd.
          </p>
          <ul>
            {solved.conflicts.map((c) => (
              <li key={c.relation + c.param}>
                {c.message}{" "}
                <button className="link" onClick={() => setParam(c.param, undefined)}>
                  Use calculated
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row">
        <button className="secondary" onClick={() => setPasting(!pasting)}>
          {pasting ? "Cancel paste" : "Paste from datasheet"}
        </button>
        <button className="secondary" onClick={() => props.onChange({})}>
          Clear all
        </button>
      </div>
      {pasting && (
        <div className="paste">
          <textarea
            rows={7}
            value={pasteText}
            onChange={(e) => setPasteText(e.currentTarget.value)}
            placeholder={"Paste the spec table from a datasheet or shop page, e.g.\nFs 25.6 Hz\nVas 1.9 ft³\nSd 356.3 cm²\nXmax 12.3 mm"}
          />
          <button onClick={applyPaste}>Use these values</button>
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
    <label className={props.conflict ? "conflict" : undefined}>
      <span>{meta.label}</span>
      <span className="ts-input">
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
