/**
 * Share-card images (og:image, 1200 × 630 JPEG) for the driver pages. Facebook, Reddit,
 * Discord and the rest won't show SVG, so each card is drawn as SVG here and turned into a
 * JPEG by headless Chrome, driven over the DevTools protocol with Node's own WebSocket: no
 * dependency. GitHub's Ubuntu runners have Chrome installed; without it the pages keep the
 * site's own card.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CARD_W = 1200;
export const CARD_H = 630;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "Inter, 'Segoe UI', Roboto, 'DejaVu Sans', Arial, sans-serif";

export interface CardCurve {
  color: string;
  label: string;
  /** [frequency, dB relative] */
  points: [number, number][];
}

/** A driver page's card: name, what it is, one line per box, and the response curves. */
export function cardSvg(o: { title: string; subtitle: string; rows: { color: string; text: string }[]; curves: CardCurve[] }): string {
  // Chart area on the right.
  const cx = 600, cy = 190, cw = 540, ch = 330;
  const fMin = 10, fMax = 500, dbMin = -30, dbMax = 5;
  const x = (f: number) => cx + (Math.log(f / fMin) / Math.log(fMax / fMin)) * cw;
  const y = (db: number) => cy + ((dbMax - db) / (dbMax - dbMin)) * ch;
  const grid = [
    ...[20, 50, 100, 200].map((f) => `<line x1="${x(f).toFixed(1)}" x2="${x(f).toFixed(1)}" y1="${cy}" y2="${cy + ch}"/>`),
    ...[0, -10, -20, -30].map((d) => `<line x1="${cx}" x2="${cx + cw}" y1="${y(d).toFixed(1)}" y2="${y(d).toFixed(1)}"/>`),
  ].join("");
  const labels = [20, 50, 100, 200].map((f) => `<text x="${x(f).toFixed(1)}" y="${cy + ch + 30}" text-anchor="middle">${f} Hz</text>`).join("");
  const paths = o.curves
    .map((c) => {
      let d = "";
      let pen = false;
      for (const [f, v] of c.points) {
        if (f < fMin || f > fMax || !Number.isFinite(v) || v < dbMin) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${x(f).toFixed(1)} ${y(Math.min(v, dbMax)).toFixed(1)}`;
        pen = true;
      }
      return `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join("");
  // Long names get a smaller title.
  const tSize = o.title.length > 26 ? 52 : o.title.length > 20 ? 60 : 68;
  const rows = o.rows
    .slice(0, 3)
    .map((r, i) => `<rect x="60" y="${352 + i * 62}" width="22" height="22" rx="5" fill="${r.color}"/><text x="98" y="${371 + i * 62}" class="row">${esc(r.text)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<style>text{font-family:${FONT};fill:#e6e9ef}.sub{fill:#8e96aa;font-size:30px}.row{font-size:30px;font-weight:600}.ax{fill:#8e96aa;font-size:20px}.brand{font-size:28px;font-weight:700}</style>
<rect width="100%" height="100%" fill="#11141a"/>
<rect x="0" y="0" width="${CARD_W}" height="10" fill="#4ed7e9"/>
<text x="60" y="${110 + (68 - tSize) / 3}" font-size="${tSize}" font-weight="800"${o.title.length > 34 ? ` textLength="1080" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(o.title)}</text>
<text x="60" y="${170}" class="sub">${esc(o.subtitle)}</text>
<text x="60" y="300" class="sub">Suggested boxes</text>
${rows}
<rect x="${cx - 20}" y="${cy - 30}" width="${cw + 40}" height="${ch + 80}" rx="18" fill="#1a1e26"/>
<g stroke="#282d37" stroke-width="2">${grid}</g>
<g class="ax">${labels}</g>
${paths}
<g transform="translate(60 568)"><rect width="40" height="40" rx="9" fill="#1a1e26"/><circle cx="20" cy="24" r="10" fill="none" stroke="#fb923c" stroke-width="4"/><circle cx="20" cy="9" r="3" fill="#8e96aa"/><text x="56" y="30" class="brand">Speaker Box Genius</text></g>
<text x="${CARD_W - 60}" y="598" text-anchor="end" class="sub" font-size="26">speakerboxgenius.com</text>
</svg>`;
}

/** Chrome to draw with: CHROME_PATH, or the usual install locations. */
export function findChrome(): string | null {
  const c = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return c.find((p): p is string => !!p && existsSync(p)) ?? null;
}

/** One headless Chrome tab, driven over the DevTools protocol. */
export class Rasterizer {
  private proc!: ChildProcess;
  private ws!: WebSocket;
  private dir!: string;
  private id = 0;
  private waiting = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>();
  private loaded: (() => void) | null = null;

  static async start(chrome: string): Promise<Rasterizer> {
    const r = new Rasterizer();
    r.dir = mkdtempSync(join(tmpdir(), "sbg-chrome-"));
    r.proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${r.dir}`, "about:blank"], {
      stdio: "ignore",
      // Its own process group, so closing stops Chrome's helper processes too.
      detached: process.platform !== "win32",
    });
    try {
      await r.connect();
    } catch (e) {
      await r.close();
      throw e;
    }
    await r.send("Page.enable");
    await r.send("Emulation.setDeviceMetricsOverride", { width: CARD_W, height: CARD_H, deviceScaleFactor: 1, mobile: false });
    // Transparent page, so PNGs keep the rounded corners of the app icon.
    await r.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    return r;
  }

  /** Finds the port Chrome chose and connects to its tab. */
  private async connect() {
    // Chrome writes the port it picked to DevToolsActivePort.
    const file = join(this.dir, "DevToolsActivePort");
    // Allow 30 s: a cold start on a busy CI machine can be slow.
    for (let i = 0; i < 600 && !existsSync(file); i++) await new Promise((ok) => setTimeout(ok, 50));
    if (!existsSync(file)) throw new Error("Chrome didn't start");
    const port = readFileSync(file, "utf8").split("\n")[0];
    const tabs = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const tab = tabs.find((t) => t.type === "page");
    if (!tab) throw new Error("Chrome has no tab");
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise<void>((ok, fail) => {
      this.ws.onopen = () => ok();
      this.ws.onerror = () => fail(new Error("Couldn't connect to Chrome"));
    });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id !== undefined) {
        const w = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        if (m.error) w?.fail(new Error(m.error.message));
        else w?.ok(m.result);
      } else if (m.method === "Page.loadEventFired") this.loaded?.();
    };
  }

  private send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => this.waiting.set(id, { ok, fail }));
  }

  private size = { width: CARD_W, height: CARD_H };

  /**
   * The SVG (or, with `html`, a whole HTML page) as an image: a share card by default
   * (1200 × 630 JPEG, a third the size of a PNG).
   */
  async image(svg: string, o: { width?: number; height?: number; format?: "jpeg" | "png"; html?: boolean } = {}): Promise<Buffer> {
    const width = o.width ?? CARD_W;
    const height = o.height ?? CARD_H;
    if (width !== this.size.width || height !== this.size.height) {
      await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      this.size = { width, height };
    }
    const file = join(this.dir, o.html ? "card.html" : "card.svg");
    writeFileSync(file, svg);
    const loaded = new Promise<void>((ok) => (this.loaded = ok));
    await this.send("Page.navigate", { url: `file://${file}?${this.id}` });
    await loaded;
    const format = o.format ?? "jpeg";
    const { data } = await this.send("Page.captureScreenshot", {
      format,
      ...(format === "jpeg" ? { quality: 80 } : {}),
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(data, "base64");
  }

  /**
   * Stops Chrome, waits for it to exit (it keeps writing to its profile while shutting down),
   * then removes the profile. Cleanup never fails the build: the cards are already written.
   */
  async close() {
    try {
      this.ws.close();
    } catch {}
    const stop = (signal: NodeJS.Signals) => {
      try {
        // The whole group (Chrome and its helpers), where there is one.
        if (process.platform !== "win32" && this.proc.pid) process.kill(-this.proc.pid, signal);
        else this.proc.kill(signal);
      } catch {}
    };
    if (this.proc.exitCode === null && this.proc.signalCode === null) {
      const exited = new Promise<void>((ok) => this.proc.once("exit", () => ok()));
      stop("SIGTERM");
      // Give it 5 s, then insist.
      const timer = setTimeout(() => stop("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
    // Helpers can outlive the main process by a moment.
    stop("SIGKILL");
    try {
      rmSync(this.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
      console.warn(`Couldn't remove Chrome's temporary profile ${this.dir}: ${(e as Error).message}`);
    }
  }
}
