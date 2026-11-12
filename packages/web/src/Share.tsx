import { useEffect, useRef, useState } from "react";
import { lineFoldOf, limitsOf, portLimitOf, type Design } from "./sim.ts";
import { subtitle } from "./formats/csv.ts";
import { downloadBlob } from "./formats/download.ts";
import { safeName } from "./formats/types.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Sheet } from "./Sheet.tsx";
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
// Image
// ---------------------------------------------------------------------------

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "stroke-linejoin",
  "stroke-linecap",
  // Labels have a halo in the card's colour drawn under the text: without paint-order the halo
  // is painted over it, and the label shows as a dark speck (F3, Xmax, chuffing line labels).
  "paint-order",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
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
  // The cursor (line, dots and its frequency tag) is the viewer's, not the design's.
  clone.querySelectorAll("g.cursor, line.cursor, circle.cursor-dot, g.cursor-badge").forEach((el) => el.remove());
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
  // Each chart keeps its own shape (on a phone, or in a narrow window, they're drawn taller,
  // nearly 4:3) at the full column width; a row is as tall as its taller chart. Fitting every
  // chart into the shortest one's height shrank the taller ones to a narrow strip.
  const chartW = colW - 16;
  const heightOfChart = (f: HTMLElement) => {
    const vb = f.querySelector("svg")?.viewBox.baseVal;
    const r = vb && vb.width > 0 ? vb.height / vb.width : 260 / 640;
    return Math.round(chartW * Math.min(Number.isFinite(r) ? r : 260 / 640, 470 / 640));
  };
  const chartHs = figures.map(heightOfChart);
  const rowHs = Array.from({ length: Math.ceil(figures.length / 2) }, (_, r) => Math.max(chartHs[2 * r] ?? 0, chartHs[2 * r + 1] ?? 0) + 48);
  const rowTop = (r: number) => rowHs.slice(0, r).reduce((a, h) => a + h + pad, 0);
  const rows = summaryRows(state, designs);
  const tableTop = 130;
  const rowH = 34;
  const chartsTop = tableTop + rowH * (rows.length + 1) + 30;
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
  const foldsTop = chartsTop + rowTop(rowHs.length);
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
    const row = Math.floor(i / 2);
    const y = chartsTop + rowTop(row);
    const chartH = chartHs[i]!;
    g.fillStyle = card;
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x, y, colW, rowHs[row]!, 12);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.font = `600 18px ${font}`;
    // The on-screen title may carry a chart-switcher arrow: not part of the picture.
    g.fillText((fig.querySelector(".chart-title")?.textContent ?? "").replace(/\s*▾\s*$/, ""), x + 16, y + 30);
    const img = await loadImage(standaloneSvg(svg, chartW, chartH));
    g.drawImage(img, x + 8, y + 40, chartW, chartH);
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
// Share window
// ---------------------------------------------------------------------------

/** The Share button in the header and its window. */
export function ShareButton(props: { state: AppState; designs: Design[]; shareUrl: () => string; notify: (msg: string) => void; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="share">
      <button type="button" className="share-button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Link, forum posts and image">
        <Icon name="share" />
        <span className="share-label">Share</span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share design"
        className="share-window"
        footer={
          <p className="share-foot">
            Need CSV, WinISD or LTspice files?{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setOpen(false);
                props.onExport();
              }}
            >
              Save &amp; Export
            </button>
          </p>
        }
      >
        <ShareBody {...props} />
      </Sheet>
    </div>
  );
}

const canCopyImage = () => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
const touchFirst = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** Rendered only while the window is open (Sheet), so the image is made fresh each time. */
function ShareBody(props: { state: AppState; designs: Design[]; shareUrl: () => string; notify: (msg: string) => void }) {
  const { state, designs } = props;
  const [link] = useState(props.shareUrl);
  const [png, setPng] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [imgError, setImgError] = useState("");
  const [done, setDone] = useState("");
  const timer = useRef(0);
  const name = safeName(state.driverName);

  useEffect(() => {
    if (designs.length === 0) return setImgError("Nothing to show yet.");
    let live = true;
    void (async () => {
      try {
        // Always the short link: it keeps the QR code small enough to scan from a forum post.
        const short = location.origin + location.pathname + "#" + (await encodeStateShort(state));
        const blob = await renderForumImage(state, designs, short);
        if (live) setPng(blob);
      } catch (e) {
        if (live) setImgError(`Couldn't make the image: ${(e as Error).message}`);
      }
    })();
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
    // Made once per opening, from the design as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!png) return;
    const url = URL.createObjectURL(png);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [png]);

  /** "✓ Copied" on the button that was pressed, for 2 s. */
  const flash = (key: string) => {
    setDone(key);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(""), 2000);
  };

  const copy = async (key: string, text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(key);
    } catch {
      prompt(`Copy the ${what}:`, text);
    }
  };

  const copyImage = async () => {
    if (!png) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("img");
    } catch {
      props.notify("This browser won't copy images: download the PNG instead.");
    }
  };

  const nativeShare = async () => {
    const text = `${state.driverName}: box simulation in Speaker Box Genius`;
    const file = png ? new File([png], `${name}.png`, { type: "image/png" }) : null;
    const withFile = file && navigator.canShare?.({ files: [file] }) ? { files: [file] } : {};
    try {
      await navigator.share({ title: state.driverName, text, url: link, ...withFile });
    } catch {
      /* cancelled */
    }
  };

  const label = (key: string, icon: IconName, text: string) => (
    <>
      <Icon name={done === key ? "check" : icon} />
      {done === key ? "Copied" : text}
    </>
  );

  return (
    <>
      {typeof navigator.share === "function" && touchFirst() && (
        <button type="button" className="sheet-action share-native" onClick={nativeShare}>
          <Icon name="share" />
          Share to an app…
        </button>
      )}

      <section className="sheet-section">
        <p className="menu-label">Live link</p>
        <div className="link-row">
          <input type="text" readOnly value={link} aria-label="Link to this design" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className={done === "link" ? "copied" : ""} onClick={() => copy("link", link, "link")}>
            {label("link", "link", "Copy link")}
          </button>
        </div>
        <p className="hint">Opens exactly what you see: every driver value, box and setting.</p>
      </section>

      <section className="sheet-section">
        <p className="menu-label">Forum image</p>
        <div className="share-preview">
          {preview ? <img src={preview} alt="The image to post: summary table, charts and a QR code to the live design" /> : <span className="hint">{imgError || "Drawing the image…"}</span>}
        </div>
        <div className="share-grid">
          <button type="button" className="secondary" disabled={!png} onClick={() => png && downloadBlob(png, `${name}.png`)}>
            <Icon name="download" />
            Download PNG
          </button>
          {canCopyImage() && (
            <button type="button" className={`secondary${done === "img" ? " copied" : ""}`} disabled={!png} onClick={copyImage}>
              {label("img", "image", "Copy image")}
            </button>
          )}
        </div>
      </section>

      <section className="sheet-section">
        <p className="menu-label">Copy forum post</p>
        <div className="share-grid">
          <button type="button" className={`secondary${done === "md" ? " copied" : ""}`} onClick={() => copy("md", markdownPost(state, designs, link), "Reddit post")}>
            {label("md", "markdown", "Reddit")}
          </button>
          <button type="button" className={`secondary${done === "bb" ? " copied" : ""}`} onClick={() => copy("bb", bbcodePost(state, designs, link), "diyAudio post")}>
            {label("bb", "bbcode", "diyAudio")}
          </button>
        </div>
        <p className="hint">Post the image, then paste the text under it: the text has the numbers and the live link.</p>
      </section>
    </>
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
