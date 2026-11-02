import { useEffect, useState } from "react";
import { qts, sealedAlignment } from "@sbg/engine";

const REPO = "https://github.com/daliusiv/speaker-box-genius";

interface DbIndex {
  drivers: unknown[];
  passiveRadiators: unknown[];
  brands: Record<string, unknown>;
}

/** Placeholder home page: proves the build, the engine import and the DB bundle all work end to end. */
export function App() {
  const [db, setDb] = useState<DbIndex | null>(null);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}db/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDb)
      .catch(() => setDbError(true));
  }, []);

  return (
    <main>
      <header>
        <h1>Speaker Box Genius</h1>
        <p className="tagline">A modern, browser-based enclosure and passive radiator simulator.</p>
        <p className="status">
          🚧 Early development. Follow along or help out on <a href={REPO}>GitHub</a>.
        </p>
      </header>

      <SealedDemo />

      <section>
        <h2>Driver database</h2>
        {db ? (
          <p>
            {db.drivers.length} drivers and {db.passiveRadiators.length} passive radiators from{" "}
            {Object.keys(db.brands).length} brands so far.{" "}
            <a href={`${REPO}/issues/new?template=new-driver.yml`}>Add one</a>.
          </p>
        ) : dbError ? (
          <p>Couldn't load the database.</p>
        ) : (
          <p>Loading…</p>
        )}
      </section>

      <footer>
        Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a> ·{" "}
        <a href={`${REPO}/blob/main/docs/build-plan.md`}>Roadmap</a>
      </footer>
    </main>
  );
}

function NumberField(props: { label: string; unit: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value}
        step={props.step}
        min={0}
        onChange={(e) => {
          const v = e.currentTarget.valueAsNumber;
          if (Number.isFinite(v) && v > 0) props.onChange(v);
        }}
      />
      <span className="unit">{props.unit}</span>
    </label>
  );
}

function SealedDemo() {
  const [fs, setFs] = useState(30);
  const [qms, setQms] = useState(5.2);
  const [qes, setQes] = useState(0.4);
  const [vas, setVas] = useState(50);
  const [vb, setVb] = useState(40);
  const { fc, qtc } = sealedAlignment({ fs, qms, qes, vas_l: vas }, vb);

  return (
    <section>
      <h2>Sealed box quick calc</h2>
      <p className="hint">A first piece of the simulation engine. Full charts are coming.</p>
      <div className="fields">
        <NumberField label="Fs" unit="Hz" value={fs} step={0.1} onChange={setFs} />
        <NumberField label="Qms" unit="" value={qms} step={0.01} onChange={setQms} />
        <NumberField label="Qes" unit="" value={qes} step={0.01} onChange={setQes} />
        <NumberField label="Vas" unit="L" value={vas} step={0.1} onChange={setVas} />
        <NumberField label="Box Vb" unit="L" value={vb} step={0.5} onChange={setVb} />
      </div>
      <dl className="results">
        <dt>Driver Qts</dt>
        <dd>{qts(qms, qes).toFixed(3)}</dd>
        <dt>System Fc</dt>
        <dd>{fc.toFixed(1)} Hz</dd>
        <dt>System Qtc</dt>
        <dd>{qtc.toFixed(3)}</dd>
      </dl>
    </section>
  );
}
