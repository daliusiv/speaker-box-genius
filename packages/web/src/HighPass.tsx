import { Num, Select } from "./components.tsx";
import type { AppState } from "./state.ts";
import { Section, helpEntries } from "./ui/index.ts";

/** What each field of this row does: the fields' help and the row's ⓘ sheet (fields that only show after a choice too). */
const HELP: Record<string, string> = {
  "Filter": "A high-pass (subsonic) filter in front of the amplifier, on every design: it protects ported and PR boxes from over-excursion below tuning. Butterworth is maximally flat; Linkwitz-Riley is the usual crossover shape (−6 dB at the corner).",
  "Slope": "How steeply the filter cuts below its frequency: 12 dB/oct is gentle, 24 dB/oct protects a ported box much better.",
  "Freq": "Corner frequency of the high-pass (subsonic) filter. A few Hz below a ported box's tuning keeps the cone from flapping below it.",
};

type HighPass = AppState["highPass"];
type HighPassType = HighPass["type"];

const TYPE: Record<HighPassType, string> = { butterworth: "Butterworth", "linkwitz-riley": "Linkwitz-Riley" };

/** The high-pass (subsonic) filter in front of the amplifier, on every design. */
export function HighPassSection(props: { value: HighPass; onChange: (hp: HighPass) => void }) {
  const hp = props.value;
  return (
    <Section help={helpEntries(HELP)} icon="highPass" title="High-pass" value={hp.on ? `${TYPE[hp.type]} ${hp.order * 6} dB/oct · ${hp.freq} Hz` : "Off"}>
      <Select<HighPassType | "off">
        help={HELP["Filter"]}
        label="Filter"
        value={hp.on ? hp.type : "off"}
        options={[
          { value: "off", text: "Off" },
          { value: "butterworth", text: "Butterworth" },
          { value: "linkwitz-riley", text: "Linkwitz-Riley" },
        ]}
        onChange={(type) =>
          props.onChange(type === "off" ? { ...hp, on: false } : { ...hp, on: true, type, order: type === "linkwitz-riley" && hp.order % 2 ? hp.order + 1 : hp.order })
        }
      />
      {hp.on && (
        <>
          <Select<number>
            help={HELP["Slope"]}
            label="Slope"
            value={hp.order}
            options={(hp.type === "butterworth" ? [1, 2, 3, 4] : [2, 4]).map((o) => ({ value: o, text: `${o * 6} dB/oct` }))}
            onChange={(order) => props.onChange({ ...hp, order })}
          />
          <Num help={HELP["Freq"]} label="Freq" unit="Hz" value={hp.freq} onChange={(freq) => props.onChange({ ...hp, freq })} />
        </>
      )}
      {!hp.on && <p className="hint">A subsonic filter protects ported and PR boxes from over-excursion below tuning.</p>}
    </Section>
  );
}
