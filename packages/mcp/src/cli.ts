// The `speaker-box-genius` command (the npm package's bin).
import { main } from "./main.ts";

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
