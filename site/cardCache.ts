/**
 * Share cards kept between deploys, so only the cards that changed are drawn again.
 *
 * A card is drawn from its SVG (site/og.ts), and the SVG holds everything that decides the image:
 * the driver's name and boxes and the simulated curves. So the cache is keyed by a hash of the
 * SVG, salted with og.ts's own source (how the SVG becomes a JPEG): when a driver's data, the
 * engine or the card's look changes, the SVG or the salt changes and that card is drawn again;
 * otherwise the JPEG from the last deploy is reused. The deploy workflow keeps the folder with
 * actions/cache.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class CardCache {
  private used = new Set<string>();
  hits = 0;
  misses = 0;

  readonly dir: string;
  private readonly salt: string;

  constructor(dir: string, salt: string) {
    this.dir = dir;
    this.salt = salt;
    mkdirSync(dir, { recursive: true });
  }

  key(svg: string): string {
    return createHash("sha256").update(this.salt).update("\0").update(svg).digest("hex").slice(0, 40);
  }

  /** The cached JPEG for this card, if it was drawn before. */
  get(svg: string): Buffer | null {
    const k = this.key(svg);
    this.used.add(k);
    const file = join(this.dir, `${k}.jpg`);
    if (!existsSync(file)) {
      this.misses++;
      return null;
    }
    this.hits++;
    return readFileSync(file);
  }

  put(svg: string, jpg: Uint8Array): void {
    const k = this.key(svg);
    this.used.add(k);
    writeFileSync(join(this.dir, `${k}.jpg`), jpg);
  }

  /** Remove cards this build didn't use (drivers gone or changed), so the cache doesn't grow. Returns how many. */
  prune(): number {
    let n = 0;
    for (const f of readdirSync(this.dir)) {
      if (f.endsWith(".jpg") && !this.used.has(f.slice(0, -4))) {
        rmSync(join(this.dir, f));
        n++;
      }
    }
    return n;
  }
}

/** The salt for the cache key: the card renderer's source, so changing how cards are drawn redraws them all. */
export function cardSalt(ogSource: string): string {
  return createHash("sha256").update(ogSource).digest("hex");
}
