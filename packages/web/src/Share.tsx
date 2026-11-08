import { useEffect, useRef, useState } from "react";
import { wprExportable, wprFor } from "./wprExport.ts";
import { coilLabel, driveLabel, lineFoldOf, limitsOf, portLimitOf, prGroupLabels, type Design } from "./sim.ts";
import { foldShapes } from "./foldShapes.ts";
import { REPO } from "./components.tsx";
import { fmtQ } from "./units.ts";
import { encodeStateShort, type AppState } from "./state.ts";
import { drawQr } from "./qrDraw.ts";

const SITE = "speakerboxgenius.com";

interface Row {
  name: string;
  color: string;
  cells: string[];
  /** Per cell: is this value over its limit? */
  over: boolean[];
}

const HEAD = ["Design", "Vb", "Fb / Fc", "F3", "Peak cone", "Peak PR", "Peak port"];

/** Summary numbers shared by the forum text and the image. */
function summaryRows(state: AppState, designs: Design[]): Row[] {
  const n = (v: number | null | undefined, unit: string, digits = 1) =>
    v === null || v === undefined || !Number.isFinite(v) ? "–" : `${v.toFixed(digits)} ${unit}`;
  return designs.map(({ design: d, label, color, vb_l, acting_l, result: r, compare }) => {
    const lim = limitsOf(r, compare && state.compare ? state.compare.xmax_mm : state.xmax_mm, state.highPass.on, portLimitOf(state));
    const { x, xpr, vp } = lim;
    const vol =
      d.kind === "bandpass"
        ? `${fmtQ(vb_l, "vol", state.settings.units)} + ${fmtQ(d.frontVb_l, "vol", state.settings.units)}`
        : acting_l !== undefined
          ? // Stuffed: the net volume as built → the volume it acts as.
            `${fmtQ(vb_l, "vol", state.settings.units).split(" ")[0]} → ${fmtQ(acting_l, "vol", state.settings.units)}`
          : fmtQ(vb_l, "vol", state.settings.units);
    return {
      name: label,
      color,
      cells: [vol, n(r.summary.fb ?? r.summary.fc, "Hz"), n(r.summary.f3, "Hz"), lim.deep ? `${n(x, "mm")} (${lim.deep.x_mm.toFixed(1)} below ${lim.deep.below_hz.toFixed(0)} Hz)` : n(x, "mm"), n(xpr?.mm, "mm"), n(vp, "m/s")],
      over: [
        false,
        false,
        false,
        lim.over.includes("xmax"),
        lim.over.includes("pr"),
        lim.over.includes("port"),
      ],
    };
  });
}

function subtitle(state: AppState): string {
  const parts = [driveLabel(state) + coilLabel(state)];
  if (state.isobaric) parts.push(`${state.drivers} isobaric pair${state.drivers > 1 ? "s" : ""}`);
  else if (state.drivers > 1) parts.push(`${state.drivers} drivers (${state.wiring})`);
  if (state.highPass.on) parts.push(`${state.highPass.order * 6} dB/oct high-pass at ${state.highPass.freq} Hz`);
  if (state.passive.on && state.passive.branches.some((b) => (b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0)) parts.push("passive parts");
  if (state.roomGain.mode === "curve") parts.push(`room curve "${state.roomGain.curve?.name ?? ""}" added`);
  else if (state.roomGain.mode !== "off") parts.push(`${state.roomGain.mode === "car" ? "cabin" : "room"} gain from ${(34320 / (2 * state.roomGain.length_cm)).toFixed(0)} Hz`);
  parts.push(`Xmax ${state.xmax_mm} mm`);
  if (state.compare) parts.push(`compared with ${state.compare.driverName} (dashed)`);
  return parts.join(" · ");
}

/** Explains "a → b" volumes when a design is stuffed. */
const STUFFED_NOTE = "Vb a → b: the net volume as built → the volume its stuffing makes it act as.";
const anyStuffed = (designs: Design[]) => designs.some((d) => d.acting_l !== undefined);

export function markdownPost(state: AppState, designs: Design[], url: string): string {
  const rows = summaryRows(state, designs);
  return [
    `**${state.driverName}** (${subtitle(state)})`,
    "",
    `| ${HEAD.join(" | ")} |`,
    `|${HEAD.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.name} | ${r.cells.join(" | ")} |`),
    "",
    ...(anyStuffed(designs) ? [`*${STUFFED_NOTE}*`, ""] : []),
    `[Open the live simulation](${url}) in Speaker Box Genius`,
  ].join("\n");
}

