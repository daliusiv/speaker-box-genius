import { useState, type ReactNode } from "react";
import { coilHeatFactor, DEFAULT_END_CORRECTION } from "@sbg/engine";
import { AmpFromRatings } from "./AmpFromRatings.tsx";
import { COMPAT, COMPAT_NAMES, compatOf, nearestCompat, withCompat, type CompatPreset } from "./compat.ts";
import { Num, Select } from "./components.tsx";
import { airLimitOf, airOf, PORT_LIMIT, portLimitOf } from "./sim.ts";
import { END_CORRECTION_MAX, NO_LOSS, qText, type AppState, type Settings } from "./state.ts";
import { Card, Chip, FieldRow, helpEntries, RadioCards, Section, Segmented, Switch } from "./ui/index.ts";
import { browserAskedNotToTrack, setUsageStats, track, trackOnce, usageStatsOn } from "./telemetry.ts";

/** My conditions' fields: their help and the Air row's ⓘ sheet (they only show after choosing My conditions). */
const AIR_HELP: Record<string, string> = {
  "Temperature": "Air temperature where the speaker plays. Colder air is denser and carries sound more slowly: the box acts a little bigger and the tuning drops.",
  "Humidity": "Relative humidity. Damp air is slightly lighter, with slightly faster sound: a small effect.",
  "Pressure": "Air pressure: 1013 hPa at sea level, about 12 hPa less for every 100 m up (a weather app shows today's). Thinner air carries less sound.",
};

/** The program a choice matches, as the option card's chip. */
/** The full "About" texts, as the help of each row's info line. */
const ABOUT = {
  box: "Box losses are Q values at the tuning frequency: lower means more loss. 10 / 100 / 100 matches WinISD’s defaults. A bandpass can also set its own losses for each chamber; a sealed, ported or passive radiator design can set its own leakage (Leakage) and, with Stuffing set, uses that stuffing’s Qa. For like-for-like checks against WinISD, choose its air values (Amp + cable is already WinISD’s 0.1 Ω) and leave out Le, or simply import the WinISD project (.wpr). OpenISD projects (.owpr) import too, with their own air and losses.",
  port: "A port is also a pipe open at both ends, resonating at about c / 2L (a 40 cm port near 380 Hz) and letting midrange out as a narrow peak. “Pipe” draws those resonances (charts then run to 1 kHz); in the bass it matches the air-mass model within a few tenths of a dB. Vented boxes only; the box’s own standing waves, which drive the port hardest when they coincide, aren’t simulated. The chuffing line (17 m/s by default) applies to whichever port-speed convention you pick. 17 m/s peak keeps a hi-fi port quiet; flared ports tolerate more, and car SPL builds often accept 25–30 m/s for a little port noise at full power.",
  spl: "Hornresp works SPL out from the power each cone, port or mouth radiates. That matches the in-front-of-the-box SPL in the bass and reads lower once a source is large next to the wavelength: for a 10″ cone about 0.2 dB at 300 Hz and 0.6 dB at 500 Hz, twice that for two side by side, and about 1.5 dB at 500 Hz for an 850 cm² horn mouth. WinISD uses the in-front SPL. A line’s mouth distance and a box’s port or PR position follow the same choice: in front of the box their sound arrives later than the cone’s, at the same level (phase and group delay too, as VituixCAD shows a rear port); from radiated power it’s the distance between the two, as Hornresp’s Acoustic Path Length (level only). For like-for-like checks against Hornresp, pick its air and “From radiated power” (or the Hornresp preset), and set the drive to 2.83 V.",
  air: "The air in a box is a spring that stiffens more when squeezed than it softens when stretched, so a big cone in a small box adds 2nd harmonic. The Air distortion chart shows it for sealed, ported, passive radiator and bandpass boxes, at the frequency of the note that makes it. It's a 2nd-order estimate from the box pressure, checked against a direct solution of the nonlinear equations; it's mostly 2nd harmonic, so it reads as THD too. Where the cone squeezes the air by more than 10 % of the box it's a rough estimate, and past 20 % outside the model. It's the air only. The driver's own distortion (Bl and suspension non-linearity) isn't modelled and is usually larger, so a low figure here doesn't mean a clean box. Lines and horns: a strong wave steepens as it travels, so the air adds 2nd harmonic that grows with pressure, path length and frequency (Thuras, Jenkins and O’Neil, 1935). The chart shows it at the mouth, from the pressure along the path from the driver (or a tapped horn’s rear tap) on; it matches their tube and horn measurements. Inside a line the pressure is a standing wave, so it’s an estimate; above 25 % it’s rough, and past 50 % outside the model. Lines are taken as lossless inside, so in a long, narrow line it reads a little high.",
};

