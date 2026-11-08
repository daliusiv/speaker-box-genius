import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardCache, cardSalt } from "./cardCache.ts";

const jpg = (n: number) => new Uint8Array([0xff, 0xd8, n]);

test("a card drawn once is reused for the same SVG, and only for it", () => {
  const dir = mkdtempSync(join(tmpdir(), "cards-"));
  const a = new CardCache(dir, cardSalt("og v1"));
  assert.equal(a.get("<svg>A</svg>"), null);
  a.put("<svg>A</svg>", jpg(1));
  const b = new CardCache(dir, cardSalt("og v1"));
  assert.deepEqual([...b.get("<svg>A</svg>")!], [...jpg(1)]);
  assert.equal(b.get("<svg>B</svg>"), null);
  assert.equal(b.hits, 1);
  assert.equal(b.misses, 1);
});

test("a change to the card renderer (the salt) draws every card again", () => {
  const dir = mkdtempSync(join(tmpdir(), "cards-"));
  new CardCache(dir, cardSalt("og v1")).put("<svg>A</svg>", jpg(1));
  assert.equal(new CardCache(dir, cardSalt("og v2")).get("<svg>A</svg>"), null);
});

test("prune removes the cards this build didn't use", () => {
  const dir = mkdtempSync(join(tmpdir(), "cards-"));
  const first = new CardCache(dir, "s");
  first.put("<svg>old</svg>", jpg(1));
  first.put("<svg>kept</svg>", jpg(2));
  const next = new CardCache(dir, "s");
  assert.ok(next.get("<svg>kept</svg>"));
  assert.equal(next.prune(), 1);
  assert.equal(readdirSync(dir).length, 1);
  assert.ok(existsSync(join(dir, `${next.key("<svg>kept</svg>")}.jpg`)));
});