export function bbcodePost(state: AppState, designs: Design[], url: string): string {
  const rows = summaryRows(state, designs);
  return [
    `[b]${state.driverName}[/b] (${subtitle(state)})`,
    "[list]",
    ...rows.map(
      (r) =>
        `[*][b]${r.name}[/b]: Vb ${r.cells[0]}, tuning ${r.cells[1]}, F3 ${r.cells[2]}, peak cone ${r.cells[3]}` +
        (r.cells[4] !== "–" ? `, peak PR ${r.cells[4]}` : "") +
        (r.cells[5] !== "–" ? `, peak port ${r.cells[5]}` : ""),
    ),
    "[/list]",
    ...(anyStuffed(designs) ? [`[i]${STUFFED_NOTE}[/i]`] : []),
    `[url=${url}]Open the live simulation in Speaker Box Genius[/url]`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Every curve of every design, one row per frequency. Opens in Excel / Sheets / LibreOffice. */
export function curvesCsv(state: AppState, designs: Design[]): string {
  if (designs.length === 0) return "";
  const vel = state.settings.velocity === "rms" ? "RMS" : "peak";
  const cols: { head: string; data: Float64Array }[] = [];
  for (const { design: d, label, result: r } of designs) {
    const add = (what: string, data: Float64Array | null) => data && cols.push({ head: `${label}: ${what}`, data });
    add("SPL (dB)", r.spl);
    add("Cone excursion (mm peak)", r.excursionMm);
    if (r.prGroups && (r.prGroups.length > 1 || d.kind === "bandpass")) {
      const names = prGroupLabels(d);
      r.prGroups.forEach((g, k) => add(`PR excursion, ${names[k] ?? `group ${k + 1}`} (mm peak)`, g.excursionMm));
    } else add("PR excursion (mm peak)", r.prExcursionMm);
    add(d.kind === "bandpass" ? `Front port velocity (m/s ${vel})` : `Port velocity (m/s ${vel})`, r.portVelocity);
    add(`Rear port velocity (m/s ${vel})`, r.rearPortVelocity);
    add("Impedance (ohm)", r.impedanceOhm);
    add("Impedance phase (deg)", r.impedancePhaseDeg);
    add("Group delay (ms)", r.groupDelayMs);
    add("Max SPL (dB)", r.maxSpl);
    add("Max drive power (W, before filter and EQ)", r.maxPowerW);
    add("Amp volts at max SPL (V RMS)", r.ampAtMax.volts);
    add("Amp current at max SPL (A RMS)", r.ampAtMax.amps);
    add("Amp power at max SPL (W)", r.ampAtMax.watts);
  }
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const freq = designs[0]!.result.freq;
  const lines = [
    `# ${state.driverName}, ${subtitle(state)}, 1 m half space, air: ${state.settings.air === "custom" ? `${state.settings.airConditions.temp_C} °C, ${state.settings.airConditions.humidity_pct} % RH, ${state.settings.airConditions.pressure_hPa} hPa` : state.settings.air}`,
    ["Frequency (Hz)", ...cols.map((c) => c.head)].map(q).join(","),
  ];
  for (let i = 0; i < freq.length; i++) {
    lines.push([freq[i]!.toFixed(3), ...cols.map((c) => (Number.isFinite(c.data[i]!) ? c.data[i]!.toPrecision(6) : ""))].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

const STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
] as const;

/** Copy an on-screen chart SVG with its CSS baked in, so it renders identically as an image. */
function standaloneSvg(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = dst[i] as SVGElement;
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) target.style.setProperty(p, v);
    }
  });
  // React's generated ids contain characters that break url(#…) references outside the page.
  // Edit-mode handles aren't part of the picture.
  clone.querySelectorAll(".handle").forEach((el) => el.remove());
  clone.querySelectorAll("[id]").forEach((el, i) => {
    const old = el.id;
    const id = `x${i}`;
    el.id = id;
    clone.querySelectorAll(`[clip-path]`).forEach((ref) => {
      if (ref.getAttribute("clip-path") === `url(#${old})`) ref.setAttribute("clip-path", `url(#${id})`);
    });
  });
  // Undo the on-screen size boost for narrow screens: the image is always desktop-sized.
  clone.querySelectorAll<SVGElement>("[data-base-fs]").forEach((el) => el.style.setProperty("font-size", el.dataset.baseFs!));
  clone.querySelectorAll<SVGElement>("[data-base-sw]").forEach((el) => {
    el.style.setProperty("stroke-width", el.dataset.baseSw!);
    el.setAttribute("stroke-width", el.dataset.baseSw!);
  });
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.querySelector("g.cursor")?.remove();
  clone.querySelector("line.cursor")?.remove();
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render a chart"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  });
}

