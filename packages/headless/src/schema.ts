/**
 * JSON Schema (draft-07) of a SimRequest, for MCP tool inputs and editors. validateRequest is
 * the authority (it knows every field of the app's designs); this describes the friendly parts
 * and lets the rest through, so a client never rejects what the server would take.
 */
import { DEFAULT_OUTPUT, CURVES, DESIGN_KINDS, MAX_CURVE_POINTS } from "./request.ts";

const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: "number", description, ...extra });

export const driverSchema = {
  type: "object",
  description:
    "The driver: a database id from search_drivers ({\"id\": \"dayton-audio/rss315hf-4\"}), or its T/S values (at least fs, vas_l, re and two of qts/qes/qms). Values given beside an id override the database's.",
  properties: {
    id: { type: "string", description: 'Database id, "brand/model".' },
    name: { type: "string" },
    nominal_ohms: num("Nominal impedance (Ω)."),
    fs: num("Free-air resonance (Hz)."),
    qms: num("Mechanical Q."),
    qes: num("Electrical Q."),
    qts: num("Total Q."),
    vas_l: num("Equivalent compliance volume (litres)."),
    re: num("Voice-coil DC resistance (Ω)."),
    sd_cm2: num("Cone area (cm²)."),
    mms_g: num("Moving mass incl. air load (g)."),
    bl: num("Force factor (T·m)."),
    cms_mm_per_n: num("Compliance (mm/N)."),
    rms: num("Mechanical resistance (N·s/m)."),
    le_mh: num("Voice-coil inductance (mH)."),
    xmax_mm: num("Linear excursion, one way (mm)."),
    pe_w: num("Thermal power rating (W)."),
  },
  additionalProperties: true,
} as const;

export const designSchema = {
  type: "object",
  description:
    'One box. Sealed: vb_l. Vented: vb_l + fb_hz (a port is chosen, or give port). PR: vb_l + pr {id or params, count} + fb_hz or pr.added_mass_g. Or size: "auto" for the app\'s presets (WinISD alignments). Other box types (bandpass, line, ib, ob) and any extra option take the app\'s own design fields, as in share links.',
  properties: {
    kind: { type: "string", enum: [...DESIGN_KINDS], description: "sealed, vented (ported), pr (passive radiators), bandpass, line (TL/MLTL/TQWT/tapped horn/horn), ib (infinite baffle), ob (open baffle)." },
    name: { type: "string" },
    vb_l: num("Net internal volume (litres). Bandpass: the rear chamber."),
    size: { type: "string", enum: ["auto"], description: "Size this box for the driver as the app's Size all boxes does." },
    fb_hz: num("Tuning (Hz), vented and pr boxes."),
    port: {
      type: "object",
      description: "Vented: the port. Round (diameter_cm) or slot (slot_w_cm × slot_h_cm). Leave length_cm out with fb_hz.",
      properties: { diameter_cm: num("cm"), slot_w_cm: num("cm"), slot_h_cm: num("cm"), count: { type: "integer", minimum: 1 }, length_cm: num("cm"), flare_cm: num("Round-over radius at both ends (cm), 0 = straight.") },
      additionalProperties: false,
    },
    pr: {
      type: "object",
      description: "PR box: the passive radiators.",
      properties: {
        id: { type: "string", description: "Database PR id (find_passive_radiators), or \"driver:<driver id>\" for a woofer used as a PR." },
        params: { type: "object", properties: { mms_g: num("g"), sd_cm2: num("cm²"), xmax_mm: num("mm"), qms: num(""), vas_l: num("L") }, required: ["mms_g", "sd_cm2", "xmax_mm", "vas_l"] },
        name: { type: "string" },
        count: { type: "integer", minimum: 1 },
        added_mass_g: num("Added mass per PR (g).", { minimum: 0 }),
      },
      additionalProperties: false,
    },
    w_cm: num("Open baffle: board width (cm)."),
    h_cm: num("Open baffle: board height (cm)."),
    frame: { type: "string", enum: ["flat", "h", "u"], description: "Open baffle: flat board, H-frame or U-frame." },
    order: { type: "string", enum: ["4", "6p", "6s"], description: "Bandpass: 4th order, 6th parallel, 6th series." },
    frontVb_l: num("Bandpass: front chamber (litres)."),
    rear: { description: "Infinite baffle: \"open\" or \"space\" (a closed space of vb_l litres). Bandpass: the rear port." },
  },
  required: ["kind"],
  additionalProperties: true,
} as const;

export const simRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    driver: driverSchema,
    count: { type: "integer", minimum: 1, maximum: 16, description: "Drivers per box (default 1)." },
    wiring: { type: "string", enum: ["parallel", "series"] },
    isobaric: { type: "boolean" },
    drive: {
      description: 'Drive: {"watts": 1} (default, as WinISD), {"volts": 2.83}, or "rated" (the driver\'s power rating).',
      oneOf: [
        { type: "object", properties: { watts: num("W") }, required: ["watts"], additionalProperties: false },
        { type: "object", properties: { volts: num("V RMS") }, required: ["volts"], additionalProperties: false },
        { type: "string", enum: ["rated"] },
      ],
    },
    designs: { type: "array", minItems: 1, maxItems: 8, items: designSchema },
    settings: { type: "object", description: "The app's Settings (e.g. losses {ql, qa, qp}, air, portLimit_ms, inductance, ampVolts/ampAmps). Defaults match WinISD.", additionalProperties: true },
    highPass: { type: "object", description: "High-pass filter: {on, type, order, freq}.", additionalProperties: true },
    roomGain: { type: "object", description: "Room or cabin gain: {mode: off|car|room, length_cm, slope, max_db}.", additionalProperties: true },
    baffle: { type: "object", description: "Baffle step (free-standing speaker): {on, width_cm, height_cm, x_cm, y_cm}.", additionalProperties: true },
    passive: { type: "object", additionalProperties: true },
    eq: { type: "array" },
    measured: { type: "array" },
    volume: { type: "object", additionalProperties: true },
    compare: { type: ["object", "null"] },
    output: {
      type: "object",
      description: `Curves to return, sampled log-spaced (at most ${MAX_CURVE_POINTS} points). Default ${DEFAULT_OUTPUT.from_hz}–${DEFAULT_OUTPUT.to_hz} Hz, ${DEFAULT_OUTPUT.points_per_octave}/octave, ${DEFAULT_OUTPUT.curves.join(", ")}.`,
      properties: { from_hz: num("Hz"), to_hz: num("Hz"), points_per_octave: num(""), curves: { type: "array", items: { type: "string", enum: [...CURVES] } } },
      additionalProperties: false,
    },
  },
  required: ["driver", "designs"],
  additionalProperties: false,
} as const;
