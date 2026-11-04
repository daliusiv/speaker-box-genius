import { roomGainDb } from "@sbg/engine";
import { Card, Fixed, Num, Select } from "./components.tsx";
import { ROOM_PRESETS, type AppState } from "./state.ts";

type Room = AppState["roomGain"];

/** Low-frequency lift of a car cabin or room, added to the SPL charts. */
export function RoomGainPanel(props: { value: Room; room: { f0: number; slopeDbPerOct: number; maxDb: number } | null; onChange: (r: Room) => void }) {
  const g = props.value;
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
          ]}
          onChange={(mode) => set(mode === "off" ? { mode } : { mode, ...ROOM_PRESETS[mode] })}
        />
        {g.mode !== "off" && (
          <>
            <Num help="Longest inside dimension of the room or cabin. Sets where the lift starts." label="Longest inside" q="len" value={g.length_cm} min={1} onChange={(length_cm) => set({ length_cm })} />
            <Fixed label="Lift starts" unit="Hz" value={props.room ? props.room.f0.toFixed(0) : "–"} title="Transition frequency, c / (2 × longest dimension)" />
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
      {g.mode !== "off" && props.room && (
        <p className="hint">
          Lift: {at(20).toFixed(1)} dB at 20 Hz, {at(30).toFixed(1)} dB at 30 Hz, {at(50).toFixed(1)} dB at 50 Hz. Added
          to the SPL and maximum SPL charts only; excursion, port speed and the F3 in the summary stay free-space.
          These are starting points: real cabins vary a lot with size, seats and leaks, so measure yours if you can.
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
