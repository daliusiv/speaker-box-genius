import { useState } from "react";
import { roomGainDb, type RoomGain, type RoomGainCurve } from "@sbg/engine";
import { readRoomCurve } from "./roomCurve.ts";
import { Fixed, Num, Select } from "./components.tsx";
import { Button, Chip, FileButton, RadioCards, Section, helpEntries } from "./ui/index.ts";
import { ROOM_PRESETS, type AppState, type RoomCurve } from "./state.ts";

/** What each field of this row does: the fields' help and the row's ⓘ sheet (fields that only show after a choice too). */
const HELP: Record<string, string> = {
  "Longest inside": "Longest inside dimension of the room or cabin. Sets where the lift starts.",
  "Slope": "How fast the lift rises below the transition: 12 dB/oct for a sealed space like a car, 6 dB/oct for a leaky room with open doors.",
  "Max lift": "The most lift allowed, in dB: real spaces stop gaining at some point.",
  "Lift 20 / 30 / 50 Hz": "Added to the SPL and maximum SPL charts only: excursion and port speed don't change (the cabin boosts what you hear, not what the cone does). The summary shows each box's own F3 with the F3 in this space next to it; the response chart's F3 dots mark the second.",
};

type Room = AppState["roomGain"];

/** Low-frequency lift of a car cabin or room, added to the SPL charts. */
export function RoomGainSection(props: { value: Room; room: RoomGain | RoomGainCurve | null; onChange: (r: Room) => void }) {
  const g = props.value;
  const [msg, setMsg] = useState("");
  const load = async (file: File) => {
    try {
      const curve = await readRoomCurve(file);
      setMsg(`${curve.name}: ${curve.f.length} points, ${curve.f[0]} to ${curve.f[curve.f.length - 1]} Hz.`);
      set({ mode: "curve", curve });
    } catch (e) {
      setMsg(`Couldn't read ${file.name}: ${(e as Error).message}.`);
    }
  };
  const set = (patch: Partial<Room>) => props.onChange({ ...g, ...patch });
  const at = (f: number) => (props.room ? roomGainDb(f, props.room) : 0);
  const value =
    g.mode === "off"
      ? "Off"
      : g.mode === "curve"
        ? g.curve
          ? `Your curve · ${g.curve.name}`
          : "Your curve · none loaded"
        : `${g.mode === "car" ? "Car cabin" : "Room"}${props.room && "f0" in props.room ? ` · from ${props.room.f0.toFixed(0)} Hz` : ""}`;
  return (
    <Section help={helpEntries(HELP)} icon="room" title="Room / cabin gain" value={value}>
      <RadioCards<Room["mode"]>
        legend="Space"
        value={g.mode}
        options={[
          { value: "off", title: "Off (free space)", description: "No room: the response as in an anechoic half space, like WinISD", aside: <Chip>usual</Chip> },
          { value: "car", title: "Car cabin", description: "A small sealed space: strong lift below its first mode" },
          { value: "room", title: "Room", description: "A living room: gentler lift, starting lower" },
          { value: "curve", title: "Your own curve", description: "Load a measured or published gain curve (.txt / .frd)" },
        ]}
        onChange={(mode) => set(mode === "off" || mode === "curve" ? { mode } : { mode, ...ROOM_PRESETS[mode] })}
      />
      {g.mode === "curve" && (
        <div className="sg-actions">
          <FileButton
            accept=".txt,.frd,.csv"
            title="A text or .frd file of frequency (Hz) and gain (dB) per line, relative to 0 dB where the space adds nothing: from a measurement, a room calculator, or the file you import into Hornresp"
            onFile={(f) => void load(f)}
          >
            {g.curve ? "Load another file" : "Load a curve…"}
          </FileButton>
          {g.curve && (
            <Button
              variant="ghost"
              title="Shift the whole curve so its top end is 0 dB (for a measurement that isn't relative)"
              onClick={() => {
                const c = g.curve!;
                const top = c.v[c.v.length - 1]!;
                set({ curve: { ...c, v: c.v.map((v) => Math.round((v - top) * 100) / 100) } });
              }}
            >
              Top end to 0 dB
            </Button>
          )}
        </div>
      )}
      {(g.mode === "car" || g.mode === "room") && (
        <>
          <Num help={HELP["Longest inside"]} label="Longest inside" q="len" value={g.length_cm} min={1} onChange={(length_cm) => set({ length_cm })} />
          <Fixed label="Lift starts" unit="Hz" value={props.room && "f0" in props.room ? props.room.f0.toFixed(0) : "–"} title="Transition frequency, c / (2 × longest dimension): the lift is about 3 dB here and grows below it" />
          <Select<"12" | "6">
            help={HELP["Slope"]}
            label="Slope"
            value={String(g.slope) as "12" | "6"}
            options={[
              { value: "12", text: "12 dB/oct" },
              { value: "6", text: "6 dB/oct" },
            ]}
            onChange={(x) => set({ slope: x === "6" ? 6 : 12 })}
          />
          <Num help={HELP["Max lift"]} label="Max lift" unit="dB" value={g.max_db} min={0} onChange={(max_db) => set({ max_db })} />
        </>
      )}
      {g.mode !== "off" && props.room && (
        <Fixed
          label="Lift 20 / 30 / 50 Hz"
          value={`${at(20).toFixed(1)} / ${at(30).toFixed(1)} / ${at(50).toFixed(1)} dB`}
          help={HELP["Lift 20 / 30 / 50 Hz"]}
        />
      )}
      {msg && <p className="hint">{msg}</p>}
      {g.mode === "curve" && !g.curve && (
        <p className="hint">
          A frequency (Hz) and a gain (dB) on each line, relative to 0 dB where the space adds nothing: a room calculator&rsquo;s output, a measurement, or
          Hornresp&rsquo;s room gain file (.txt or .frd). Beyond its ends the curve holds its end values.
        </p>
      )}
      {g.mode !== "off" && props.room && (
        <p className="hint">
          {g.mode === "curve"
            ? `Your curve "${g.curve?.name ?? ""}" (${g.curve?.f.length ?? 0} points), on the SPL charts only.`
            : "On the SPL charts only. A starting point: real cabins vary with size, seats and leaks, so measure yours if you can."}
        </p>
      )}
    </Section>
  );
}
