import { useEffect, useState } from "react";
import { Sheet } from "./Sheet.tsx";
import { DRIVE_LIMITS, parseDrive, roundDrive, type Drive } from "./driveInput.ts";

/**
 * Phones: the drive's value, W / V and the quick choices in a bottom sheet, opened from the value
 * next to the slider, so the drive bar stays one row. Unit and quick choices apply at once;
 * a typed value applies on Done or Enter.
 */
export function DriveSheet(props: {
  open: boolean;
  onClose: () => void;
  drive: Drive;
  power: number;
  volts: number;
  rated: number;
  onUnit: (to: Drive) => void;
  onValue: (drive: Drive, v: number) => void;
  onQuick: (watts: number) => void;
}) {
  const value = props.drive === "volts" ? props.volts : props.power;
  const unit = props.drive === "volts" ? "V" : "W";
  const [text, setText] = useState(String(value));
  // A new unit (or a quick choice) shows its value in the field.
  useEffect(() => setText(String(value)), [value, props.drive, props.open]);
  const typed = parseDrive(text);
  const apply = () => {
    if (typed !== null) props.onValue(props.drive, roundDrive(props.drive, typed));
    props.onClose();
  };
  const { min, max } = DRIVE_LIMITS[props.drive];
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.drive === "volts" ? "Voltage" : "Power"}
      className="drive-sheet"
      footer={
        <div className="drive-sheet-actions">
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={typed === null}>
            Done
          </button>
        </div>
      }
    >
      <form
        className="drive-sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className="drive-sheet-value">
          <span className="sr-only">Drive ({unit})</span>
          <input
            inputMode="decimal"
            enterKeyHint="done"
            autoFocus
            value={text}
            aria-describedby="drive-sheet-range"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          <span aria-hidden="true">{unit}</span>
        </label>
        <div className="unit-switch" role="group" aria-label="Drive by">
          <button type="button" aria-pressed={props.drive === "watts"} onClick={() => props.onUnit("watts")}>
            Watts
          </button>
          <button type="button" aria-pressed={props.drive === "volts"} onClick={() => props.onUnit("volts")}>
            Volts
          </button>
        </div>
      </form>
      <p id="drive-sheet-range" className="hint">
        {props.drive === "volts"
          ? `${min}–${max} V, a fixed voltage like the 2.83 V datasheets quote.`
          : `${min}–${max} W, turned into volts with Re (V = √(P·Re)), like WinISD.`}
      </p>
      <div className="drive-sheet-quick" role="group" aria-label="Quick drive">
        <button type="button" className="chip" aria-pressed={props.drive === "watts" && props.power === 1} onClick={() => {
            props.onQuick(1);
            props.onClose();
          }}>
          1 W
        </button>
        {props.rated > 0 && (
          <button
            type="button"
            className="chip"
            aria-pressed={props.drive === "watts" && props.power === props.rated}
            onClick={() => {
              props.onQuick(props.rated);
              props.onClose();
            }}
          >
            Rated {props.rated} W
          </button>
        )}
      </div>
    </Sheet>
  );
}
