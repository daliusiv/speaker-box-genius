import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";

/**
 * The dev repo's Cloudflare preview must be built exactly like the public GitHub Pages site, so
 * what's tested in the preview is what goes live. Compare the build steps of the two workflows:
 * everything from checkout to `pnpm build:site`.
 */
function buildSteps(file: string): string {
  const s = readFileSync(join(REPO_ROOT, ".github", "workflows", file), "utf8");
  const start = s.indexOf("      - uses: actions/checkout@v4");
  const endMark = "        run: pnpm build:site\n";
  const end = s.indexOf(endMark);
  assert.ok(start > 0 && end > start, `${file}: build steps found`);
  return s.slice(start, end + endMark.length);
}

test("preview.yml builds the site with the same steps as deploy-pages.yml", () => {
  assert.equal(buildSteps("preview.yml"), buildSteps("deploy-pages.yml"));
});

test("each deploy workflow runs in one repo only", () => {
  const pages = readFileSync(join(REPO_ROOT, ".github", "workflows", "deploy-pages.yml"), "utf8");
  const preview = readFileSync(join(REPO_ROOT, ".github", "workflows", "preview.yml"), "utf8");
  assert.ok(pages.includes("if: ${{ github.event.repository.private != true }}"));
  assert.ok(preview.includes("if: ${{ github.event.repository.private == true }}"));
  assert.ok(preview.includes("site/preview.ts packages/web/dist"));
});

test("the preview Worker serves the built site", () => {
  const cfg = readFileSync(join(REPO_ROOT, ".github", "cloudflare", "wrangler.jsonc"), "utf8");
  assert.doesNotMatch(cfg, /"name"|workers\.dev/, "the Worker's name and URL stay out of the (public) code");
  assert.match(cfg, /"directory": "\.\.\/\.\.\/packages\/web\/dist"/);
  const preview = readFileSync(join(REPO_ROOT, ".github", "workflows", "preview.yml"), "utf8");
  assert.equal(preview.split('--config .github/cloudflare/wrangler.jsonc --name "$WORKER"').length - 1, 2, "deploy and versions upload use the config and the repo variable");
  assert.doesNotMatch(preview, /daliusiv|speaker-box-genius-dev/, "no account or Worker names in the workflow");
});

test("the public sync runs only in the private repo and names no repos or accounts", () => {
  const sync = readFileSync(join(REPO_ROOT, ".github", "workflows", "sync-public.yml"), "utf8");
  assert.ok(sync.includes("if: ${{ github.event.repository.private == true }}"));
  assert.ok(sync.includes("bash scripts/sync-public.sh"));
  assert.ok(sync.includes("${{ vars.PUBLIC_REPO }}"), "public repo comes from a variable");
  assert.doesNotMatch(sync, /daliusiv|speaker-box-genius|workers\.dev/);
  const script = readFileSync(join(REPO_ROOT, "scripts", "sync-public.sh"), "utf8");
  assert.doesNotMatch(script, /daliusiv|speaker-box-genius-dev|workers\.dev/);
});
