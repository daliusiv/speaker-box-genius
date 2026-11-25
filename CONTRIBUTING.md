# Contributing to Speaker Box Genius

Thanks for helping. There are two kinds of contribution, and you don't need to be a programmer for the first one.

## 1. Adding a driver or passive radiator

### The easy way (no git needed)
In the app, load or enter the driver and choose **Edit T/S → ⋯ → Submit to database…**: a short form with your values, where you add the brand, model and datasheet link and press Submit. No GitHub account is needed; the app checks everything before sending, and a pull request is opened for review. (A passive radiator you typed has **Submit to database…** under its **PR parameters**.) If you have GitHub, you can also open a [new driver issue](../../issues/new?template=new-driver.yml) / [new passive radiator issue](../../issues/new?template=new-passive-radiator.yml) directly.

A bot then turns the issue into a pull request with the database file, after running the same checks as CI. It keeps one comment on the issue up to date: every problem it found at once, what it read from each field, and things worth a second look (such as a datasheet link for a different model). Edit the issue and it tries again (editing only the title doesn't); once a maintainer has pushed changes to the pull request, form edits no longer change it, so say in a comment what should change. Units after a number are fine ("2 Ω", "15 in"); for a dual voice coil driver, give one coil's impedance, choose **Dual** and the wiring the datasheet's T/S were measured with (if you don't know, the bot works it out from Re). A maintainer checks the values against the datasheet and merges.

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
- `packages/headless`: the app without the browser: a JSON request (driver, drive, boxes) in, the app's own numbers and a share link out. It runs `packages/web/src` modules, as the site build does; `test/app-parity.test.ts` checks it matches the app exactly.
- `packages/mcp`: the local MCP server for AI assistants, on top of `packages/headless`. `pnpm mcp` runs it from a checkout (stdio, this checkout's database); `pnpm mcp:build` builds the npm package, the Claude Desktop extension and the MCP Registry entry (`packages/mcp/dist/`). Releases: the "Release MCP server" workflow on the public repo (npm, GitHub release, then the MCP Registry as `com.speakerboxgenius/mcp`).
- `plugin/`: the plugin for AI assistants' plugin directories (server pinned to one npm version, plus the `design-speaker-box` skill); `.claude-plugin/marketplace.json` lists it for `/plugin install`. Don't edit the pinned version by hand: the public sync moves it with each release (`scripts/plugin-version.ts`), and `claude plugin validate ./plugin` checks the folder.
- `site/`: the content pages built next to the app: guides (`site/pages/*.md`), calculators (`site/calculators/`, the hub list in `site/calculators.ts`; sums and page scripts in `packages/web/src/calculators/`, with `common.ts` for what every page shares and `query.ts` for the inputs kept in the link), the validation page, and a page per driver (`site/drivers.ts`, share cards in `site/og.ts`). `pnpm build:site` builds them; set `SBG_CARDS=0` to skip the share cards, which need Chrome. A guide's charts and numbers come from its example at build instead of screenshots: see [Writing a guide](#writing-a-guide).

### UI kit (`packages/web/src/ui/`)

New and reworked UI is built from the kit, so spacing, sizes and controls stay consistent:

- **Tokens** live in `src/ui/tokens.json`: a 4 px space grid, six text sizes, four radii, control and row heights, layers and motion. Sizes switch on the input, not the width: with a mouse every control is 32 px tall with 13 px text; on a touch screen (`pointer: coarse`) controls look 40 px tall and take taps across 44 px (`--size-tap`), and inputs use 16 px text so iOS doesn't zoom in. Every control in a field row is one width (`--size-col-control`), so right edges line up. Run `pnpm tokens` after editing it; `tokens.css` is generated. Colours still sit in `styles.css :root`, and a test keeps both lists equal.
- **Components** (`Button`, `ButtonLink`, `FileButton`, `HelpButton`, `HelpSheet`, `FieldRow`, `NumberField`, `InlineText`, `Disclosure`, `Stepper`, `Select`, `Segmented`, `RadioCards` (a quiet list by default; `variant="card"` boxes each option for big choices), `Switch`, `Section`, `Menu` (rich items with a line, numbers and a tick; a field-style trigger; pinned lists), `MenuItemButton`, `MiniResponse`, `Sheet`, `Tooltip`, `Chip`, `Card`, `Notice`, `Readout`) take variants as props and style through `src/ui/ui.css`. One primary button per screen; icon-only buttons need a `label`.
- **Help**: give a field a `help` text (Num, Select, Fixed, FieldRow); it shows in its row's ⓘ sheet, never on focus or hover. An open `Section` shows the ⓘ and lists its fields' help when opened; pass `Section help` (`helpEntries`) for fields that only appear after a choice. A `Card` with fields outside its rows gets an ⓘ in its title row for those.
- **Numbers**: every numeric input and readout uses tabular figures (`inputmode="decimal"` / `"numeric"`, `<output>`, `data-numeric`, `.tnum`), so digits line up.
- **The catalogue** at `/ui/` (`pnpm dev`, then open `/ui/`) shows every component in every state.
- **Lint**: `pnpm lint` fails on a raw size, space, radius, layer or colour in any stylesheet except the legacy `styles.css`, which is baselined until its screens move onto the kit. Screens listed in `packages/web/lint-migrated.json` must use kit components, not raw `<button>`, `<input>`, `<select>` or `<textarea>` (checked by `pnpm test`). The driver card (`src/DriverCard.tsx`, `src/driver-card.css`) the Boxes tab's cards (`src/Designs.tsx`, `src/boxes.css`) and the Signal tab (`src/HighPass.tsx`, `Eq.tsx`, `Passive.tsx`, `RoomGain.tsx`, `BafflePanel.tsx`, `DspExport.tsx`, `src/signal.css`) and the Build tab (`src/VolumePanel.tsx`, `BuildSheet.tsx`, `WedgeFields.tsx`, `src/build.css`) and the Settings tab (`src/SettingsPanel.tsx`, `AmpFromRatings.tsx`, `src/settings.css`) are on the kit. Older forms move over by wrapping them in `<KitFields>` (`src/components.tsx`): its `Num`, `Fixed` and `Select` then draw as kit rows (`Num` takes an `icon` for a part's symbol).
- **Visual tests**: `pnpm test:ui` compares screenshots of `/ui/` at 390 and 1280 px (Chromium, animations disabled) with the Linux baselines in `packages/web/e2e/__screenshots__`. Fonts render a little differently on each machine, so the baselines come from CI: after an intended change, push a commit whose message contains `[update-ui-baselines]`; CI rewrites the PNGs and commits them to the branch, then push again (or re-run CI) to check. `pnpm test:ui:update` does the same locally. On a pull request the visual tests run only when something that can change the app's look changes (`packages/`, the driver data, dependencies). First run: `pnpm --filter @sbg/web exec playwright install chromium`.
- **Translated page**: `e2e/translated.spec.ts` runs the app with a stand-in browser translator (text nodes swapped or wrapped in `<font>`, as Google Translate and Firefox Translations do) and opens every row and radio choice on every tab; any page error fails it. If it fails after your change, see `src/domGuard.ts`, and prefer one template string over text pieces around a condition in JSX.