export async function renderForumImage(state: AppState, designs: Design[], url?: string): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const col = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = col("--bg", "#f5f5f4");
  const fg = col("--fg", "#1c1917");
  const muted = col("--muted", "#78716c");
  const card = col("--card", "#ffffff");
  const border = col("--border", "#e7e5e4");
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

  // The charts marked for the image (SPL, excursion, PR excursion, port speed), shown or not.
  const marked = [...document.querySelectorAll<HTMLElement>("figure.chart[data-forum]")];
  const figures = (marked.length > 0 ? marked : [...document.querySelectorAll<HTMLElement>("figure.chart")]).slice(0, 4);
  const W = 1600;
  const pad = 32;
  const colW = (W - pad * 3) / 2;
  // Charts drawn on a phone are taller (nearly 4:3); keep their shape.
  const ratio = Math.min(
    ...figures.map((f) => {
      const vb = f.querySelector("svg")?.viewBox.baseVal;
      return vb && vb.width > 0 ? vb.height / vb.width : 260 / 640;
    }),
    470 / 640,
  );
  const chartH = Math.round(colW * (Number.isFinite(ratio) ? ratio : 260 / 640));
  const rows = summaryRows(state, designs);
  const tableTop = 130;
  const rowH = 34;
  const chartsTop = tableTop + rowH * (rows.length + 1) + 30;
  const chartBlock = chartH + 48;
  // Folded transmission lines and horns: a side view each, in a row under the charts.
  const folds = designs
    .filter((d) => !d.compare)
    .flatMap((d) => {
      if (d.design.kind !== "line") return [];
      try {
        return [{ d, f: lineFoldOf(d.design, state.volume.wall_mm) }];
      } catch {
        return [];
      }
    })
    .slice(0, 4);
  const foldsTop = chartsTop + Math.ceil(figures.length / 2) * (chartBlock + pad);
  const foldBlock = 300;
  const H = foldsTop + (folds.length > 0 ? foldBlock + pad : 0) + 50;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Header, with a QR code to the live design in the top-right corner.
  const qr = 170;
  if (url) {
    try {
      g.fillStyle = "#fff";
      g.beginPath();
      g.roundRect(W - pad - qr - 8, 16, qr + 16, qr + 36, 12);
      g.fill();
      drawQr(g, url, W - pad - qr, 20, qr, scale);
      g.fillStyle = "#090a0f";
      g.font = `600 15px ${font}`;
      g.textAlign = "center";
      g.fillText("Scan: live design", W - pad - qr / 2, 20 + qr + 22);
      g.textAlign = "left";
    } catch {
      // Too long for a QR code: the link in the post still works.
    }
  }
  g.fillStyle = fg;
  g.font = `700 34px ${font}`;
  const textW = W - 2 * pad - (url ? qr + 40 : 0);
  g.fillText(state.driverName, pad, 58, textW);
  g.fillStyle = muted;
  g.font = `400 20px ${font}`;
  g.fillText(`${subtitle(state)} · 1 m, half space`, pad, 92, textW);

  // Summary table
  const colX = [pad, pad + 380, pad + 540, pad + 700, pad + 860, pad + 1040, pad + 1220];
  g.font = `600 18px ${font}`;
  g.fillStyle = muted;
  HEAD.forEach((h, i) => g.fillText(h, colX[i]!, tableTop));
  rows.forEach((r, ri) => {
    const y = tableTop + rowH * (ri + 1);
    g.fillStyle = r.color;
    g.fillRect(colX[0]!, y - 14, 14, 14);
    g.font = `600 19px ${font}`;
    g.fillText(r.name, colX[0]! + 24, y);
    r.cells.forEach((c, ci) => {
      g.fillStyle = r.over[ci] ? "#dc2626" : fg;
      g.font = `${r.over[ci] ? 700 : 400} 19px ${font}`;
      g.fillText(c, colX[ci + 1]!, y);
    });
  });

  // Charts
  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i]!;
    const svg = fig.querySelector("svg");
    if (!svg) continue;
    const x = pad + (i % 2) * (colW + pad);
    const y = chartsTop + Math.floor(i / 2) * (chartBlock + pad);
    g.fillStyle = card;
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x, y, colW, chartBlock, 12);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.font = `600 18px ${font}`;
    g.fillText(fig.querySelector(".chart-title")?.textContent ?? "", x + 16, y + 30);
    const img = await loadImage(standaloneSvg(svg, colW - 16, chartH));
    g.drawImage(img, x + 8, y + 40, colW - 16, chartH);
  }

  // Folded lines
  const foldW = (W - pad * (folds.length + 1)) / Math.max(folds.length, 1);
  folds.forEach(({ d, f }, i) => {
    const x = pad + i * (foldW + pad);
    const y = foldsTop;
    g.fillStyle = card;
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x, y, foldW, foldBlock, 12);
    g.fill();
    g.stroke();
    g.fillStyle = d.color;
    g.fillRect(x + 16, y + 18, 14, 14);
    g.fillStyle = fg;
    g.font = `600 18px ${font}`;
    g.fillText(`${d.label}: folded`, x + 38, y + 31, foldW - 54);
    g.fillStyle = muted;
    g.font = `400 16px ${font}`;
    const o = f.outside;
    g.fillText(`${Math.round(o.width / 10)} × ${Math.round(o.height / 10)} × ${Math.round(o.depth / 10)} cm (W × H × D), ${f.runs.length} runs`, x + 16, y + foldBlock - 16, foldW - 32);
    // Side view, front on the left, scaled into the block.
    const boxH = foldBlock - 90;
    const k = Math.min(boxH / o.height, (foldW - 60) / o.depth);
    const ox = x + (foldW - o.depth * k) / 2;
    const oy = y + 48;
    for (const r of foldShapes(f, state.volume.wall_mm)) {
      g.fillStyle = r.kind === "inner" ? card : r.kind === "driver" || r.kind === "mouth" || r.kind === "chamber" ? d.color : muted;
      g.globalAlpha = r.kind === "outer" ? 0.55 : r.kind === "mouth" ? 0.6 : r.kind === "chamber" ? 0.15 : 1;
      g.fillRect(ox + r.x * k, oy + r.y * k, Math.max(1, r.w * k), Math.max(1, r.h * k));
    }
    g.globalAlpha = 1;
  });

  // Footer
  g.fillStyle = muted;
  g.font = `400 18px ${font}`;
  g.fillText(`Live, editable simulation: ${url ? "scan the code or use " : ""}the link in the post · ${SITE}`, pad, H - 20);
  g.textAlign = "right";
  g.fillText("Made with Speaker Box Genius", W - pad, H - 20);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export function ShareMenu(props: { state: AppState; designs: Design[]; shareUrl: () => string; notify?: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the menu and puts focus back on its button.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    addEventListener("mousedown", close);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", close);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied ✓`);
    } catch {
      prompt(`Copy ${what.toLowerCase()}:`, text);
    }
    setOpen(false);
  };

  const download = async () => {
    setOpen(false);
    if (props.designs.length === 0) return flash("Nothing to export yet");
    flash("Rendering image…");
    try {
      // Always the short link: it keeps the QR code small enough to scan from a forum post.
      const live = location.origin + location.pathname + "#" + (await encodeStateShort(props.state));
      const blob = await renderForumImage(props.state, props.designs, live);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${props.state.driverName.replace(/[^\w.-]+/g, " ").trim() || "speaker-box"}.png`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Image downloaded ✓");
    } catch (e) {
      flash(`Couldn't make the image: ${(e as Error).message}`);
    }
  };

  const downloadCsv = () => {
    setOpen(false);
    const csv = curvesCsv(props.state, props.designs);
    if (!csv) return flash("Nothing to export yet");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.state.driverName.replace(/[^\w.-]+/g, " ").trim() || "speaker-box"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Data downloaded ✓");
  };

  const downloadWpr = (d: AppState["designs"][number]) => {
    const out = wprFor(props.state, d);
    if (typeof out === "string") return flash(out);
    const url = URL.createObjectURL(new Blob([out.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${`${props.state.driverName} ${d.name}`.replace(/[^\w.-]+/g, " ").trim() || "speaker-box"}.wpr`;
    a.click();
    URL.revokeObjectURL(url);
    flash("WinISD project downloaded ✓");
    if (out.notes.length > 0) props.notify?.(`WinISD project saved. Not in it: ${out.notes.join("; ")}.`);
  };

  return (
    <div className="share" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        {msg || "Share ▾"}
      </button>
      {open && (
        <div className="share-menu" role="menu">
          <button role="menuitem" onClick={() => copy(props.shareUrl(), "Link")}>
            Copy link
          </button>
          <button role="menuitem" onClick={() => copy(markdownPost(props.state, props.designs, props.shareUrl()), "Reddit post")}>
            Copy for Reddit (Markdown)
          </button>
          <button role="menuitem" onClick={() => copy(bbcodePost(props.state, props.designs, props.shareUrl()), "diyAudio post")}>
            Copy for diyAudio (BBCode)
          </button>
          <button role="menuitem" onClick={download}>
            Download image (PNG)
          </button>
          <button role="menuitem" onClick={downloadCsv}>
            Download data (CSV)
          </button>
          {/* One WinISD project per box (a .wpr holds one), for the boxes WinISD can open. */}
          {props.state.designs
            .filter((d) => d.on && wprExportable(d))
            .map((d) => (
              <button key={d.id} role="menuitem" onClick={() => downloadWpr(d)}>
                Open in WinISD: {d.name} (.wpr)
              </button>
            ))}
          <p className="hint">Post the image and paste the text under it: the text carries the live link.</p>
          <hr />
          <a role="menuitem" className="menu-link" href={reportUrl(props.shareUrl())} target="_blank" rel="noopener">
            Report a problem with this design
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bug reports
// ---------------------------------------------------------------------------

/** Short browser and OS description, e.g. "Chrome 142 on Windows, 1400×900". */
export function browserInfo(): string {
  const ua = navigator.userAgent;
  // Order matters: Edge also says "Chrome", and Chrome also says "Safari".
  const browsers: [string, RegExp][] = [
    ["Edge", /Edg\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ];
  const hit = browsers.map(([name, re]) => [name, re.exec(ua)?.[1]] as const).find(([, v]) => v);
  const systems: [string, RegExp][] = [
    ["iOS", /iPhone|iPad/],
    ["Android", /Android/],
    ["Windows", /Windows/],
    ["macOS", /Mac OS X/],
    ["Linux", /Linux/],
  ];
  const os = systems.find(([, re]) => re.test(ua))?.[0] ?? "unknown OS";
  return `${hit ? `${hit[0]} ${hit[1]}` : "Unknown browser"} on ${os}, ${innerWidth}×${innerHeight}`;
}

/** New-issue link with the bug form's share-link and browser fields filled in. */
export function reportUrl(shareUrl: string): string {
  const q = new URLSearchParams({ template: "bug.yml", browser: browserInfo() });
  // GitHub refuses very long addresses; a huge design is better pasted by hand.
  if (shareUrl.length < 6000) q.set("link", shareUrl);
  return `${REPO}/issues/new?${q}`;
}
