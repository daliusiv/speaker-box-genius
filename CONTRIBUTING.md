# Contributing to Speaker Box Genius

Thanks for helping. There are two kinds of contribution, and you don't need to be a programmer for the first one.

## 1. Adding a driver or passive radiator

### The easy way (no git needed)
Open a [new driver issue](../../issues/new?template=new-driver.yml) or a [new passive radiator issue](../../issues/new?template=new-passive-radiator.yml), fill in the values from the manufacturer's datasheet and include the datasheet link. A maintainer will turn it into a database entry.

### The git way
1. Create `drivers/<brand-slug>/<model-slug>.json` (or `passive-radiators/…`). Slugs are lowercase letters, numbers and hyphens only, e.g. `drivers/dayton-audio/rss265hf-4.json`.
2. If the brand is new, also add `drivers/<brand-slug>/_brand.json`:
   ```json
   { "name": "Dayton Audio", "website": "https://www.daytonaudio.com" }
   ```
3. Copy the format from [`docs/examples/`](docs/examples). The example brand there is made up.
4. Run `pnpm validate:db` and fix anything it reports.
5. Open a pull request.

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

## Licence of contributions

By submitting a contribution you agree that:
- code you contribute is licensed under the project's [PolyForm Noncommercial 1.0.0](LICENSE) licence, and
- data and documentation you contribute are licensed under [CC BY-NC-SA 4.0](LICENSE-DATA),

and that the maintainer may grant commercial-use permissions for the project as a whole. Please sign off your commits (`git commit -s`) to confirm you have the right to submit the work.

## Code of conduct

Be kind and assume good intent. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
