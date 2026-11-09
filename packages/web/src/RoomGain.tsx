import { useState } from "react";
import { roomGainDb, type RoomGain, type RoomGainCurve } from "@sbg/engine";
import { readRoomCurve } from "./roomCurve.ts";
import { Card, Fixed, Num, Select } from "./components.tsx";
import { ROOM_PRESETS, type AppState, type RoomCurve } from "./state.ts";

type Room = AppState["roomGain"];

/** Low-frequency lift of a car cabin or room, added to the SPL charts. */
export function RoomGainPanel(props: { value: Room; room: RoomGain | RoomGainCurve | null; onChange: (r: Room) => void }) {
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
  return (
    <Card title="Room / cabin gain">
      <div className="fields">
        <Select<Room["mode"]> help="Adds the low-frequency lift of a closed space: a car cabin (strong) or a room (gentler)."
          label="Space"
          value={g.mode}
          options={[
            { value: "off", text: "Off (free space)" },
            { value: "car", text: "Car cabin" },
            { value: "room", text: "Room" },
            { value: "curve", text: "Your own curve (.txt / .frd)" },
          ]}
          onChange={(mode) => set(mode === "off" || mode === "curve" ? { mode } : { mode, ...ROOM_PRESETS[mode] })}
        />
        {g.mode === "curve" && (
          <label className="file-button" title="A text or .frd file of frequency (Hz) and gain (dB) per line, relative to 0 dB where the space adds nothing: from a measurement, a room calculator, or the file you import into Hornresp">
            {g.curve ? "Load another file" : "Load a curve…"}
            <input type="file" accept=".txt,.frd,.csv" hidden onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void load(f);
            }} />
          </label>
        )}
        {g.mode === "curve" && g.curve && (
          <button className="secondary" title="Shift the whole curve so its top end is 0 dB (for a measurement that isn't relative)" onClick={() => {
            const c = g.curve!;
            const top = c.v[c.v.length - 1]!;
            set({ curve: { ...c, v: c.v.map((v) => Math.round((v - top) * 100) / 100) } });
          }}>
            Top end to 0 dB
          </button>
        )}
        {(g.mode === "car" || g.mode === "room") && (
          <>
            <Num help="Longest inside dimension of the room or cabin. Sets where the lift starts." label="Longest inside" q="len" value={g.length_cm} min={1} onChange={(length_cm) => set({ length_cm })} />
            <Fixed label="Lift starts" unit="Hz" value={props.room && "f0" in props.room ? props.room.f0.toFixed(0) : "–"} title="Transition frequency, c / (2 × longest dimension): the lift is about 3 dB here and grows below it" />
            <Select<"12" | "6"> help="How fast the lift rises below the transition: 12 dB/oct for a sealed space like a car, 6 for a leaky room."
              label="Slope"
              value={String(g.slope) as "12" | "6"}
              options={[
                { value: "12", text: "12 dB/oct (sealed space, like a car)" },
                { value: "6", text: "6 dB/oct (leaky room, open doors)" },
              ]}
              onChange={(x) => set({ slope: x === "6" ? 6 : 12 })}
            />
            <Num help="The most lift allowed, in dB: real spaces stop gaining at some point." label="Max lift" unit="dB" value={g.max_db} min={0} onChange={(max_db) => set({ max_db })} />
          </>
        )}
      </div>
      {msg && <p className="hint">{msg}</p>}
      {g.mode === "curve" && !g.curve && (
        <p className="hint">
          Load a file with a frequency (Hz) and a gain (dB) on each line, relative to 0 dB where the space adds nothing: a room
          calculator&rsquo;s output, a measurement of your car or room, or the room gain profile you import into Hornresp (.txt or .frd;
          spaces, tabs, commas or semicolons; header lines are skipped). Beyond its ends the curve holds its end values.
        </p>
      )}
      {g.mode !== "off" && props.room && (
        <p className="hint">
          Lift: {at(20).toFixed(1)} dB at 20 Hz, {at(30).toFixed(1)} dB at 30 Hz, {at(50).toFixed(1)} dB at 50 Hz. Added
          to the SPL and maximum SPL charts only: excursion and port speed don&rsquo;t change (the cabin boosts what you
          hear, not what the cone does), and the summary shows each box&rsquo;s own F3 with the F3 in this space next to it (the response chart&rsquo;s F3 dots mark the second).
          {g.mode === "curve"
            ? ` Your curve "${g.curve?.name ?? ""}" (${g.curve?.f.length ?? 0} points); beyond its ends it holds its end values.`
            : " These are starting points: real cabins vary a lot with size, seats and leaks, so measure yours if you can."}
        </p>
      )}
      {g.mode === "off" && (
        <p className="hint">
          A closed space lifts the deep bass. Pick a car or room to see how a design will sound in it, which is why
          sealed boxes with an early roll-off often work so well in cars.
        </p>
      )}
    </Card>
  );
}