/** A short info line whose help holds the full explanation. */
function Info(props: { help: string; children: ReactNode }) {
  return (
    <p className="hint" data-help={props.help}>
      {props.children}
    </p>
  );
}

const like = (program: string): ReactNode => <Chip>{program}</Chip>;

const MATCH_TEXT: Record<CompatPreset, string> = {
  default: "This app's own: Le on, amp volts, standard air",
  winisd: "Its air, no Le, watts into coil + cable",
  hornresp: "Its air, piston load, pipe ports, radiated-power SPL",
  vituixcad: "No Le, leak lost, Qa grows the box, F3 from the peak",
};

function SwitchRow(props: { label: string; help: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <FieldRow label={props.label} help={props.help}>
      {(id) => (
        <span className="st-switch">
          <Switch id={id} checked={props.checked} onChange={props.onChange} disabled={props.disabled} />
        </span>
      )}
    </FieldRow>
  );
}

/**
 * The Settings tab: GENERAL (units, match a program), SIMULATION (the conventions Match sets,
 * grouped) and LIMITS (the redlines that describe your build), each setting a row that shows
 * its value while closed.
 */
export function SettingsPanel(props: {
  state: AppState;
  onChange: (s: Settings) => void;
  /** The driver's Re (with its voice-coil wiring), for the hot-coil line; undefined when unknown. */
  re?: number;
  /** Power set in watts the WinISD way: the amp limits get a note. */
  winisdWatts: boolean;
  /** What the amplifier sees across the driver bank (cold Re and the nominal impedance), for the amp power hint; null when unknown. */
  ampLoad?: { re: number; nominal: number } | null;
}) {
  const s = props.state.settings;
  const set = (patch: Partial<Settings>) => {
    for (const key of Object.keys(patch) as (keyof Settings)[]) trackOnce(`setting:${key}`, "setting_changed", { key });
    props.onChange({ ...s, ...patch });
  };
  const now = compatOf(s);
  const near = now ? null : nearestCompat(s);
  const ac = s.airConditions;
  const a = airOf(props.state);
  const st = props.state;
  const le = st.semi ? "Semi-inductance" : st.l2_mh > 0 && st.r2_ohm > 0 ? "Le + L2/R2" : "Le";
  const losses = s.losses;
  const ampValue = [s.ampVolts > 0 ? `${s.ampVolts} V` : "", s.ampAmps > 0 ? `${s.ampAmps} A` : "", s.ampWatts > 0 ? `${s.ampWatts} W` : ""].filter(Boolean).join(" · ") || "No limit";
  // The amp power limit in volts and amps into the nominal load (or the bank's Re when no nominal is known).
  const ampHint = (() => {
    const load = props.ampLoad;
    if (!(s.ampWatts > 0) || !load) return undefined;
    const r = load.nominal > 0 ? load.nominal : load.re;
    const ohms = Number(r.toPrecision(3));
    return `≈ ${Math.sqrt(s.ampWatts * r).toFixed(1)} V, ${Math.sqrt(s.ampWatts / r).toFixed(1)} A into the ${ohms} Ω ${load.nominal > 0 ? "nominal load" : "bank's Re"}`;
  })();
  const heat = coilHeatFactor(s.coilTemp_C);

  return (
    <div className="st-list">
      <Card title="General" flush>
        <div className="st-body">
          <FieldRow label="Units" help="Show lengths and volumes in metric (cm, L) or imperial (inches, ft³). Values are kept the same, only the display changes.">
            {(id) => (
              <Segmented<"metric" | "imperial">
                id={id}
                label="Units"
                value={s.units}
                options={[
                  { value: "metric", label: "Metric" },
                  { value: "imperial", label: "Imperial" },
                ]}
                onChange={(units) => set({ units })}
              />
            )}
          </FieldRow>
        </div>
        <Section icon="match" title="Match" value={now ? COMPAT[now].label : "Custom"}>
          <RadioCards<CompatPreset | "">
            legend="Match"
            value={now ?? ""}
            options={(Object.keys(COMPAT) as CompatPreset[]).map((id) => ({ value: id, title: COMPAT[id].label, description: MATCH_TEXT[id] }))}
            onChange={(id) => {
              if (!id) return;
              track("setting_changed", { key: "match", preset: id });
              props.onChange(withCompat(s, id));
            }}
          />
          {near && (
            <p className="hint">
              Custom: {COMPAT[near.id].label} except {near.differ.map((k) => COMPAT_NAMES[k]).join(", ")}.
            </p>
          )}
          <p className="hint">
            Sets the conventions that differ between programs (air, coil inductance, power rating, leaked air, cone air load, ports, SPL, F3, absorption, port sound), to compare like for like.
            Units, amplifier, box losses, coil temperature and limits are kept.
          </p>
        </Section>
      </Card>

      <Card title="Simulation" flush>
        <Section icon="amp" title="Amplifier & cable" value={`${s.rg} Ω · ${s.driveModel === "winisd" ? "coil + cable" : "amp volts"}`}>
          <Num help="Resistance of the amplifier output plus the speaker cable. It adds to Re: a little less output and a slightly higher Q. 0.1 Ω by default, as WinISD assumes, so responses and presets match it." label="Amp + cable" unit="Ω" value={s.rg} min={0} onChange={(rg) => set({ rg })} />
          <RadioCards<Settings["driveModel"]>
            legend="Watts"
            value={s.driveModel}
            options={[
              { value: "winisd", title: "Into coil + cable", description: "The watts heat the coil and the amp + cable resistance together; a hot coil takes the same watts", aside: like("WinISD") },
              { value: "circuit", title: "Amp volts from cold Re", description: "The watts set the amplifier's volts; the amp + cable takes its share", aside: like("Hornresp") },
            ]}
            onChange={(driveModel) => set({ driveModel })}
          />
          <RadioCards<Settings["thermalLimit"]>
            legend="Power rating vs"
            value={s.thermalLimit}
            options={[
              { value: "nominal", title: "V²/Re", description: "The driver's Pe is held against the voltage into Re", aside: like("WinISD") },
              { value: "real", title: "Real power", description: "What the driver actually takes: more volts allowed near resonance", aside: like("Hornresp") },
            ]}
            onChange={(thermalLimit) => set({ thermalLimit })}
          />
        </Section>

        <Section
          help={helpEntries(AIR_HELP)}
          icon="air"
          title="Air"
          value={
            s.air === "custom"
              ? `${ac.temp_C} °C · ${ac.humidity_pct} % · ${ac.pressure_hPa} hPa`
              : s.air === "standard"
                ? "Standard 20 °C"
                : s.air === "winisd"
                  ? "WinISD"
                  : "Hornresp"
          }
        >
          <RadioCards<Settings["air"]>
            legend="Air"
            value={s.air}
            options={[
              { value: "standard", title: "Standard", description: "20 °C: ρ 1.204, c 343.2" },
              { value: "winisd", title: "WinISD", description: "ρ 1.201, c 343.7" },
              { value: "hornresp", title: "Hornresp", description: "ρ 1.205, c 344" },
              { value: "custom", title: "My conditions", description: "Your temperature, humidity and pressure: a cold garage, a hot car, a house high up" },
            ]}
            onChange={(air) => set({ air })}
          />
          {s.air === "custom" && (
            <>
              <Num help={AIR_HELP["Temperature"]} label="Temperature" unit="°C" value={ac.temp_C} min={-40} onChange={(temp_C) => set({ airConditions: { ...ac, temp_C: Math.min(60, temp_C) } })} />
              <Num help={AIR_HELP["Humidity"]} label="Humidity" unit="%" value={ac.humidity_pct} min={0} onChange={(humidity_pct) => set({ airConditions: { ...ac, humidity_pct: Math.min(100, humidity_pct) } })} />
              <Num help={AIR_HELP["Pressure"]} label="Pressure" unit="hPa" value={ac.pressure_hPa} min={500} onChange={(pressure_hPa) => set({ airConditions: { ...ac, pressure_hPa: Math.min(1100, pressure_hPa) } })} />
              <p className="hint">
                ρ {a.rho.toFixed(3)} kg/m³, c {a.c.toFixed(1)} m/s
              </p>
            </>
          )}
        </Section>

        <Section icon="coil" title="Voice coil" value={`${s.inductance ? "Le on" : "Le off"} · ${s.coilTemp_C} °C`}>
          <RadioCards<"yes" | "no">
            legend="Coil inductance"
            value={s.inductance ? "yes" : "no"}
            options={[
              { value: "yes", title: le, description: le === "Le" ? "More realistic above ~100 Hz" : "Most realistic" },
              { value: "no", title: "Off", description: "No coil inductance", aside: like("WinISD") },
            ]}
            onChange={(x) => set({ inductance: x === "yes" })}
          />
          <Num
            label="Voice coil"
            unit="°C"
            value={s.coilTemp_C}
            min={20}
            help="Voice-coil temperature: 20 °C = the datasheet's cold values (like WinISD). A hot coil has a higher Re: less output, higher Q. Coils heat with sustained power, only a little at moderate levels but to 150 °C or more near their rated power; copper and aluminium both rise about 0.4 % per °C. This is power compression: the dB SPL view shows the lost output, the Relative view the change in shape (and F3)."
            onChange={(t) => set({ coilTemp_C: Math.min(250, Math.max(20, t)) })}
          />
          {s.coilTemp_C > 20 ? (
            <p className="hint">
              At {s.coilTemp_C} °C the coil&rsquo;s resistance is {Math.round((heat - 1) * 100)}% higher
              {props.re !== undefined ? ` (Re ${props.re.toFixed(2)} → ${(props.re * heat).toFixed(2)} Ω)` : ""}: about {(20 * Math.log10(heat)).toFixed(1)}&nbsp;dB less above the bass,
              and Qes (so the box&rsquo;s Q) rises by the same ratio.
            </p>
          ) : (
            <p className="hint">20 °C uses the datasheet&rsquo;s cold values. Coils heat with sustained power, to 150&nbsp;°C or more near their rated power: less output, higher Q.</p>
          )}
        </Section>

        <Section icon="box" title="Box" value={`Ql ${qText(losses.ql)} · Qa ${qText(losses.qa)} · Qp ${qText(losses.qp)}`}>
          <Select<Settings["alignments"]>
            help="How the presets size the box. Like WinISD: the boxes WinISD's new-project wizard gives. Its ported and passive radiator alignments (QB3, BB4/SBB4, C4/SC4) allow for a box that leaks a little; its sealed ones (Qtc 0.5, 0.577, 0.707) for the box's damping; both for its 0.1 Ω amplifier resistance. Textbook: Thiele's and Small's lossless equations (QB3 up to B4, Keele's alignment above it, and SQB3; Vb = Vas / ((Qtc/Qts)² − 1) sealed); their boxes come out a few per cent smaller (up to about 10 % ported, C4 much more at high Qts)."
            label="Box presets"
            value={s.alignments}
            options={[
              { value: "winisd", text: "Like WinISD" },
              { value: "textbook", text: "Textbook" },
            ]}
            onChange={(alignments) => set({ alignments })}
          />
          <Num help="Box leakage loss as a Q at the tuning frequency: lower means a leakier box. 10 is WinISD's default (a typical well-built box). It's the leak for every box without its own (a box card's Leakage row can set one). Clear it for no leak." label="Leak Ql" value={losses.ql} min={1} none={NO_LOSS} onChange={(ql) => set({ losses: { ...losses, ql } })} />
          <Num help="Absorption loss (stuffing, wall flex) as a Q: lower means more loss. 100 is WinISD's default (little stuffing). A design with its own Stuffing setting uses that setting's Qa instead. Clear it for no absorption." label="Absorb Qa" value={losses.qa} min={1} none={NO_LOSS} onChange={(qa) => set({ losses: { ...losses, qa } })} />
          <Num help="Port friction loss as a Q: lower means a lossier port. 100 is WinISD's default. Clear it for no port loss." label="Port Qp" value={losses.qp} min={1} none={NO_LOSS} onChange={(qp) => set({ losses: { ...losses, qp } })} />
          <RadioCards<Settings["leakage"]>
            legend="Leaked air"
            value={s.leakage}
            options={[
              { value: "radiates", title: "Heard", description: "It radiates as sound, as through a real gap", aside: like("WinISD") },
              { value: "absorbed", title: "Lost", description: "A pure loss: matters most for bandpass boxes away from their band", aside: like("Hornresp") },
            ]}
            onChange={(leakage) => set({ leakage })}
          />
          <RadioCards<"damping" | "volume">
            legend="Absorption"
            value={s.qaVolume ? "volume" : "damping"}
            options={[
              { value: "damping", title: "Damping only", description: "A loss; the box's volume unchanged", aside: like("WinISD") },
              { value: "volume", title: "Damping + bigger box", description: "Filling also makes the air act bigger: +1.4 % at Qa 100, +11 % at Qa 10", aside: like("VituixCAD") },
            ]}
            onChange={(x) => set({ qaVolume: x === "volume" })}
          />
          <RadioCards<Settings["coneLoad"]>
            legend="Cone air load"
            value={s.coneLoad}
            options={[
              { value: "mass", title: "Fixed mass", description: "Part of Mms at every frequency", aside: like("WinISD") },
              { value: "piston", title: "Piston", description: "A baffled piston's load: lighter and lossier higher up, shared by drivers side by side", aside: like("Hornresp") },
            ]}
            onChange={(coneLoad) => set({ coneLoad })}
          />
          <Info help={ABOUT.box}>
            Box losses are Q values at the tuning frequency: lower means more loss. 10 / 100 / 100 matches WinISD&rsquo;s defaults. A bandpass can set its own for each chamber.
          </Info>
        </Section>

        <Section icon="port" title="Ports" value={`${s.portModel === "pipe" ? "Pipe" : "Air mass"} · K ${s.endCorrection}`}>
          <RadioCards<Settings["portModel"]>
            legend="Ports"
            value={s.portModel}
            options={[
              { value: "lumped", title: "Air mass", description: "A slug of air", aside: like("WinISD") },
              { value: "pipe", title: "Pipe", description: "Also shows the port's own pipe resonances higher up (charts run to 1 kHz)", aside: like("Hornresp") },
            ]}
            onChange={(portModel) => set({ portModel })}
          />
          <SwitchRow label="Port compression" help="At high air speed a port loses output to turbulence. On estimates that loss at the current power (approximate). WinISD leaves it out." checked={s.portCompression} onChange={(portCompression) => set({ portCompression })} />
          <RadioCards<Settings["ventPlacement"]>
            legend="Port sound"
            value={s.ventPlacement}
            options={[
              { value: "own", title: "Where each box puts it", description: "Its Position: next to the driver unless set" },
              { value: "portLength", title: "From the port's far end", description: "Heard later by the port's length (a PR by the spacing of the centres)", aside: like("VituixCAD") },
            ]}
            onChange={(ventPlacement) => set({ ventPlacement })}
          />
          <Num
            help="How much longer than its physical length a port acts, as K × its diameter (a slot: the diameter of a circle of the same area). 0.732 is one end in the baffle and one free inside the box, like WinISD; 0.85 both ends flanged. A slot built along the box walls acts longer still, by an amount nobody can calculate well: leave 0.732 and use the slot's tuning range, or enter the K you measured on your own builds. Used for the ports of ported and bandpass boxes: their tuning, Set port length and sizing (transmission lines model their port ends themselves)."
            label="End correction K"
            unit="× Ø"
            value={s.endCorrection}
            min={0}
            onChange={(v) => set({ endCorrection: Number.isFinite(v) && v >= 0 ? Math.min(END_CORRECTION_MAX, v) : DEFAULT_END_CORRECTION })}
          />
          <Info help={ABOUT.port}>A port is also a pipe open at both ends, resonating at about c&nbsp;/&nbsp;2L (a 40&nbsp;cm port near 380&nbsp;Hz). Pipe draws those resonances.</Info>
        </Section>

        <Section icon="spl" title="SPL" value={`${s.lineSpl === "power" ? "Radiated power" : "In front"} · from ${s.f3From === "peak" ? "peak" : "passband"}`}>
          <RadioCards<Settings["lineSpl"]>
            legend="SPL"
            value={s.lineSpl}
            options={[
              { value: "on-axis", title: "In front of the box", description: "Cone, ports and mouths as point sources", aside: like("WinISD") },
              { value: "power", title: "From radiated power", description: "Reads lower once a source is large next to the wavelength", aside: like("Hornresp") },
            ]}
            onChange={(lineSpl) => set({ lineSpl })}
          />
          <RadioCards<Settings["f3From"]>
            legend="F3 from"
            value={s.f3From}
            options={[
              { value: "passband", title: "Passband", description: "A hump in the response doesn't move F3", aside: like("WinISD") },
              { value: "peak", title: "Response peak", description: "A box with a hump or a high Q gets a higher F3", aside: like("VituixCAD") },
            ]}
            onChange={(f3From) => set({ f3From })}
          />
          <Info help={ABOUT.spl}>The two match in the bass; from radiated power reads lower once a source is large next to the wavelength (about 0.6 dB at 500 Hz for a 10″ cone).</Info>
        </Section>
      </Card>

      <Card title="Limits" flush>
        <Section icon="limit" title="Amplifier" value={ampValue}>
          <Num help="The amplifier's maximum output voltage (RMS), as a limit on the Max SPL chart. Leave it blank for no limit." label="Max volts" zeroText="No limit" unit="V" value={s.ampVolts} min={0} onChange={(ampVolts) => set({ ampVolts: Math.max(0, ampVolts) })} />
          <Num help="The amplifier's maximum output current (RMS), as a limit on the Max SPL chart. Leave it blank for no limit." label="Max current" zeroText="No limit" unit="A" value={s.ampAmps} min={0} onChange={(ampAmps) => set({ ampAmps: Math.max(0, ampAmps) })} />
          <Num
            help="The amplifier's maximum output power (RMS), into whatever the speaker's impedance is at each frequency. Separate from the volts and current limits: the lowest of the three applies. Leave it blank for no limit."
            label="Max power"
            zeroText="No limit"
            unit="W"
            value={s.ampWatts}
            min={0}
            hint={ampHint}
            onChange={(w) => set({ ampWatts: !(w > 0) ? 0 : Math.min(10_000, Math.max(0.1, w)) })}
          />
          <AmpFromRatings onUse={(l) => set({ ampVolts: l.volts, ampAmps: l.amps })} />
          {props.winisdWatts && (
            <p className="hint">The power is in watts as WinISD counts them (into the coil and the amp + cable together, with a hot coil&rsquo;s Re), not an amplifier&rsquo;s rated watts. These limits are the amplifier&rsquo;s real volts, amps and watts.</p>
          )}
        </Section>

        <Section
          icon="wind"
          title="Port speed & excursion"
          value={`${portLimitOf(props.state)} m/s ${s.velocity === "rms" ? "RMS" : "peak"} · excursion ${s.excursion === "pp" ? "p-p" : s.excursion === "rms" ? "RMS" : "peak"} · PR ${s.prCaution_pct > 0 ? `${s.prCaution_pct} %` : "off"}`}
        >
          <Num
            help="Port air speed above this counts as chuffing (the red line on the Port speed chart, the ⚠ in the summary, and the design assistant's checks). 17 m/s peak is the usual guide for a quiet hi-fi port; flared ports tolerate more, and car SPL builds often accept 25–30."
            label="Chuffing line"
            unit="m/s"
            value={portLimitOf(props.state)}
            min={5}
            onChange={(v) => set({ portLimit_ms: v > 0 ? v : PORT_LIMIT })}
          />
          <FieldRow label="Port speed" help="Port air speed shown as the peak value or as RMS (peak ÷ 1.41). The chuffing line moves with it.">
            {(id) => (
              <Segmented<Settings["velocity"]>
                id={id}
                label="Port speed"
                value={s.velocity}
                options={[
                  { value: "peak", label: "Peak" },
                  { value: "rms", label: "RMS" },
                ]}
                onChange={(velocity) => set({ velocity })}
              />
            )}
          </FieldRow>
          <FieldRow
            label="Excursion"
            help="Cone and PR excursion shown as the peak one way (as WinISD and Hornresp, and as datasheets give Xmax), peak-to-peak (twice that) or RMS (peak ÷ 1.41). The Xmax line moves with it, and so do the velocity, acceleration, force and air-moved views. Every limit is still checked on the peak one way, so nothing turns red or clear by switching."
          >
            {(id) => (
              <Segmented<Settings["excursion"]>
                id={id}
                label="Excursion"
                value={s.excursion}
                options={[
                  { value: "peak", label: "Peak" },
                  { value: "pp", label: "P-p", title: "Peak-to-peak (twice the one way peak)" },
                  { value: "rms", label: "RMS" },
                ]}
                onChange={(excursion) => set({ excursion })}
              />
            )}
          </FieldRow>
          <Num
            help="Passive radiators: the PR excursion chart shades a caution band from this share of the PR's Xmax up to it. A PR's suspension stiffens and its distortion rises as it nears Xmax; 70–80 % is a common rule of thumb, not a datasheet figure. Clear it for no band."
            label="PR caution"
            unit="% Xmax"
            value={s.prCaution_pct}
            min={10}
            zeroText="Off"
            onChange={(v) => set({ prCaution_pct: Math.min(99, Math.round(v)) })}
          />
        </Section>

        <Section icon="wave" title="Air distortion" value={`${airLimitOf(props.state)} % HD2${s.airInMaxSpl ? " · in Max SPL" : ""}`}>
          <Num
            help="2nd harmonic (HD2) from the air (in a box, or along a line or horn) above this counts as too much: the line on the Air distortion chart, the summary's red value and, if counted, a Max SPL limit. Bass hides harmonic distortion well; 10 % is a common guide for subwoofers, 3 % for hi-fi. The chart is a 2nd-order estimate from the box pressure (rough past 10 % of the box squeezed, outside the model past 20 %); lines and horns use the wave-steepening model of Thuras, Jenkins and O'Neil (1935)."
            label="Limit"
            unit="% HD2"
            value={airLimitOf(props.state)}
            min={1}
            onChange={(v) => set({ airLimit_pct: Math.min(30, Math.max(1, v > 0 ? v : 10)) })}
          />
          <SwitchRow label="In Max SPL" help="Count the air distortion limit on the Max SPL chart, with Xmax, port speed and the rest. Off keeps Max SPL as WinISD and Hornresp show it (neither models the air's distortion)." checked={s.airInMaxSpl} onChange={(airInMaxSpl) => set({ airInMaxSpl })} />
          <Select<Settings["airFill"]>
            help="Fill (wool, polyester) lets the air exchange heat with the fibres, so it compresses less adiabatically and distorts a little less. Empty is the worst case. Changes the air distortion only, not the response. Boxes only: lines and horns use the path model."
            label="Box fill"
            value={s.airFill}
            options={[
              { value: "empty", text: "Empty" },
              { value: "lined", text: "Walls lined" },
              { value: "filled", text: "Filled" },
              { value: "packed", text: "Packed" },
            ]}
            onChange={(airFill) => set({ airFill })}
          />
          <Info help={ABOUT.air}>The air only: the driver&rsquo;s own distortion (Bl and suspension) isn&rsquo;t modelled and is usually larger.</Info>
        </Section>
      </Card>
      <PrivacyCard />
    </div>
  );
}

