import { test } from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../src/env.ts";
import { appJwt, GitHub } from "../src/github.ts";
import { handle, MAX_BODY, type Deps } from "../src/index.ts";
import { link, md, prBody } from "../src/prBody.ts";
import { buildRecord } from "../../db-tools/src/submission.ts";

const ORIGIN = "https://speakerboxgenius.com";
const REPO = "owner/public";
const NOW = Date.parse("2026-11-18T15:00:00Z");

const env = (over: Partial<Env> = {}): Env => ({
  GH_APP_ID: "1",
  GH_APP_PRIVATE_KEY: "unused",
  GH_INSTALLATION_ID: "2",
  TARGET_REPO: REPO,
  TURNSTILE_SECRET: "real-secret",
  ALLOWED_ORIGINS: `${ORIGIN}, https://preview.example.dev`,
  ...over,
});

const EDGE = {
  kind: "driver",
  brand: "edge",
  model: "eds15d2-e3",
  type: "subwoofer",
  nominal_ohms: 2,
  voice_coils: 2,
  ts_wiring: "series",
  size_in: 15,
  ts: { fs: 36, qms: 4.122, qes: 0.612, qts: 0.533, vas_l: 8.187, re: 3.6, le_mh: 2.4, bl: 19.6, mms_g: 283, sd_cm2: 295, xmax_mm: 28.5, pe_w: 1850 },
  source_url: "https://edgecaraudio.com/products/edge-street-series-eds15d2-e3-subwoofer",
  credit: "@theo",
  consent: true,
  turnstile: "tok",
  website: "",
  form_version: 1,
};

interface Fake {
  files: Map<string, string>;
  branches: Set<string>;
  pulls: { state: string; created_at: string; labels: { name: string }[] }[];
  calls: string[];
  turnstile: { success: boolean; hostname?: string; action?: string };
  failPull?: boolean;
  deletedRefs: string[];
}

function fake(over: Partial<Fake> = {}): Fake {
  return { files: new Map(), branches: new Set(), pulls: [], calls: [], turnstile: { success: true, hostname: "speakerboxgenius.com", action: "submit-driver" }, deletedRefs: [], ...over };
}

function deps(f: Fake): Deps {
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    f.calls.push(`${method} ${url.replace("https://api.github.com", "")}`);
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.includes("challenges.cloudflare.com")) return ok(f.turnstile);
    const path = url.replace(`https://api.github.com/repos/${REPO}`, "");
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^\/contents\/(.+)$/))) {
      const p = m[1]!.split("/").map(decodeURIComponent).join("/");
      const t = f.files.get(p);
      return t === undefined ? ok({}, 404) : ok({ content: Buffer.from(t).toString("base64"), encoding: "base64" });
    }
    if ((m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const b = m[1]!.split("/").map(decodeURIComponent).join("/");
      if (b === "main") return ok({ object: { sha: "base-sha" } });
      return f.branches.has(b) ? ok({ object: { sha: "x" } }) : ok({}, 404);
    }
    if (path.startsWith("/pulls?state=open&head=")) return ok([{ html_url: "https://github.com/owner/public/pull/7" }]);
    if (path.startsWith("/pulls?state=all")) return ok(f.pulls);
    if (path === "" && method === "GET") return ok({ default_branch: "main" });
    if (path === "/git/trees/main?recursive=1") return ok({ tree: [...f.files.keys()].map((p) => ({ path: p, type: "blob" })) });
    if (path === "/git/commits/base-sha") return ok({ tree: { sha: "tree-sha" } });
    if (path === "/git/trees") return ok({ sha: "new-tree" }, 201);
    if (path === "/git/commits" && method === "POST") return ok({ sha: "new-commit" }, 201);
    if (path === "/git/refs" && method === "POST") {
      f.branches.add(String(JSON.parse(String(init!.body)).ref).replace("refs/heads/", ""));
      return ok({}, 201);
    }
    if ((m = path.match(/^\/git\/refs\/heads\/(.+)$/)) && method === "DELETE") {
      f.deletedRefs.push(m[1]!);
      return new Response(null, { status: 204 });
    }
    if (path === "/pulls" && method === "POST") return f.failPull ? ok({ message: "boom" }, 500) : ok({ number: 42, html_url: "https://github.com/owner/public/pull/42" }, 201);
    if (path === "/issues/42/labels") return ok([], 200);
    return ok({ message: `unexpected ${method} ${path}` }, 500);
  }) as typeof fetch;
  return { fetch: fetcher, now: () => NOW, github: async () => new GitHub("token", REPO, fetcher) };
}

