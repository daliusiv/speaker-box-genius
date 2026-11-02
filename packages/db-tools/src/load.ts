import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  SLUG_RE,
  validateBrand,
  validateDriver,
  validatePassiveRadiator,
  type Brand,
  type Driver,
  type PassiveRadiator,
} from "../../schema/src/index.ts";
import { checkConsistency } from "../../engine/src/ts.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** Relative differences above these fail CI / only warn. */
export const CONSISTENCY_ERROR = 0.15;
export const CONSISTENCY_WARN = 0.05;

export type Kind = "driver" | "passive-radiator";

export interface Entry<T> {
  id: string; // "<brand-slug>/<model-slug>"
  file: string; // repo-relative
  data: T;
}

export interface LoadResult {
  brands: Map<string, Brand>;
  drivers: Entry<Driver>[];
  passiveRadiators: Entry<PassiveRadiator>[];
  errors: string[];
  warnings: string[];
}

function readJson(path: string, errors: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`${relative(REPO_ROOT, path)}: invalid JSON (${(e as Error).message})`);
    return undefined;
  }
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
  } catch {
    return [];
  }
}

function loadTree(root: string, kind: Kind, result: LoadResult) {
  for (const brandSlug of listDirs(root)) {
    const brandDir = join(root, brandSlug);
    const relDir = relative(REPO_ROOT, brandDir);
    if (!SLUG_RE.test(brandSlug)) result.errors.push(`${relDir}: folder name must be a lowercase slug (a-z, 0-9, hyphens)`);

    for (const name of readdirSync(brandDir)) {
      const path = join(brandDir, name);
      const rel = relative(REPO_ROOT, path);
      if (statSync(path).isDirectory()) {
        result.errors.push(`${rel}: unexpected sub-folder (use <brand>/<model>.json)`);
        continue;
      }
      if (name === "_brand.json") {
        const data = readJson(path, result.errors);
        if (data === undefined) continue;
        const errs = validateBrand(data);
        errs.forEach((e) => result.errors.push(`${rel}: ${e}`));
        if (errs.length === 0) result.brands.set(brandSlug, data as Brand);
        continue;
      }
      if (!name.endsWith(".json")) {
        if (name !== "README.md") result.errors.push(`${rel}: only .json files belong here`);
        continue;
      }
      const modelSlug = name.slice(0, -".json".length);
      if (!SLUG_RE.test(modelSlug)) result.errors.push(`${rel}: file name must be a lowercase slug (a-z, 0-9, hyphens)`);

      const data = readJson(path, result.errors);
      if (data === undefined) continue;
      const id = `${brandSlug}/${modelSlug}`;

      if (kind === "driver") {
        const errs = validateDriver(data);
        errs.forEach((e) => result.errors.push(`${rel}: ${e}`));
        if (errs.length > 0) continue;
        const d = data as Driver;
        let consistent = true;
        for (const issue of checkConsistency(d.ts)) {
          if (issue.diff > CONSISTENCY_ERROR && d.inconsistency_reason === undefined) {
            consistent = false;
            result.errors.push(
              `${rel}: ${issue.message}. Over ${CONSISTENCY_ERROR * 100}% usually means a typo or unit mix-up. ` +
                `If the datasheet really says this, add an "inconsistency_reason" field explaining why.`,
            );
          } else if (issue.diff > CONSISTENCY_WARN) {
            result.warnings.push(`${rel}: ${issue.message}`);
          }
        }
        if (consistent) result.drivers.push({ id, file: rel, data: d });
      } else {
        const errs = validatePassiveRadiator(data);
        errs.forEach((e) => result.errors.push(`${rel}: ${e}`));
        if (errs.length === 0) result.passiveRadiators.push({ id, file: rel, data: data as PassiveRadiator });
      }
    }

    if (!result.brands.has(brandSlug) && !readdirSync(brandDir).includes("_brand.json")) {
      result.errors.push(`${relDir}: missing _brand.json`);
    }
  }
}

function findDuplicates<T extends { brand: string; model: string }>(entries: Entry<T>[], errors: string[]) {
  const seen = new Map<string, string>();
  for (const e of entries) {
    const key = `${e.data.brand}|${e.data.model}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
    const prev = seen.get(key);
    if (prev) errors.push(`${e.file}: duplicate of ${prev}`);
    else seen.set(key, e.file);
  }
}

/**
 * Load and validate the database.
 * @param base folder containing `drivers/` and `passive-radiators/` (defaults to the repo root)
 */
export function loadDatabase(base: string = REPO_ROOT): LoadResult {
  const result: LoadResult = { brands: new Map(), drivers: [], passiveRadiators: [], errors: [], warnings: [] };
  loadTree(join(base, "drivers"), "driver", result);
  loadTree(join(base, "passive-radiators"), "passive-radiator", result);
  findDuplicates(result.drivers, result.errors);
  findDuplicates(result.passiveRadiators, result.errors);
  return result;
}
