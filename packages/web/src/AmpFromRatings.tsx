import { useState } from "react";
import { ampLimitsFromRatings } from "./ampRating.ts";
import { Num } from "./components.tsx";
import { Chip, Disclosure } from "./ui/index.ts";

/**
 * Settings: work out the amplifier's voltage and current limits from two of its datasheet
 * ratings (watts into ohms), the way they're printed, instead of asking for volts and amps.
 */
export function AmpFromRatings(props: { onUse: (limits: { volts: number; amps: number }) => void }) {
  const [a, setA] = useState({ watts: 0, ohms: 4 });
  const [b, setB] = useState({ watts: 0, ohms: 2 });
  const limits = ampLimitsFromRatings([a, b]);
  return (
    <Disclosure title="From the amp's ratings" value={limits ? `${limits.volts} V · ${limits.amps} A` : ""}>
      <Num help="The amplifier's rated power (RMS, per channel, or bridged if you'll bridge it) into a higher impedance, e.g. 350 W into 4 Ω." label="Rated" unit="W" value={a.watts} min={0} zeroText="e.g. 350" onChange={(watts) => setA({ ...a, watts })} />
      <Num help="The impedance of that rating." label="into" unit="Ω" value={a.ohms} min={0} onChange={(ohms) => setA({ ...a, ohms })} />
      <Num help="Its rating into the lowest impedance it's rated for, e.g. 550 W into 2 Ω. Leave blank if it only has one." label="and" unit="W" value={b.watts} min={0} zeroText="e.g. 550" onChange={(watts) => setB({ ...b, watts })} />
      <Num help="The impedance of that rating." label="into" unit="Ω" value={b.ohms} min={0} onChange={(ohms) => setB({ ...b, ohms })} />
      <p className="hint">The voltage comes from the higher-impedance rating (√(W×Ω)), the current from the lowest (√(W÷Ω)).</p>
      <div className="st-actions">{limits ? <Chip onClick={() => props.onUse(limits)}>{`Use ${limits.volts} V and ${limits.amps} A`}</Chip> : <Chip>Use</Chip>}</div>
    </Disclosure>
  );
}
