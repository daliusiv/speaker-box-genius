import { REPO } from "./components.tsx";
import type { AppState } from "./state.ts";

/**
 * A link to the "Add a driver" issue form, pre-filled from the current driver.
 * Only values the user entered are included (never calculated ones), because the
 * database records what the datasheet says. The submitter adds the datasheet link.
 */
export function submitDriverUrl(s: AppState): string {
  const t = s.ts;
  const v = (x: number | undefined) => (x === undefined ? "" : String(x));
  const name = s.driverName.replace(/\s*\((measured|fictional)\)\s*$/i, "").trim();
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
