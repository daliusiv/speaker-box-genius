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
  assert.match(preview, /\$\{\{ github\.event\.repository\.private == true && /, "preview: private repo only");
  assert.ok(preview.includes("contains(github.event.pull_request.labels.*.name, 'preview')"), "a pull request needs the preview label");
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

test("the submit Worker deploys from the private repo only and keeps names and secrets out of the code", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "submit-worker.yml"), "utf8");
  assert.ok(wf.includes("if: ${{ github.event.repository.private == true }}"));
  assert.ok(wf.includes('--config .github/cloudflare/submit-worker.jsonc --name "$WORKER"'));
  assert.ok(wf.includes("${{ vars.CF_SUBMIT_WORKER_NAME }}"));
  assert.doesNotMatch(wf, /daliusiv|speaker-box-genius|workers\.dev/);
  const cfg = readFileSync(join(REPO_ROOT, ".github", "cloudflare", "submit-worker.jsonc"), "utf8");
  assert.doesNotMatch(cfg, /"name"\s*:\s*"(?!PER_IP)/, "no Worker name in the config");
  assert.doesNotMatch(cfg, /GH_APP_PRIVATE_KEY"\s*:|TURNSTILE_SECRET"\s*:|TARGET_REPO"\s*:|daliusiv|workers\.dev/, "secrets and the repo stay in the dashboard");
  assert.match(cfg, /"workers_dev": false/);
  assert.match(cfg, /"keep_vars": true/, "a deploy must not wipe DRY_RUN / TARGET_REPO / EXTRA_ORIGINS set in the dashboard");
  assert.match(cfg, /"observability": \{ "enabled": false \}/);
  assert.match(cfg, /"period": (10|60)/, "the rate limit binding only takes 10 or 60 s");
});

test("data-only changes from public merge themselves; anything else waits for a person", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "merge-public-data.yml"), "utf8");
  assert.ok(wf.includes("github.event.repository.private == true"), "dev repo only");
  assert.ok(wf.includes("github.event.workflow_run.head_branch == 'sync/from-public'"), "only the sync's branch");
  assert.ok(wf.includes(`grep -Ev '^(drivers|passive-radiators)/'`), "data-only rule");
  assert.ok(wf.includes("-f sha=\"$sha\""), "merges the head that was checked, nothing newer");
  assert.match(wf, /\^check\|completed\|success\$/, "CI must have passed");
  assert.doesNotMatch(wf, /daliusiv|speaker-box-genius|workers\.dev/);
  // The PR it merges is the one sync-public.yml opens.
  const sync = readFileSync(join(REPO_ROOT, ".github", "workflows", "sync-public.yml"), "utf8");
  assert.ok(sync.includes("INCOMING_BRANCH: sync/from-public"));
});

test("the Search Console report runs in the private repo only, read-only, with the key in a secret", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "search-console.yml"), "utf8");
  assert.ok(wf.includes("if: ${{ github.event.repository.private == true }}"), "dev repo only");
  assert.ok(wf.includes("${{ secrets.GSC_SERVICE_ACCOUNT }}"));
  assert.match(wf, /permissions:\n  contents: read\n  issues: write\n/);
  assert.doesNotMatch(wf, /daliusiv|speaker-box-genius-dev|workers\.dev/);
  const script = readFileSync(join(REPO_ROOT, "scripts", "search-console.ts"), "utf8");
  assert.ok(script.includes("auth/webmasters.readonly"), "read-only scope");
});

test("uptime alerts run in the private repo only and pass the payload through env, never inline", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "uptime.yml"), "utf8");
  assert.ok(wf.includes("if: ${{ github.event.repository.private == true }}"), "dev repo only");
  assert.match(wf, /repository_dispatch:\n    types: \[uptime\]/);
  assert.match(wf, /permissions:\n  issues: write\n/);
  const run = wf.slice(wf.indexOf("        run: |"));
  assert.doesNotMatch(run, /\$\{\{/, "no ${{ }} inside the script (payload is untrusted)");
  assert.doesNotMatch(wf, /daliusiv|speaker-box-genius-dev|workers\.dev/);
});
