/**
 * The JSON the website form posts, read defensively: only known keys, only
 * numbers where numbers belong. Everything else is dropped before
 * buildRecord ever sees it.
 */
import { PHYSICAL_KEYS, PR_KEYS, TS_KEYS, type SubmissionFields } from "../../db-tools/src/submission.ts";

/** Bumped when the form's payload changes shape. */
export const FORM_VERSION = 1;

export interface Payload {
  fields: SubmissionFields;
  credit: string;
  consent: boolean;
  turnstile: string;
  /** Honeypot: a field people never see; bots fill it in. */
  honeypot: string;
  formVersion: number;
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function numbers<K extends string>(o: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (typeof o !== "object" || o === null) return out;
  for (const k of keys) {
    const v = finite((o as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function readPayload(body: unknown): Payload | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const kind = b.kind === "passive-radiator" ? "passive-radiator" : b.kind === "driver" ? "driver" : null;
  if (!kind) return null;
  const fields: SubmissionFields = {
    kind,
    brand: str(b.brand, 80),
    model: str(b.model, 80),
    source_url: str(b.source_url, 500),
    size_in: finite(b.size_in),
    physical: numbers(b.physical, PHYSICAL_KEYS),
  };
  if (kind === "driver") {
    fields.type = str(b.type, 30);
    fields.nominal_ohms = finite(b.nominal_ohms);
    if (b.voice_coils === 2) fields.voice_coils = 2;
    if (b.ts_wiring === "series" || b.ts_wiring === "parallel") fields.ts_wiring = b.ts_wiring;
    fields.ts = numbers(b.ts, TS_KEYS);
    fields.inconsistency_reason = str(b.inconsistency_reason, 400) || undefined;
  } else {
    fields.params = numbers(b.params, PR_KEYS);
  }
  return {
    fields,
    credit: str(b.credit, 100),
    consent: b.consent === true,
    turnstile: str(b.turnstile, 4096),
    honeypot: str(b.website, 200),
    formVersion: finite(b.form_version) ?? 0,
  };
}