const post = (body: unknown, origin = ORIGIN, extra: Record<string, string> = {}) =>
  new Request("https://submit.example/v1/submit", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

test("happy path: one commit with the brand and driver files, a labelled pull request", async () => {
  const f = fake();
  const r = await read(await handle(post(EDGE), env(), deps(f)));
  assert.equal(r.status, 201);
  assert.equal(r.body.pr_url, "https://github.com/owner/public/pull/42");
  const tree = f.calls.find((c) => c.startsWith("POST /repos/owner/public/git/trees"));
  assert.ok(tree);
  assert.ok(f.branches.has("submit/edge/eds15d2-e3"));
  assert.ok(f.calls.includes("POST /repos/owner/public/issues/42/labels"));
});

test("CORS: preflight only for allowed origins; response carries the origin", async () => {
  const pre = await handle(new Request("https://submit.example/v1/submit", { method: "OPTIONS", headers: { origin: ORIGIN } }), env(), deps(fake()));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
  // A site that isn't allowed can read the refusal (so the form can say why), but can't submit.
  const other = await handle(new Request("https://submit.example/v1/submit", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), env(), deps(fake()));
  assert.equal(other.headers.get("access-control-allow-origin"), "https://evil.example");
  const r = await handle(post(EDGE, "https://evil.example"), env(), deps(fake()));
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://evil.example");
  assert.match(((await r.json()) as { errors: { message: string }[] }).errors[0]!.message, /evil\.example aren't allowed/);
});

test("bad origin, oversize, bad JSON, no consent", async () => {
  assert.equal((await handle(post(EDGE, "https://evil.example"), env(), deps(fake()))).status, 403);
  assert.equal((await handle(post("x".repeat(MAX_BODY + 1)), env(), deps(fake()))).status, 413);
  assert.equal((await handle(post("{not json"), env(), deps(fake()))).status, 400);
  const nc = await read(await handle(post({ ...EDGE, consent: false }), env(), deps(fake())));
  assert.equal(nc.status, 400);
  assert.deepEqual((nc.body.errors as { field: string }[]).map((e) => e.field), ["consent"]);
});

test("honeypot: looks accepted, nothing is called", async () => {
  const f = fake();
  const r = await handle(post({ ...EDGE, website: "http://spam" }), env(), deps(f));
  assert.equal(r.status, 202);
  assert.equal(f.calls.length, 0);
});

test("per-IP limit uses a hashed key, never the raw IP", async () => {
  const keys: string[] = [];
  const e = env({ PER_IP: { limit: async ({ key }) => (keys.push(key), { success: false }) } });
  const r = await handle(post(EDGE), e, deps(fake()));
  assert.equal(r.status, 429);
  assert.match(keys[0]!, /^[0-9a-f]{64}$/);
  assert.ok(!keys[0]!.includes("203.0.113.9"));
});

test("Turnstile: failure, wrong action, wrong hostname are refused", async () => {
  for (const t of [{ success: false }, { success: true, hostname: "speakerboxgenius.com", action: "other" }, { success: true, hostname: "evil.example", action: "submit-driver" }]) {
    assert.equal((await handle(post(EDGE), env(), deps(fake({ turnstile: t })))).status, 403);
  }
  // The always-pass test secret is accepted without hostname/action (preview).
  const r = await handle(post(EDGE), env({ TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" }), deps(fake({ turnstile: { success: true, hostname: "example.com" } })));
  assert.equal(r.status, 201);
});

test("invalid record: every error with its field, nothing written", async () => {
  const f = fake();
  const r = await read(await handle(post({ ...EDGE, nominal_ohms: undefined, source_url: "", ts: { ...EDGE.ts, fs: undefined } }), env(), deps(f)));
  assert.equal(r.status, 422);
  assert.deepEqual((r.body.errors as { field: string }[]).map((e) => e.field).sort(), ["nominal_ohms", "source_url", "ts.fs"]);
  assert.ok(!f.calls.some((c) => c.startsWith("POST /repos")));
});

test("status and other unknown keys can't be smuggled in", async () => {
  const f = fake();
  await handle(post({ ...EDGE, status: "verified", plausibility_note: "ok" }), env({ DRY_RUN: "1" }), deps(f));
  const r = await read(await handle(post({ ...EDGE, status: "verified" }), env({ DRY_RUN: "1" }), deps(fake())));
  const file = (r.body.files as { path: string; content: string }[]).find((x) => x.path.endsWith("eds15d2-e3.json"))!;
  const rec = JSON.parse(file.content);
  assert.equal(rec.status, "community");
  assert.equal(rec.plausibility_note, undefined);
});

test("existing brand: its spelling is used and no _brand.json is added", async () => {
  const f = fake({ files: new Map([["drivers/edge/_brand.json", JSON.stringify({ name: "EDGE Car Audio" })]]) });
  const r = await read(await handle(post(EDGE), env({ DRY_RUN: "1" }), deps(f)));
  const files = r.body.files as { path: string; content: string }[];
  assert.deepEqual(files.map((x) => x.path), ["drivers/edge/eds15d2-e3.json"]);
  assert.equal(JSON.parse(files[0]!.content).brand, "EDGE Car Audio");
});

test("duplicates: on main → 422 on model; waiting branch → 409 with the PR link", async () => {
  const onMain = await read(await handle(post(EDGE), env(), deps(fake({ files: new Map([["drivers/edge/eds15d2-e3.json", "{}"]]) }))));
  assert.equal(onMain.status, 422);
  assert.deepEqual((onMain.body.errors as { field: string }[]).map((e) => e.field), ["model"]);
  const pending = await read(await handle(post(EDGE), env(), deps(fake({ branches: new Set(["submit/edge/eds15d2-e3"]) }))));
  assert.equal(pending.status, 409);
  assert.equal(pending.body.pr_url, "https://github.com/owner/public/pull/7");
});

test("queue full and hourly cap → 503", async () => {
  const lab = [{ name: "web-submission" }];
  const open = Array.from({ length: 20 }, () => ({ state: "open", created_at: "2026-11-01T00:00:00Z", labels: lab }));
  assert.equal((await read(await handle(post(EDGE), env(), deps(fake({ pulls: open }))))).body.code, "queue-full");
  const recent = Array.from({ length: 3 }, () => ({ state: "closed", created_at: "2026-11-18T14:30:00Z", labels: lab }));
  assert.equal((await read(await handle(post(EDGE), env({ MAX_PER_HOUR: "3" }), deps(fake({ pulls: recent }))))).body.code, "busy");
});

test("dry run checks everything and opens nothing", async () => {
  const f = fake();
  const r = await read(await handle(post(EDGE), env({ DRY_RUN: "1" }), deps(f)));
  assert.equal(r.status, 200);
  assert.equal(r.body.dry_run, true);
  assert.ok(!f.calls.some((c) => c.startsWith("POST /repos")));
});

test("GitHub failure opening the PR deletes the branch and answers 502", async () => {
  const f = fake({ failPull: true });
  const r = await read(await handle(post(EDGE), env(), deps(f)));
  assert.equal(r.status, 502);
  assert.deepEqual(f.deletedRefs, ["submit/edge/eds15d2-e3"]);
});

test("PR body escaping: no pings, no HTML, no links from the submitter", () => {
  assert.equal(md("@theo"), "@​theo");
  assert.equal(md("<script>alert(1)</script>"), "&lt;script&gt;alert\\(1\\)&lt;/script&gt;");
  assert.equal(md("[x](http://evil)"), "\\[x\\]\\(http://evil\\)");
  assert.equal(link("javascript:alert(1)"), "javascript:alert\\(1\\)");
  assert.equal(link("https://a.example/x y"), "<https://a.example/x%20y>");
  const b = buildRecord({ kind: "driver", brand: "A", model: "B1", type: "woofer", nominal_ohms: 4, ts: { fs: 30, qms: 3, qes: 0.4, vas_l: 50, re: 3.3, sd_cm2: 220 }, source_url: "https://a.example/b1.pdf", inconsistency_reason: "@all <b>" }, { kind: "web", today: "2026-11-18", credit: "Theo" });
  const body = prBody(b, "drivers/a/b1.json", [], "Theo", null);
  assert.ok(!/(^|[^​])@all/.test(body.replace(/@​/g, "")));
  assert.ok(!body.includes("<b>"));
  assert.match(body, /by \*\*Theo\*\*/);
});

test("App JWT is RS256 and verifies with the public key", async () => {
  const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  const jwt = await appJwt("12345", pem, NOW);
  const [h, c, s] = jwt.split(".");
  const dec = (x: string) => Buffer.from(x, "base64url");
  assert.deepEqual(JSON.parse(dec(h!).toString()), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(dec(c!).toString());
  assert.equal(claims.iss, "12345");
  assert.equal(claims.exp - claims.iat, 540);
  assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, dec(s!), new TextEncoder().encode(`${h}.${c}`)));
  // GitHub's own download (PKCS#1) works as it is.
  const { generateKeyPairSync, createPublicKey, verify } = await import("node:crypto");
  const k = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const j2 = await appJwt("7", k.privateKey, NOW);
  const [h2, c2, s2] = j2.split(".");
  assert.ok(verify("RSA-SHA256", Buffer.from(`${h2}.${c2}`), createPublicKey(k.publicKey), dec(s2!)));
});

test("health and unknown routes", async () => {
  const h = await read(await handle(new Request("https://submit.example/v1/health", { headers: { origin: ORIGIN } }), env({ DRY_RUN: "1" }), deps(fake())));
  assert.deepEqual(h.body, { ok: true, dry_run: true });
  assert.equal((await handle(new Request("https://submit.example/nope"), env(), deps(fake()))).status, 404);
});

test("EXTRA_ORIGINS (dashboard only) adds origins for a preview", async () => {
  const preview = "https://pr-1.preview.example.dev";
  assert.equal((await handle(post(EDGE, preview), env(), deps(fake()))).status, 403);
  const f = fake({ turnstile: { success: true, hostname: "pr-1.preview.example.dev", action: "submit-driver" } });
  assert.equal((await handle(post(EDGE, preview), env({ EXTRA_ORIGINS: preview, DRY_RUN: "1" }), deps(f))).status, 200);
});

test("a failed human check says why (Cloudflare's code or the check that failed)", async () => {
  const msg = async (t: Fake["turnstile"], e: Partial<Env> = {}) => ((await (await handle(post(EDGE), env(e), deps(fake({ turnstile: t })))).json()) as { errors: { message: string }[] }).errors[0]!.message;
  assert.match(await msg({ success: false, "error-codes": ["timeout-or-duplicate"] } as Fake["turnstile"]), /\(timeout-or-duplicate\)/);
  assert.match(await msg({ success: true, hostname: "evil.example", action: "submit-driver" }), /\(hostname evil\.example\)/);
  assert.match(await msg({ success: true }, { TURNSTILE_SECRET: "" }), /\(no-secret\)/);
});

test("a GitHub App sign-in failure says which part of the setup is wrong", async () => {
  const { appProblem } = await import("../src/index.ts");
  const { GitHubError } = await import("../src/github.ts");
  assert.match(appProblem(new GitHubError(401, "x")), /GH_APP_ID or the private key/);
  assert.match(appProblem(new GitHubError(404, "x")), /GH_INSTALLATION_ID/);
  await assert.rejects(appJwt("1", "-----BEGIN PRIVATE KEY-----\nnot base64!\n-----END PRIVATE KEY-----"), (e: unknown) => /can't be read/.test(appProblem(e)));
  const r = await handle(post(EDGE), env(), { ...deps(fake()), github: async () => { throw new GitHubError(404, "installation token: 404"); } });
  assert.match(((await r.json()) as { errors: { message: string }[] }).errors[0]!.message, /\(app 404: GH_INSTALLATION_ID/);
});

test("a new brand updates \"N brands\" in the README and docs in the same pull request", async () => {
  const f = fake({
    files: new Map([
      ["drivers/dayton-audio/_brand.json", JSON.stringify({ name: "Dayton Audio" })],
      ["drivers/dayton-audio/rss265hf-4.json", "{}"],
      ["README.md", "About 1 drivers? No: 2 drivers from 1 brands."],
      ["site/about.md", "Drivers from 1 brands."],
      ["docs/data-sources.md", "Nothing to count here."],
      ["drivers/README.md", "1 brands (not a counted file)"],
    ]),
  });
  const r = await read(await handle(post(EDGE), env({ DRY_RUN: "1" }), deps(f)));
  const files = r.body.files as { path: string; content: string }[];
  assert.deepEqual(files.map((x) => x.path), ["drivers/edge/_brand.json", "drivers/edge/eds15d2-e3.json", "README.md", "site/about.md"]);
  assert.equal(files.find((x) => x.path === "site/about.md")!.content, "Drivers from 2 brands.");
  // An existing brand: no count changes, no extra calls.
  const g = fake({ files: new Map([["drivers/edge/_brand.json", JSON.stringify({ name: "Edge" })], ["README.md", "from 1 brands"]]) });
  const r2 = await read(await handle(post(EDGE), env({ DRY_RUN: "1" }), deps(g)));
  assert.deepEqual((r2.body.files as { path: string }[]).map((x) => x.path), ["drivers/edge/eds15d2-e3.json"]);
});
