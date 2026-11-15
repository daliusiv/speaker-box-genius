import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITED, fromDatabase, nameAfterTsEdit, nameKind, plainName, sameTs } from "../src/driverName.ts";

const source = { name: "18 Sound 6NMB420 (8 Ω)", ts: { fs: 110, qms: 2.7, qes: 0.38, vas_l: 6.1, re: 5.3, sd_cm2: 130 } };

test("a database driver's name is fixed until a T/S value changes", () => {
  assert.equal(nameKind(source.name, source.name), "database");
  assert.equal(nameKind(source.name + EDITED, source.name), "edited");
  assert.equal(nameKind("My woofer", source.name), "own");
  assert.equal(nameKind("Pasted driver", undefined), "own");
});

test("(edited) is added once, only when the values differ from the database's", () => {
  // Same values (a field typed back to what it was): no change.
  assert.equal(nameAfterTsEdit(source.name, source, { ...source.ts }), source.name);
  const edited = nameAfterTsEdit(source.name, source, { ...source.ts, vas_l: 6.5 });
  assert.equal(edited, "18 Sound 6NMB420 (8 Ω) (edited)");
  // Already edited: never added twice.
  assert.equal(nameAfterTsEdit(edited, source, { ...source.ts, vas_l: 7 }), edited);
  // Renamed by hand, typed or imported: left alone.
  assert.equal(nameAfterTsEdit("My woofer", source, { ...source.ts, fs: 50 }), "My woofer");
  assert.equal(nameAfterTsEdit("Pasted driver", null, { fs: 50 }), "Pasted driver");
  // A cleared value counts as a change.
  const { fs: _fs, ...noFs } = source.ts;
  assert.equal(nameAfterTsEdit(source.name, source, noFs), source.name + EDITED);
});

test("an edited database driver still counts as from the database (specs link, published values)", () => {
  assert.ok(fromDatabase(source.name, source));
  assert.ok(fromDatabase(source.name + EDITED, source));
  assert.ok(!fromDatabase("My woofer", source));
  assert.ok(!fromDatabase(source.name, null));
});

test("sameTs treats missing and undefined alike", () => {
  assert.ok(sameTs({ fs: 30, qms: undefined }, { fs: 30 }));
  assert.ok(!sameTs({ fs: 30 }, { fs: 31 }));
});

test("Submit to database (submit.ts) drops the notes the app adds to a name", () => {
  assert.equal(plainName("18 Sound 6NMB420 (8 Ω) (edited)"), "18 Sound 6NMB420 (8 Ω)");
  assert.equal(plainName("Example Audio EX10-4 (fictional)"), "Example Audio EX10-4");
  assert.equal(plainName("Scan 18W (measured) (edited)"), "Scan 18W");
});
