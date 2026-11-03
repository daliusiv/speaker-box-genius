import { useState } from "react";
import {
  addedMassResult,
  fitImpedance,
  parseImpedance,
  type FitResult,
  type ImpedanceData,
  type TsValues,
} from "@sbg/engine";
import { Card, Num, Select } from "./components.tsx";

type CoilModel = "le" | "lr2";
/** L2R2 keeps fs, Qms and Qes from the fit around the resonance, so the T/S values don't depend on the coil model. */
const fit = (d: ImpedanceData, reDc: number, coil: CoilModel) =>
  fitImpedance(d, reDc > 0 ? reDc : undefined, { inductance: coil, holdTs: true });

export interface Measurement {
  name: string;
  data: ImpedanceData;
  fit: FitResult;
}

interface Props {
  measurement: Measurement | null;
  onMeasurement: (m: Measurement | null) => void;
  /** Hide the panel (and drop the measurement). */
  onClose: () => void;
  /** Current Sd, needed to turn an added-mass result into Vas. */
  sd_cm2: number | undefined;
  onUse: (ts: TsValues, coil: { le_mh: number; l2_mh: number; r2_ohm: number }) => void;
}

async function readFile(f: File): Promise<string> {
  return new TextDecoder("latin1").decode(await f.arrayBuffer());
}

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/**
 * Load a free-air impedance sweep (DATS, REW, ARTA, … as .zma/.txt/.csv), fit the
 * T/S parameters, and optionally get Vas from a second sweep with added mass.
 */
