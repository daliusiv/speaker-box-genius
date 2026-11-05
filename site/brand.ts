/**
 * Redraws the app icons and the site's share image (packages/web/public) from SVG, in the
 * theme's colours, with headless Chrome (site/og.ts). Run it after changing the colours:
 *
 *   node --experimental-strip-types site/brand.ts
 *
 * The curves in the share image are a real simulation: the Dayton Audio DSA215-8 in its
 * suggested sealed, ported and passive radiator boxes (as on its driver page).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { designDriver, loadDb, prCandidate } from "./drivers.ts";
import { findChrome, Rasterizer } from "./og.ts";

const PUBLIC = join(import.meta.dirname, "..", "packages", "web", "public");
export const BRAND = {
  canvas: "#090a0f",
  card: "#12141c",
  border: "#222634",
  cabinet: "#222634",
  dot: "#8e96aa",
  fg: "#e8ebf2",
  muted: "#8e96aa",
  accent: "#fb923c",
  ring: "#f97316",
};
const FONT = "Inter, 'Segoe UI', Roboto, 'DejaVu Sans', Arial, sans-serif";

/**
 * The logo: a speaker cabinet with a tweeter and an orange woofer ring, on a card.
 * `inset` shrinks the drawing for maskable icons (whose edges get cropped to any shape);
 * `rounded` gives the card rounded corners (off for iOS, which rounds it itself).
 */
export function logoSvg(size: number, o: { rounded?: boolean; inset?: number } = {}): string {
  const k = (1 - (o.inset ?? 0)) * (size / 512);
  const off = (size - 512 * k) / 2;
  const r = o.rounded === false ? 0 : 112 * (size / 512);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${r}" fill="${BRAND.card}"/>
<g transform="translate(${off} ${off}) scale(${k})">
<rect x="136" y="84" width="240" height="344" rx="26" fill="${BRAND.cabinet}"/>
<circle cx="256" cy="168" r="32" fill="${BRAND.dot}"/>
<circle cx="256" cy="310" r="80" fill="none" stroke="${BRAND.ring}" stroke-width="26"/>
<circle cx="256" cy="310" r="30" fill="${BRAND.dot}"/>
</g>
</svg>`;
}

/** The site's own share image: the logo, the name, what it does, and a response chart. */
export function siteCardSvg(curves: { color: string; label: string; points: [number, number][] }[]): string {
  const W = 1200;
  const H = 630;
  const cx = 640, cy = 200, cw = 470, ch = 230;
  const fMin = 10, fMax = 500, dbMin = -30, dbMax = 5;
  const x = (f: number) => cx + (Math.log(f / fMin) / Math.log(fMax / fMin)) * cw;
  const y = (db: number) => cy + ((dbMax - db) / (dbMax - dbMin)) * ch;
  const grid = [
    ...[10, 30, 100, 300, 500].map((f) => `<line x1="${x(f).toFixed(1)}" x2="${x(f).toFixed(1)}" y1="${cy}" y2="${cy + ch}"/>`),
    ...[0, -10, -20, -30].map((d) => `<line x1="${cx}" x2="${cx + cw}" y1="${y(d).toFixed(1)}" y2="${y(d).toFixed(1)}"/>`),
  ].join("");
  const ticks = [
    [10, "10"],
    [30, "30"],
    [100, "100"],
    [500, "500 Hz"],
  ]
    .map(([f, t]) => `<text x="${x(f as number).toFixed(1)}" y="${cy + ch + 30}" text-anchor="middle" class="ax">${t}</text>`)
    .join("");
  const paths = curves
    .map((c) => {
      let d = "";
      let pen = false;
      for (const [f, v] of c.points) {
        if (f < fMin || f > fMax || !(v >= dbMin)) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${x(f).toFixed(1)} ${y(Math.min(v, dbMax)).toFixed(1)}`;
        pen = true;
      }
      return `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join("");
  const legend = curves
    .map((c, i) => `<g transform="translate(${cx + [0, 135, 275][i]!} ${cy + ch + 70})"><rect y="-4" width="34" height="6" rx="3" fill="${c.color}"/><text x="46" y="4" class="leg">${c.label}</text></g>`)
    .join("");
  const icon = logoSvg(132).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:${FONT};fill:${BRAND.fg}}.ax{fill:${BRAND.muted};font-size:20px}.leg{font-size:22px;fill:${BRAND.fg}}</style>
<rect width="100%" height="100%" fill="${BRAND.canvas}"/>
<g transform="translate(64 100)">${icon}</g>
<text x="64" y="328" font-size="72" font-weight="800">Speaker Box</text>
<text x="64" y="408" font-size="72" font-weight="800">Genius</text>
<text x="64" y="468" font-size="30" fill="${BRAND.muted}" style="fill:${BRAND.muted}">Sealed, ported and passive radiator</text>
<text x="64" y="508" font-size="30" style="fill:${BRAND.muted}">boxes, simulated in your browser.</text>
<text x="64" y="552" font-size="30" font-weight="700" style="fill:${BRAND.accent}">Share a live design with a link.</text>
<rect x="${cx - 36}" y="${cy - 84}" width="${cw + 72}" height="${ch + 196}" rx="24" fill="${BRAND.card}" stroke="${BRAND.border}" stroke-width="2"/>
<text x="${cx}" y="${cy - 38}" font-size="26" font-weight="700">Relative response</text>
<g stroke="${BRAND.border}" stroke-width="2">${grid}</g>
${ticks}
${paths}
${legend}
</svg>`;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome found (set CHROME_PATH)");
  const db = loadDb();
  const page = designDriver(db.drivers.find((e) => e.id === "dayton-audio/dsa215-8")!, db.passiveRadiators.map(prCandidate))!;
  const names: Record<string, string> = { sealed: "Sealed", vented: "Ported", pr: "Passive radiator" };
  const curves = page.designs.map((d) => ({
    color: d.color,
    label: names[d.design.kind] ?? d.design.kind,
    points: Array.from(d.result.freq, (f, i) => [f, d.result.spl[i]! - d.result.summary.referenceSpl] as [number, number]),
  }));
  const r = await Rasterizer.start(chrome);
  try {
    const png = (svg: string, size: number) => r.image(svg, { width: size, height: size, format: "png" });
    writeFileSync(join(PUBLIC, "icons", "icon-512.png"), await png(logoSvg(512), 512));
    writeFileSync(join(PUBLIC, "icons", "icon-192.png"), await png(logoSvg(192), 192));
    writeFileSync(join(PUBLIC, "icons", "favicon-32.png"), await png(logoSvg(32), 32));
    // iOS rounds the corners itself; maskable icons get cropped to the platform's shape.
    writeFileSync(join(PUBLIC, "icons", "apple-touch-icon.png"), await png(logoSvg(180, { rounded: false }), 180));
    writeFileSync(join(PUBLIC, "icons", "icon-maskable-512.png"), await png(logoSvg(512, { rounded: false, inset: 0.2 }), 512));
    writeFileSync(join(PUBLIC, "og-image.png"), await r.image(siteCardSvg(curves), { width: 1200, height: 630, format: "png" }));
    console.log("Wrote the icons and og-image.png");
  } finally {
    await r.close();
  }
}
