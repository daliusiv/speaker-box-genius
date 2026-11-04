# Contributing to Speaker Box Genius

Thanks for helping. There are two kinds of contribution, and you don't need to be a programmer for the first one.

## 1. Adding a driver or passive radiator

### The easy way (no git needed)
In the app, load or enter the driver and press **Submit to database**: it opens a pre-filled GitHub form, and you add the datasheet link. Or open a [new driver issue](../../issues/new?template=new-driver.yml) / [new passive radiator issue](../../issues/new?template=new-passive-radiator.yml) directly.

A bot then turns the issue into a pull request with the database file, after running the same checks as CI. If something's wrong it comments on the issue; edit the issue and it tries again. A maintainer checks the values against the datasheet and merges.

### The git way
1. Create `drivers/<brand-slug>/<model-slug>.json` (or `passive-radiators/…`). Slugs are lowercase letters, numbers and hyphens only, e.g. `drivers/dayton-audio/rss265hf-4.json`.
2. If the brand is new, also add `drivers/<brand-slug>/_brand.json`:
   ```json
   { "name": "Dayton Audio", "website": "https://www.daytonaudio.com" }
   ```
3. Copy the format from [`docs/examples/`](docs/examples). The example brand there is made up.
4. Run `pnpm validate:db` and fix anything it reports.
5. Open a pull request.

### Got a folder of WinISD drivers?
`pnpm db:import-wdr path/to/folder` converts every `.wdr` file into a database entry (use `--dry-run` first to preview). Imported entries have no datasheet link yet, so before opening a pull request, add the manufacturer's link to `sources` and set the right `type`.

### Rules for data
- **Every record needs at least one source.** A datasheet URL, or your own measurement with the method you used (e.g. "DATS v3, added mass"). Measured `.zma` files are welcome in `measurements/`.
- **Copy numbers exactly as published.** Don't "fix" datasheet values. If the datasheet doesn't add up (the validator will tell you), note it in the PR and add a measured source if you have one.
- **Don't copy from other databases or websites** whose licences don't allow it. Datasheets from the manufacturer, or your own measurements, only.
- New entries start as `"status": "community"`. A reviewer changes them to `"verified"` after checking them against the source.

## 2. Code contributions

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

- `packages/engine`: simulation maths. Pure TypeScript with no DOM or UI dependencies. **Any change to the maths needs a test**, and any change to an output curve needs a note explaining why.
- `packages/schema`: data formats for drivers, passive radiators and URL state.
- `packages/db-tools`: database validation and bundling scripts.
- `packages/web`: the app.

Keep PRs small and focused. For anything large, open an issue first so we can agree on the approach.

## Licence of contributions and the CLA

Code and docs contributions need a one-time **[Contributor License Agreement](CLA.md)** (CLA). When you open your first pull request, a check asks you to comment `I have read the CLA and I agree to it.` That's all: no forms, no outside sites.

**Why?** The project is free for non-commercial use, and nobody may resell it. The CLA keeps it that way while letting the maintainer say yes to uses the non-commercial licence doesn't cover (say, a shop embedding the simulator) or move to a better licence later, without having to track down every contributor.

**What it says, in short:**
- You keep the copyright in your work.
- You give the maintainer a broad licence to it, including the right to offer the project under other terms.
- Your contribution stays available to everyone under the project's licence: [PolyForm Noncommercial 1.0.0](LICENSE) for code, [CC BY-NC-SA 4.0](LICENSE-DATA) for data and docs, or something more permissive.
- You confirm it's yours to give (and your employer is fine with it, if that applies).

**No CLA needed for driver data.** Pull requests that only add or change files in `drivers/` or `passive-radiators/` (including those the submission bot opens from the issue form) don't need it. That data is licensed under [CC BY-NC-SA 4.0](LICENSE-DATA) as you submit it.

## Code of conduct

Be kind and assume good intent. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
