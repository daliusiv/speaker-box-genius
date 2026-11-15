import { useState } from "react";
import { Select } from "./components.tsx";
import { Button, Card } from "./ui/index.ts";
import { DSP_FORMATS, DSP_RATES, dspFileFor, dspFiltersFor, type DspFormat } from "./dspExport.ts";
import type { AppState } from "./state.ts";

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Download the high-pass and EQ as biquads for a DSP or PC equaliser. */
export function DspExportPanel(props: { state: AppState; notify: (msg: string) => void }) {
  const { state } = props;
  const [format, setFormat] = useState<DspFormat>("apo");
  const [fs, setFs] = useState(48000);
  const designs = state.designs.filter((d) => d.on);
  const [pick, setPick] = useState("");
  const designId = designs.some((d) => d.id === pick) ? pick : (designs[0]?.id ?? "");
  const { hp, eq } = dspFiltersFor(state, designId);
  if (designs.length === 0) return null;

  const download = () => {
    const out = dspFileFor(state, designId, format, fs);
    if (typeof out === "string") return props.notify(out);
    const url = URL.createObjectURL(new Blob([out.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = out.name;
    a.click();
    URL.revokeObjectURL(url);
    props.notify(`Saved ${out.name}.`);
  };

  return (
    <Card title="Export to DSP" flush>
      <div className="sg-body">
        {designs.length > 1 && (
          <Select<string> help="EQ can be aimed at one design, so the filters are exported per design."
            label="Design"
            value={designId}
            options={designs.map((d) => ({ value: d.id, text: d.name }))}
            onChange={setPick}
          />
        )}
        <Select<DspFormat> help={DSP_FORMATS.find((f) => f.value === format)!.help} label="Format" value={format} options={DSP_FORMATS} onChange={setFormat} />
        <Select<number> help="The coefficients only fit the sample rate they were made for: use your DSP's."
          label="Sample rate"
          value={fs}
          options={DSP_RATES.map((r) => ({ value: r, text: `${r / 1000} kHz` }))}
          onChange={setFs}
        />
      <p className="hint">
        {hp || eq.length > 0
          ? `${capital([hp ? "the high-pass" : "", eq.length ? `${eq.length} EQ stage${eq.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and "))} as biquads. ${format === "apo" || format === "camilla" ? "A gain cut in front keeps any boost from clipping. " : ""}Not in it: the passive crossover (that's parts, not DSP), and room gain and baffle step (the room and cabinet do those).`
          : "Turn on the high-pass or add EQ above to export it."}
      </p>
      <div className="sg-actions">
        <Button variant="primary" icon="download" disabled={!hp && eq.length === 0} onClick={download}>
          Download
        </Button>
      </div>
      </div>
    </Card>
  );
}
