import { REPO } from "./components.tsx";
import { plainName } from "./driverName.ts";
import type { AppState } from "./state.ts";

/**
 * A link to the "Add a driver" issue form, pre-filled from the current driver.
 * Only values the user entered are included (never calculated ones), because the
 * database records what the datasheet says. The submitter adds the datasheet link.
 */
export function submitDriverUrl(s: AppState): string {
  const t = s.ts;
  const v = (x: number | undefined) => (x === undefined ? "" : String(x));
  const name = plainName(s.driverName);
  const brand = s.driverBrand && name.startsWith(s.driverBrand) ? s.driverBrand : "";
  const model = name.slice(brand.length).trim();
  const ts = [
    `Fs (Hz): ${v(t.fs)}`,
    `Qms: ${v(t.qms)}`,
    `Qes: ${v(t.qes)}`,
    `Qts: ${v(t.qts)}`,
    `Vas (L): ${v(t.vas_l)}`,
    `Re (Ω): ${v(t.re)}`,
    `Le (mH): ${s.le_mh || ""}`,
    `Bl (T·m): ${v(t.bl)}`,
    `Mms (g): ${v(t.mms_g)}`,
    // Mmd only when typed (the database stores Mms; the importer converts it with Sd).
    ...(t.mmd_g !== undefined ? [`Mmd (g, without air load): ${v(t.mmd_g)}`] : []),
    `Sd (cm²): ${v(t.sd_cm2)}`,
    `Xmax (mm, one way): ${s.xmax_mm || ""}`,
    `Pe (W, RMS): ${s.pe_w || ""}`,
  ].join("\n");
  const q = new URLSearchParams({
    template: "new-driver.yml",
    title: `[Driver] ${[brand, model].filter(Boolean).join(" ") || "<Brand> <Model>"}`,
    brand,
    model,
    nominal_ohms: String(s.nominal_ohms),
    ts,
  });
  return `${REPO}/issues/new?${q.toString()}`;
}

/** Where the website form posts (the submit Worker) and Turnstile's site key; unset → the menu links to the GitHub form. */
export const SUBMIT_ENDPOINT: string = import.meta.env.VITE_SUBMIT_ENDPOINT ?? "";
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
