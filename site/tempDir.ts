import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A new folder under the system temp directory for a test, removed when the test process exits
 * (node --test runs each file in its own process). The CI runners keep /tmp on disk, so folders
 * left behind (a test site build is ~55 MB) add up run after run.
 */
const made: string[] = [];
process.on("exit", () => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

export function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}
