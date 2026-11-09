import { useState } from "react";
import { ampLimitsFromRatings } from "./ampRating.ts";
import { Num } from "./components.tsx";

/**
 * Settings: work out the amplifier's voltage and current limits from two of its datasheet
 * ratings (watts into ohms), the way they're printed, instead of asking for volts and amps.
 */
export function AmpFromRatings(props: { onUse: (limits: { volts: number; amps: number }) => void }) {
  const [a, setA] = useState({ watts: 0, ohms: 4 });
  const [b, setB] = useState({ watts: 0, ohms: 2 });
  const limits = ampLimitsFromRatings([a, b]);
  return (
    <details className="more full amp-ratings">
      <summary>Work these out from the amp&rsquo;s ratings</summary>
      <div className="fields">
        <Num help="The amplifier's rated power (RMS, per channel, or bridged if you'll bridge it) into a higher impedance, e.g. 350 W into 4 Ω." label="Rated" unit="W" value={a.watts} min={0} zeroText="e.g. 350" onChange={(watts) => setA({ ...a, watts })} />
        <Num help="The impedance of that rating." label="into" unit="Ω" value={a.ohms} min={0} onChange={(ohms) => setA({ ...a, ohms })} />
        <Num help="Its rating into the lowest impedance it's rated for, e.g. 550 W into 2 Ω. Leave blank if it only has one." label="and" unit="W" value={b.watts} min={0} zeroText="e.g. 550" onChange={(watts) => setB({ ...b, watts })} />
        <Num help="The impedance of that rating." label="into" unit="Ω" value={b.ohms} min={0} onChange={(ohms) => setB({ ...b, ohms })} />
      </div>
      <p className="hint">
        A rating into a resistor is a voltage and a current at once: the voltage comes from the higher-impedance rating (√(W×Ω)), the current from the
        lowest (√(W÷Ω)).{" "}
        <button className="chip" disabled={!limits} onClick={() => limits && props.onUse(limits)}>
          {limits ? `Use ${limits.volts} V and ${limits.amps} A` : "Use"}
        </button>
      </p>
    </details>
  );
}
