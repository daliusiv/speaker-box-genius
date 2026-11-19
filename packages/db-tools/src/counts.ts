/**
 * The database's size as the README, docs and site pages state it ("about 1,800 drivers",
 * "59 passive radiators", "21 brands"). site/counts.test.ts fails CI when a stated count drifts from
 * the database; the submission bots use fixCounts() to update the text in the same pull request
 * when an entry adds a brand. One module, so the check and the fix can't disagree. Pure: no `fs`.
 */

export interface Totals {
  drivers: number;
  prs: number;
  brands: number;
}

/** Where counts are stated: README.md plus every .md file directly in these folders. */
export const COUNT_DIRS = ["docs", "site", "site/pages"] as const;

/** README.md and docs/x.md, site/x.md, site/pages/x.md (not deeper). */
export function isCountFile(path: string): boolean {
  return path === "README.md" || COUNT_DIRS.some((d) => path.startsWith(`${d}/`) && path.endsWith(".md") && !path.slice(d.length + 1).includes("/"));
}

const DRIVERS_RE = /(about |over |~)?(\d[\d,]{2,}) drivers/gi;
const PRS_RE = /(\d+) passive radiators/g;
const BRANDS_RE = /(\d+) brands/g;

const num = (s: string) => Number(s.replace(/,/g, ""));
const comma = (n: number) => n.toLocaleString("en-GB");

function driversOk(prefix: string | undefined, n: number, actual: number): boolean {
  return prefix?.toLowerCase() === "over " ? n <= actual && n >= actual * 0.9 : Math.abs(n - actual) <= actual * 0.02;
}
const prsOk = (n: number, actual: number) => Math.abs(n - actual) <= Math.max(1, actual * 0.02);

/** Every stated count in `text` that doesn't match the database, as "file: "…" (the database has N)". */
export function countProblems(file: string, text: string, t: Totals): string[] {
  const wrong: string[] = [];
  for (const m of text.matchAll(DRIVERS_RE)) if (!driversOk(m[1], num(m[2]!), t.drivers)) wrong.push(`${file}: "${m[0]}" (the database has ${t.drivers})`);
  for (const m of text.matchAll(PRS_RE)) if (!prsOk(num(m[1]!), t.prs)) wrong.push(`${file}: "${m[0]}" (the database has ${t.prs})`);
  for (const m of text.matchAll(BRANDS_RE)) if (num(m[1]!) !== t.brands) wrong.push(`${file}: "${m[0]}" (the database has ${t.brands})`);
  return wrong;
}

/** How many driver-count mentions there are (the test checks the counts are stated at all). */
export const driverMentions = (text: string) => [...text.matchAll(DRIVERS_RE)].length;

/**
 * The text with its counts brought in line: brands always exact; drivers and passive radiators
 * only when outside the test's tolerance ("over" rounds down to the hundred, "about" to the ten,
 * a bare number becomes exact), so a normal submission leaves the wording alone.
 */
export function fixCounts(text: string, t: Totals): string {
  return text
    .replace(DRIVERS_RE, (all, prefix: string | undefined, n: string) => {
      if (driversOk(prefix, num(n), t.drivers)) return all;
      const p = prefix?.toLowerCase();
      const v = p === "over " ? Math.floor(t.drivers / 100) * 100 : p ? Math.round(t.drivers / 10) * 10 : t.drivers;
      return `${prefix ?? ""}${comma(v)} drivers`;
    })
    .replace(PRS_RE, (all, n: string) => (prsOk(num(n), t.prs) ? all : `${t.prs} passive radiators`))
    .replace(BRANDS_RE, (all, n: string) => (num(n) === t.brands ? all : `${t.brands} brands`));
}

/**
 * The totals from a list of repo paths (the submit Worker reads the repo's file tree): entries are
 * `drivers/<brand>/<model>.json` and `passive-radiators/<brand>/<model>.json`; a brand is a folder
 * with a `_brand.json` in either.
 */
export function totalsFromPaths(paths: Iterable<string>): Totals {
  let drivers = 0;
  let prs = 0;
  const brands = new Set<string>();
  for (const p of paths) {
    const m = /^(drivers|passive-radiators)\/([^/]+)\/([^/]+)\.json$/.exec(p);
    if (!m) continue;
    if (m[3] === "_brand") brands.add(m[2]!);
    else if (m[1] === "drivers") drivers++;
    else prs++;
  }
  return { drivers, prs, brands: brands.size };
}
