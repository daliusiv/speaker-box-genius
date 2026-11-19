/**
 * GitHub App access for the submit Worker: sign the App JWT (RS256, Web Crypto),
 * get an installation token, and open a data-only pull request through the Git
 * Data API (one commit on a new `submit/<brand>/<model>` branch). No git, no fs.
 */

const API = "https://api.github.com";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s));

/** DER length bytes. */
function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let v = n; v > 0; v >>= 8) out.unshift(v & 0xff);
  return [0x80 | out.length, ...out];
}

/**
 * The key as PKCS#8 DER, which Web Crypto needs. GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"):
 * that is wrapped here (version 0, rsaEncryption, the PKCS#1 key as an OCTET STRING), so the .pem
 * from GitHub can be pasted as it is.
 */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const der = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der.buffer;
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLen(der.length)];
  const inner = [0x02, 0x01, 0x00, ...algo, ...octet];
  const total = inner.length + der.length;
  const out = new Uint8Array([0x30, ...derLen(total), ...inner, ...der]);
  return out.buffer;
}

/** The App's JWT, valid for 9 minutes (GitHub allows 10), issued 60 s in the past for clock drift. */
export async function appJwt(appId: string, pem: string, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000) - 60;
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(JSON.stringify({ iat, exp: iat + 540, iss: appId }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(new Uint8Array(sig))}`;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class GitHub {
  private token: string;
  repo: string;
  private fetcher: typeof fetch;
  constructor(token: string, repo: string, fetcher: typeof fetch = fetch) {
    this.token = token;
    this.repo = repo;
    this.fetcher = fetcher;
  }

  static async forInstallation(appId: string, pem: string, installationId: string, repo: string, fetcher: typeof fetch = fetch): Promise<GitHub> {
    const jwt = await appJwt(appId, pem);
    const res = await fetcher(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "user-agent": "sbg-submit-worker" },
    });
    if (!res.ok) throw new GitHubError(res.status, `installation token: ${res.status}`);
    const { token } = (await res.json()) as { token: string };
    return new GitHub(token, repo, fetcher);
  }

  async call<T>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<{ status: number; data: T }> {
    const res = await this.fetcher(`${API}${path.replace("{repo}", `repos/${this.repo}`)}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "sbg-submit-worker",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok && !okStatuses.includes(res.status)) throw new GitHubError(res.status, `${method} ${path}: ${res.status}`);
    const text = await res.text();
    return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
  }

  /** A file's text on the default branch, or null if it doesn't exist. */
  async fileText(path: string): Promise<string | null> {
    const r = await this.call<{ content?: string; encoding?: string }>("GET", `/{repo}/contents/${encodePath(path)}`, undefined, [404]);
    if (r.status === 404 || !r.data?.content) return null;
    const bin = atob(r.data.content.replace(/\s+/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  /** Every file path on the default branch (one call: the repo's tree). */
  async paths(): Promise<string[]> {
    const repo = await this.call<{ default_branch: string }>("GET", `/{repo}`);
    const t = await this.call<{ tree: { path: string; type: string }[]; truncated?: boolean }>("GET", `/{repo}/git/trees/${encodePath(repo.data.default_branch)}?recursive=1`);
    return t.data.tree.filter((e) => e.type === "blob").map((e) => e.path);
  }

  async branchExists(branch: string): Promise<boolean> {
    const r = await this.call("GET", `/{repo}/git/ref/heads/${encodePath(branch)}`, undefined, [404]);
    return r.status !== 404;
  }

  /** The open pull request from `branch`, if any. */
  async openPrFor(branch: string): Promise<string | null> {
    const owner = this.repo.split("/")[0]!;
    const r = await this.call<{ html_url: string }[]>("GET", `/{repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    return r.data[0]?.html_url ?? null;
  }

  /** Recent web-submission pull requests: how many are open, and how many were opened in the last hour. */
  async webSubmissionLoad(label: string, now = Date.now()): Promise<{ open: number; lastHour: number }> {
    const r = await this.call<{ state: string; created_at: string; labels: { name: string }[] }[]>(
      "GET",
      `/{repo}/pulls?state=all&sort=created&direction=desc&per_page=100`,
    );
    const mine = r.data.filter((p) => p.labels.some((l) => l.name === label));
    return {
      open: mine.filter((p) => p.state === "open").length,
      lastHour: mine.filter((p) => now - Date.parse(p.created_at) < 3600_000).length,
    };
  }

  /**
   * One commit with `files` on a new branch off the default branch, then a pull request.
   * If opening the pull request fails, the branch is deleted again.
   */
  async openPullRequest(opts: { branch: string; files: { path: string; content: string }[]; message: string; title: string; body: string; labels: readonly string[] }) {
    const repo = await this.call<{ default_branch: string }>("GET", `/{repo}`);
    const base = repo.data.default_branch;
    const ref = await this.call<{ object: { sha: string } }>("GET", `/{repo}/git/ref/heads/${encodePath(base)}`);
    const parent = ref.data.object.sha;
    const commit = await this.call<{ tree: { sha: string } }>("GET", `/{repo}/git/commits/${parent}`);
    const tree = await this.call<{ sha: string }>("POST", `/{repo}/git/trees`, {
      base_tree: commit.data.tree.sha,
      tree: opts.files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    });
    const made = await this.call<{ sha: string }>("POST", `/{repo}/git/commits`, { message: opts.message, tree: tree.data.sha, parents: [parent] });
    await this.call("POST", `/{repo}/git/refs`, { ref: `refs/heads/${opts.branch}`, sha: made.data.sha });
    let pr: { number: number; html_url: string };
    try {
      pr = (await this.call<{ number: number; html_url: string }>("POST", `/{repo}/pulls`, { title: opts.title, head: opts.branch, base, body: opts.body, maintainer_can_modify: true })).data;
    } catch (e) {
      await this.call("DELETE", `/{repo}/git/refs/heads/${encodePath(opts.branch)}`, undefined, [404, 422]).catch(() => undefined);
      throw e;
    }
    // Labels are nice to have: a failure here doesn't undo the pull request.
    await this.call("POST", `/{repo}/issues/${pr.number}/labels`, { labels: opts.labels }).catch(() => undefined);
    return pr;
  }
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");