export function MeasurePanel(props: Props) {
  const [reDc, setReDc] = useState(0);
  const [coil, setCoil] = useState<CoilModel>("lr2");
  const [msg, setMsg] = useState("");
  const [mass, setMass] = useState(20);
  const [massFit, setMassFit] = useState<FitResult | null>(null);
  const [sd, setSd] = useState<number | null>(null);
  const m = props.measurement;
  const sdUsed = sd ?? props.sd_cm2;

  const load = async (f: File) => {
    try {
      const data = parseImpedance(await readFile(f));
      props.onMeasurement({ name: f.name, data, fit: fit(data, reDc, coil) });
      setMassFit(null);
      setMsg("");
    } catch (e) {
      setMsg(`${f.name}: ${(e as Error).message}`);
    }
  };

  const refit = (re: number, c: CoilModel) => {
    setReDc(re);
    setCoil(c);
    if (m) props.onMeasurement({ ...m, fit: fit(m.data, re, c) });
  };

  const loadMass = async (f: File) => {
    try {
      // Only fs matters here, so the plain fit is enough.
      setMassFit(fitImpedance(parseImpedance(await readFile(f)), reDc > 0 ? reDc : undefined));
      setMsg("");
    } catch (e) {
      setMsg(`${f.name}: ${(e as Error).message}`);
    }
  };

  let added: ReturnType<typeof addedMassResult> | null = null;
  let addedErr = "";
  if (m && massFit) {
    try {
      added = addedMassResult(m.fit.fs, massFit.fs, mass, sdUsed);
    } catch (e) {
      addedErr = (e as Error).message;
    }
  }

  const use = () => {
    if (!m) return;
    const f = m.fit;
    const ts: TsValues = {
      fs: round(f.fs, 2),
      qms: round(f.qms, 3),
      qes: round(f.qes, 3),
      re: round(f.re, 2),
    };
    if (sdUsed !== undefined) ts.sd_cm2 = sdUsed;
    if (added) {
      ts.mms_g = round(added.mms_g, 2);
      if (added.vas_l === undefined) ts.cms_mm_per_n = round(added.cms_mm_per_n, 4);
    }
    const lr2 = f.l2_mh !== undefined && f.r2_ohm !== undefined;
    props.onUse(ts, {
      le_mh: round(f.le_mh, 3),
      l2_mh: lr2 ? round(f.l2_mh!, 3) : 0,
      r2_ohm: lr2 ? round(f.r2_ohm!, 2) : 0,
    });
  };

  return (
    <Card title="Measure from an impedance sweep">
      <p className="hint">
        Load a free-air sweep from DATS, REW, ARTA, etc. (.zma, .txt or .csv: frequency, ohms and phase if you have it).
      </p>
      <div className="fields">
        <Num label="Re (DC)" unit="Ω" value={reDc} min={0} onChange={(re) => refit(re, coil)} />
        <Select<CoilModel>
          label="Coil model"
          value={coil}
          options={[
            { value: "lr2", text: "Le + L2/R2 (fits the whole sweep)" },
            { value: "le", text: "Le only (like WinISD)" },
          ]}
          onChange={(c) => refit(reDc, c)}
        />
      </div>
      <p className="hint">
        Re (DC): optional, your meter's reading; leave at 0 to fit it. Le + L2/R2 follows the impedance rise of real
        voice coils up to 20 kHz; Fs, Qms and Qes come out the same either way.
      </p>
      <div className="row">
        <label className="file-button secondary">
          {m ? "Load a different sweep" : "Load free-air sweep"}
          <input type="file" accept=".zma,.txt,.csv,.dat,.frd" hidden onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) load(f);
            e.currentTarget.value = "";
          }} />
        </label>
        <button className="secondary" onClick={props.onClose}>
          Close
        </button>
      </div>
      {msg && <p className="warn">{msg}</p>}

      {m && (
        <>
          <table className="breakdown">
            <tbody>
              <tr><th>Fs</th><td>{m.fit.fs.toFixed(2)} Hz</td></tr>
              <tr><th>Qms</th><td>{m.fit.qms.toFixed(3)}</td></tr>
              <tr><th>Qes</th><td>{m.fit.qes.toFixed(3)}</td></tr>
              <tr><th>Qts</th><td>{m.fit.qts.toFixed(3)}</td></tr>
              <tr><th>Re</th><td>{m.fit.re.toFixed(2)} Ω{reDc > 0 ? " (fixed)" : ""}</td></tr>
              <tr><th>Le</th><td>{m.fit.le_mh.toFixed(3)} mH</td></tr>
              {m.fit.l2_mh !== undefined && m.fit.r2_ohm !== undefined && (
                <>
                  <tr><th>L2</th><td>{m.fit.l2_mh.toFixed(3)} mH</td></tr>
                  <tr><th>R2</th><td>{m.fit.r2_ohm.toFixed(2)} Ω</td></tr>
                </>
              )}
              <tr className="total"><th>Fit error</th><td>{pct(m.fit.rmsError)}</td></tr>
            </tbody>
          </table>
          <p className="hint">
            {m.name}: fitted {m.fit.range[0].toFixed(0)}–{m.fit.range[1].toFixed(0)} Hz using{" "}
            {m.fit.usedPhase ? "magnitude and phase" : "magnitude only"}. It's shown dashed on the impedance chart.
            {m.fit.rmsError > 0.05 && " The fit error is high: check the sweep is free-air and covers the resonance."}
          </p>

          <h3>Vas by added mass (optional)</h3>
          <div className="fields">
            <Num label="Mass" unit="g" value={mass} onChange={setMass} />
            <Num label="Sd" unit="cm²" value={sdUsed ?? 0} min={0} onChange={(v) => setSd(v > 0 ? v : null)} />
          </div>
          <div className="row">
            <label className="file-button secondary">
              {massFit ? "Load a different added-mass sweep" : "Load sweep with mass added"}
              <input type="file" accept=".zma,.txt,.csv,.dat,.frd" hidden onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) loadMass(f);
                e.currentTarget.value = "";
              }} />
            </label>
          </div>
          {massFit && added && (
            <p className="hint">
              Fs with mass {massFit.fs.toFixed(2)} Hz → Mms {added.mms_g.toFixed(1)} g, Cms {added.cms_mm_per_n.toFixed(3)} mm/N
              {added.vas_l !== undefined ? `, Vas ${added.vas_l.toFixed(1)} L` : ". Enter Sd to get Vas."}
            </p>
          )}
          {addedErr && <p className="warn">{addedErr}</p>}

          <div className="row">
            <button onClick={use}>Use these values</button>
          </div>
          <p className="hint">
            Replaces the driver's Fs, Qms, Qes, Re and Le{m.fit.l2_mh !== undefined ? " (with L2 and R2)" : ""}{added ? ", and adds Mms from the added-mass test" : ""}. Without an
            added-mass sweep, keep the datasheet's Vas or Sd and Mms so the editor can work out the rest.
          </p>
        </>
      )}
    </Card>
  );
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));