### Writing a guide

What a guide covers, its shape, its voice and its picture: [docs/writing-guides.md](docs/writing-guides.md). How its charts and numbers work: below. They come from the simulation when the site is built, so they never go stale. A new guide:

1. **Build the worked example** in `site/examples.ts`: a function returning the app's state, added to `EXAMPLES`. Give every table row its own design or example, so each number has somewhere to come from. Add new designs at the end: placeholders count them by position.
2. **Write the numbers as placeholders**, not typed values: `{{num:example/2/f3}}` (design 2's F3; `:0` for no decimals, `@30` at 30 Hz), `{{diff:example/1/2/f3}}`, `{{lead:…}}` and `{{color:example/2}}` for a curve's colour in words. The metrics are listed at the top of `site/liveNumbers.ts`; if you need one that isn't there, add it with a test in `site/liveCharts.test.ts`.
3. **Add the charts** as `![caption](chart:example/kind)`: the app's own chart, drawn at build. `chart:example:1,3/kind` draws some of its designs, `chart:a+b/kind` several examples on one chart (`{{color:a+b/2}}` names their colours), and `chart:a/spl|b/maxspl "Label A|Label B"` two or three charts side by side, stacked on phones, each with its label. Set `image: chart:example/kind` in the front matter for the page's share card. A figure the app doesn't draw (a difference of two curves, the cabin gain or baffle step alone) goes in `site/figures.ts` as `![caption](figure:name)`, drawn by the same chart code, with `{{fig:name/key}}` for the values its caption quotes; a figure whose horizontal axis isn't frequency uses the plain x–y chart in `site/xyPlot.ts`.
4. **Test the claims, not the values**, in `site/guideNumbers.test.ts`: what the text says (this box goes deeper, that one passes Xmax, about 1 dB). The numbers update themselves; the words around them don't, and this test is what tells you when an engine change has made a sentence wrong.
5. **Draw its picture** after the guide is written: `site/img/guides/<slug>.svg` plus an `art:` line (its alt text), following [The picture](docs/writing-guides.md#the-picture). `site/guideArt.test.ts` checks it.
6. **Check it builds**: `pnpm build:site` stops on a bad placeholder or chart and names the page. Look at the page at phone and desktop width.

When you change the engine or a chart, the guides follow on the next build. If a claims test fails, fix the sentence (or the change). Diagrams and screenshots of the app's other screens are still images in `site/img/`.

Keep PRs small and focused. For anything large, open an issue first so we can agree on the approach.

**Changelog:** if your change is something users would notice (a feature, a fix, new driver data), add a line under `## Unreleased` at the top of `CHANGELOG.md` (add that heading if it isn't there: it goes away each time the site updates), under `### Added`, `### Changed` or `### Fixed` (`### Breaking` for a change that stops old projects, links or files from working as before). Write it for users, not developers, as one short sentence: what changed and why it matters (200 characters at most, link URLs not counted; the tests check it). Leave out how it works, where each button moved and edge cases: link to a guide or the Validation page instead, and keep the detail in the PR description. Fold small tweaks to the same card into one line, and leave out PR and issue numbers. When the site next updates, the entries become its next version and appear at [/changelog/](https://speakerboxgenius.com/changelog/): `### Breaking` makes it the next major version (2.0.0), `### Added` the next minor (1.1.0), and otherwise the next patch (1.0.1).

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