const USAGE_HELP =
  "Thank you for keeping this on: it's one of the easiest ways to help Speaker Box Genius get better for everyone. It sends anonymous counts of how the app is used (box types added, imports and exports, tabs and charts opened, warnings shown), where clicks land with all text hidden, and how fast pages load. That shows us what people rely on most and where things get confusing, so we can fix and improve the right things first. It never sends your design, its values, names or files, sets no cookies, and has no ID that follows you between visits. Crash reports are separate and stay on. Your choice is kept in this browser only.";

/** PRIVACY: the anonymous usage stats switch (telemetry.ts). Kept in this browser, not in links or projects. */
function PrivacyCard() {
  const [on, setOn] = useState(usageStatsOn);
  return (
    <Card title="Privacy" flush>
      <div className="st-body">
        <SwitchRow
          label="Help improve the app"
          help={USAGE_HELP}
          checked={on}
          disabled={browserAskedNotToTrack}
          onChange={(v) => {
            setUsageStats(v);
            setOn(v);
          }}
        />
        <p className="hint">
          {browserAskedNotToTrack
            ? "Your browser asked not to be tracked, so nothing is sent. Thanks anyway! "
            : "Thank you for helping! Anonymous stats show us which features people use and where they get stuck, so we know what to make better next. No cookies, nothing that identifies you. "}
          <a href="/privacy/">Privacy</a>
        </p>
      </div>
    </Card>
  );
}
