/**
 * The website form's data side, kept free of React and of Vite-only code so it runs in tests:
 * what the form starts with, brand spellings and duplicates from the database index, and sending.
 */
import type { SubmissionFields } from "../../db-tools/src/submission.ts";
import { plainName } from "./driverName.ts";
import type { DbIndex } from "./library.ts";
import type { AppState, PrParams } from "./state.ts";

/** The website form's starting values: the current driver's entered values (never calculated ones). */
export function submitFields(s: AppState): SubmissionFields {
  const t = s.ts;
  const name = plainName(s.driverName);
  const brand = s.driverBrand && name.startsWith(s.driverBrand) ? s.driverBrand : "";
  const dvc = s.dvc.on && s.dvc.entered !== "one";
  return {
    kind: "driver",
    brand,
    model: name.slice(brand.length).trim(),
    type: "other",
    nominal_ohms: dvc ? (s.dvc.entered === "series" ? s.nominal_ohms / 2 : s.nominal_ohms * 2) : s.nominal_ohms,
    voice_coils: dvc ? 2 : 1,
    ts_wiring: dvc ? (s.dvc.entered as "series" | "parallel") : undefined,
    ts: {
      fs: t.fs,
      qms: t.qms,
      qes: t.qes,
      qts: t.qts,
      vas_l: t.vas_l,
      re: t.re,
      le_mh: s.le_mh || undefined,
      bl: t.bl,
      mms_g: t.mms_g,
      sd_cm2: t.sd_cm2,
      xmax_mm: s.xmax_mm || undefined,
      pe_w: s.pe_w || undefined,
    },
    source_url: "",
  };
}

/** Brand spellings and existing entries from the database index (db/index.json ids are "<brand>/<model>"). */
export function dbLookup(db: DbIndex | null) {
  const brands = new Map<string, string>();
  const ids = new Set<string>();
  for (const d of db?.drivers ?? []) {
    brands.set(d.id.split("/")[0]!, d.brand);
    ids.add(`driver:${d.id}`);
  }
  for (const p of db?.passiveRadiators ?? []) ids.add(`passive-radiator:${p.id}`);
  return { brands, exists: (kind: string, b: string, m: string) => ids.has(`${kind}:${b}/${m}`) };
}

export type SendResult = { ok: true; prUrl: string; prNumber: number; dryRun?: boolean } | { ok: false; message: string };

/**
 * Post a submission to the submit Worker. Pressing Submit is the licence consent (the line above
 * the button says so). Every failure comes back as one sentence for the form, which then offers the
 * GitHub form.
 */
export async function sendSubmission(
  endpoint: string,
  fields: SubmissionFields,
  credit: string,
  turnstile: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<SendResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${endpoint.replace(/\/$/, "")}/v1/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...fields, credit, consent: true, turnstile, website: "", form_version: 1 }),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { pr_url?: string; pr_number?: number; errors?: { message: string }[]; code?: string; dry_run?: boolean };
    // Test mode (the Worker's DRY_RUN): everything was checked, nothing was opened.
    if (res.status === 200 && body.dry_run) return { ok: true, prUrl: "", prNumber: 0, dryRun: true };
    if (res.status === 201 && body.pr_url) return { ok: true, prUrl: body.pr_url, prNumber: body.pr_number ?? 0 };
    if (res.status === 409) return { ok: false, message: "This driver is already waiting for review." };
    const first = body.errors?.[0]?.message;
    return { ok: false, message: first ? first.replace(/\*\*/g, "") : `The submission wasn't accepted (${res.status}).` };
  } catch {
    return { ok: false, message: "Couldn't reach the submission service." };
  } finally {
    clearTimeout(timer);
  }
}

/** A passive radiator's form values (its name is split into brand and model when the brand is in the database). */
export function prSubmitFields(name: string, params: PrParams, brands: ReadonlyMap<string, string>): SubmissionFields {
  const plain = plainName(name);
  const brand = [...brands.values()].filter((b) => plain.toLowerCase().startsWith(`${b.toLowerCase()} `)).sort((a, b) => b.length - a.length)[0] ?? "";
  return {
    kind: "passive-radiator",
    brand,
    model: plain.slice(brand.length).trim(),
    params: {
      mms_g: params.mms_g,
      sd_cm2: params.sd_cm2,
      qms: params.qms,
      vas_l: params.vas_l,
      ...(params.xmech ? { xmech_mm: params.xmax_mm } : { xmax_mm: params.xmax_mm }),
    },
    source_url: "",
  };
}
