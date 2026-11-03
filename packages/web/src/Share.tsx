import { useEffect, useRef, useState } from "react";
import { PORT_LIMIT, type Design } from "./sim.ts";
import { fmtQ } from "./units.ts";
import type { AppState } from "./state.ts";

const SITE = "daliusiv.github.io/speaker-box-genius";

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
  const fMin = state.highPass.on ? 10 : 15;
  const peak = (a: Float64Array | null, f: Float64Array) => {
    if (!a) return null;
    let m = 0;
    for (let i = 0; i < a.length; i++) if (f[i]! >= fMin && a[i]! > m) m = a[i]!;
    return m;
  };
  const n = (v: number | null | undefined, unit: string, digits = 1) =>
    v === null || v === undefined || !Number.isFinite(v) ? "–" : `${v.toFixed(digits)} ${unit}`;
  return designs.map(({ design: d, color, vb_l, result: r }) => {
    const x = peak(r.excursionMm, r.freq);
    const xpr = peak(r.prExcursionMm, r.freq);
    const vp = peak(r.portVelocity, r.freq);
    return {
      name: d.name,
      color,
      cells: [fmtQ(vb_l, "vol", state.settings.units), n(r.summary.fb ?? r.summary.fc, "Hz"), n(r.summary.f3, "Hz"), n(x, "mm"), n(xpr, "mm"), n(vp, "m/s")],
      over: [
        false,
        false,
        false,
        x !== null && x > state.xmax_mm,
        xpr !== null && d.kind === "pr" && xpr > d.params.xmax_mm,
        vp !== null && vp > PORT_LIMIT,
      ],
    };
  });
}

function subtitle(state: AppState): string {
  const parts = [`${state.power} W`];
  if (state.drivers > 1) parts.push(`${state.drivers} drivers`);
  if (state.highPass.on) parts.push(`${state.highPass.order * 6} dB/oct high-pass at ${state.highPass.freq} Hz`);
  parts.push(`Xmax ${state.xmax_mm} mm`);
  return parts.join(" · ");
}

export function markdownPost(state: AppState, designs: Design[], url: string): string {
  const rows = summaryRows(state, designs);
  return [
    `**${state.driverName}** (${subtitle(state)})`,
    "",
    `| ${HEAD.join(" | ")} |`,
    `|${HEAD.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.name} | ${r.cells.join(" | ")} |`),
    "",
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
  for (const { design: d, result: r } of designs) {
    const add = (what: string, data: Float64Array | null) => data && cols.push({ head: `${d.name}: ${what}`, data });
    add("SPL (dB)", r.spl);
    add("Cone excursion (mm peak)", r.excursionMm);
    add("PR excursion (mm peak)", r.prExcursionMm);
    add(`Port velocity (m/s ${vel})`, r.portVelocity);
    add("Impedance (ohm)", r.impedanceOhm);
    add("Impedance phase (deg)", r.impedancePhaseDeg);
    add("Group delay (ms)", r.groupDelayMs);
    add("Max SPL (dB)", r.maxSpl);
    add("Max power (W)", r.maxPowerW);
  }
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const freq = designs[0]!.result.freq;
  const lines = [
    `# ${state.driverName}, ${subtitle(state)}, 1 m half space, air: ${state.settings.air}`,
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
  clone.querySelectorAll("[id]").forEach((el, i) => {
    const old = el.id;
    const id = `x${i}`;
    el.id = id;
    clone.querySelectorAll(`[clip-path]`).forEach((ref) => {
      if (ref.getAttribute("clip-path") === `url(#${old})`) ref.setAttribute("clip-path", `url(#${id})`);
    });
  });
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
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

export async function renderForumImage(state: AppState, designs: Design[]): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const col = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = col("--bg", "#f5f5f4");
  const fg = col("--fg", "#1c1917");
  const muted = col("--muted", "#78716c");
  const card = col("--card", "#ffffff");
  const border = col("--border", "#e7e5e4");
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

  const figures = [...document.querySelectorAll<HTMLElement>("figure.chart")].slice(0, 4);
  const W = 1600;
  const pad = 32;
  const colW = (W - pad * 3) / 2;
  const chartH = Math.round((colW * 260) / 640);
  const rows = summaryRows(state, designs);
  const tableTop = 130;
  const rowH = 34;
  const chartsTop = tableTop + rowH * (rows.length + 1) + 30;
  const chartBlock = chartH + 48;
  const H = chartsTop + Math.ceil(figures.length / 2) * (chartBlock + pad) + 50;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Header
  g.fillStyle = fg;
  g.font = `700 34px ${font}`;
  g.fillText(state.driverName, pad, 58);
  g.fillStyle = muted;
  g.font = `400 20px ${font}`;
  g.fillText(`${subtitle(state)} · 1 m, half space`, pad, 92);

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

  // Footer
  g.fillStyle = muted;
  g.font = `400 18px ${font}`;
  g.fillText(`Live, editable simulation (link in post): ${SITE}`, pad, H - 20);
  g.textAlign = "right";
  g.fillText("Made with Speaker Box Genius", W - pad, H - 20);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export function ShareMenu(props: { state: AppState; designs: Design[]; shareUrl: () => string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
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
      const blob = await renderForumImage(props.state, props.designs);
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
          <p className="hint">Post the image and paste the text under it: the text carries the live link.</p>
        </div>
      )}
    </div>
  );
}
