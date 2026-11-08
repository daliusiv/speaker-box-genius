# Speaker Box Genius — Build Plan

*A modern, zero-install, web-based replacement for WinISD: enclosure and passive radiator simulation, a real-world volume calculator, and shareable live links.*

Drafted 2 Nov 2026 · Rev 2: non-commercial source-available licence, GitHub Pages only (no server), driver database stored in the repo · **Rev 3 (5 Nov 2026): updated to what has been built.** Each section now says what shipped and where the build departed from the plan; ✅ done, 🟡 partly done, ⬜ not started.

**Project constraints (decided, all held):**
- Public GitHub repo; anyone can contribute, **nobody can resell it** → non-commercial licence (see §2).
- **Hosted on GitHub Pages only.** No servers, no paid services, no backend of any kind. Live at **https://speakerboxgenius.com** (custom domain; the old github.io address redirects).
- **The driver database lives in the repo** and grows through pull requests.

---

## 0. Where it stands (5 Nov 2026)

Phases 0–2 are done, most of Phase 3 is done, and much of the "later" list has shipped too (bandpass, transmission lines and horns, port compression, cut list). The app is live but **not publicly launched**: the next step is a private beta with 5–10 forum regulars, then the launch posts.

| Phase | Status | Still open |
|---|---|---|
| 0. Engine and validation | ✅ | — |
| 1. MVP | ✅ | Soft launch (held back on purpose, see §11) |
| 2. Power-user features | ✅ | — |
| 3. Community | 🟡 | Design gallery with OG images, embeddable widget, PR deploy previews |
| Later / stretch | 🟡 | Large-signal (nonlinear) model, 3D box preview, i18n |

Beyond the plan: transmission lines and horns with Hornresp import/export, a published [validation page](https://speakerboxgenius.com/validation/), 15 SEO guides, a [page for every driver](https://speakerboxgenius.com/drivers/) with suggested boxes and its own share card, compare-with-a-second-driver, PR finder, hot voice coil, ports modelled as pipes, amplifier volts and amps at max SPL.

---

## 1. Product goals

**Must do better than WinISD at:**
1. ✅ **Entering T/S parameters.** Nothing gets silently overwritten. You type any set of values in any order, the app derives the rest and flags inconsistencies. Datasheet text can be pasted in.
2. ✅ **Passive radiators as a first-class option.** 1, 2 or 4 PRs (and mixed groups in bandpass chambers), added mass, PR excursion vs X_max, on the same chart as sealed and ported designs. Plus a PR finder and a best-tuning tool.
3. ✅ **Port behaviour.** Air velocity vs frequency at a given input power, with a chuffing line (peak or RMS), port compression, flared ports and ports as pipes.
4. ✅ **True net volume.** Shape calculator that subtracts driver, PR, port, bracing and crossover displacement, live-linked to a design, plus a build sheet and cut list.
5. ✅ **Sharing.** One short link opens the exact live simulation; forum image with QR code; ready-to-paste Reddit and diyAudio posts; share preview card.

**Not in v1 (as planned):** crossover design for full speakers (VituixCAD covers this), room simulation beyond a simple room-gain curve. **Changed:** transmission lines and horns were planned as out of scope but shipped as a beta, validated against Hornresp.

---

## 2. Licence and contribution model

*Not legal advice. Worth a quick check with someone who knows licensing before the first public release.*

**Status: ✅ done.** Code under PolyForm Noncommercial 1.0.0 (`LICENSE`), data and docs under CC BY-NC-SA 4.0 (`LICENSE-DATA`). `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates (bug, new driver, new passive radiator, data correction), a PR template and `CODEOWNERS` are in place. A lawyer's glance before the public launch is still advised.

| Part of the repo | Licence | Effect |
|---|---|---|
| Code (`packages/*`, `site/`) | **PolyForm Noncommercial 1.0.0** | Anyone can use, modify and share for personal, hobby, educational and non-profit purposes. Selling it or using it in a paid product needs permission |
| Driver database (`drivers/`, `passive-radiators/`) | **CC BY-NC-SA 4.0** | Anyone can copy and build on the data with attribution, non-commercially. Derivatives must stay under the same terms |
| Docs and images | CC BY-NC-SA 4.0 | Same terms as the data |

**Contributions:** a licence-grant **CLA** ([`CLA.md`](../CLA.md), decided 4 Nov 2026): contributors keep copyright and grant the maintainer a licence on any terms, so commercial exceptions or a relicence stay possible. Checked by `.github/workflows/cla.yml` (sign by PR comment; signatures on the `cla-signatures` branch). The maintainer's own PRs, bots and database-only PRs are exempt.

**Data-licence compatibility:** only outside data whose licence allows NC-SA reuse is imported. In practice: Dayton Audio and SB Acoustics with written permission (`docs/data-permissions.md`), driver-base (CC BY 4.0) for other brands, and datasheet numbers entered by hand with a link. loudspeakerdatabase.com and GPL or "all rights reserved" sources are not used.

---

## 3. Architecture overview (as built)

```
┌──────────── Browser (static site on GitHub Pages, installable PWA) ─────────┐
│  UI (React 19 + TypeScript, Vite)                                           │
│   ├─ Driver card: Main and Compare pickers, T/S editor, measure, import     │
│   ├─ Designs: up to 8 (sealed, vented, PR, bandpass, line/horn)             │
│   ├─ Charts: hand-written SVG (LogChart), legend, leader marker, redlines   │
│   └─ Volume calculator, build sheet, PR tools, signal (filters, EQ, room)   │
│                                                                             │
│  State: React state ⇄ URL hash (versioned; short links deflated with the    │
│  browser's CompressionStream, defaults stripped). Projects in localStorage. │
│                                                                             │
│  @sbg/engine (pure TS, no DOM), run on the main thread                      │
│   ├─ Lumped-element solver (complex, per frequency); 1-D line/horn model    │
│   ├─ T/S solver (entered vs derived), consistency checks, datasheet parser  │
│   ├─ Impedance fitter (free-air and added-mass T/S, L2R2 coil)              │
│   └─ Parsers: .zma/.frd/.txt/.csv, WinISD .wdr/.wpr, Hornresp records       │
│                                                                             │
│  Driver DB: index.json + one shard per brand, from the same Pages site      │
└─────────────────────────────────────────────────────────────────────────────┘
            ▲ built and deployed by
┌──────────────────────── GitHub Actions ─────────────────────────────────────┐
│  CI: driver DB validation, tests (node:test), typecheck, build              │
│  Deploy: Vite build + content pages (site/build.ts) → Pages on push to main │
│  Bots: issue form → PR for drivers and PRs; Dayton/SB import (by hand)      │
│  CLA check on pull requests                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Main decision (held):** all simulation runs in the browser and GitHub is the backend. Running costs: the domain only.

**Content pages:** `site/pages/*.md` are built by `site/build.ts` (no dependencies) into plain HTML pages next to the app: the guides, the WinISD and Hornresp comparison pages, `/validation/` (from `docs/validation/results.json`), and `/drivers/`: a page per database driver with suggested boxes (`site/drivers.ts`) and its own share card, drawn by headless Chrome at deploy (`site/og.ts`). The build also writes `sitemap.xml` and `robots.txt`.

### Tech stack: plan vs built

| Concern | Planned | Built | Why it changed |
|---|---|---|---|
| Language | TypeScript (strict) | ✅ Same | |
| UI | React + Vite | ✅ React 19 + Vite 7 | |
| State | Zustand + Immer | React state + URL hash | Not needed; one state object serialises to the URL directly |
| Charts | uPlot | Hand-written SVG (`LogChart`) | Full control over phone layout, legend, leader marker and redlines; fast enough |
| Complex math | Hand-rolled `Complex`, typed arrays | ✅ Same | |
| Worker comms | Web Worker + Comlink | Main thread | Solves are fast enough; the PR finder runs in slices with a progress bar instead |
| URL compression | lz-string or fflate | Browser `CompressionStream` (deflate-raw) | No dependency |
| Testing | Vitest + Playwright | `node:test` (288 tests); Playwright for manual checks | No dependency |
| Monorepo | pnpm workspaces | ✅ `engine`, `web`, `schema`, `db-tools` | |
| Hosting/CI | GitHub Pages + Actions | ✅ Same, custom domain | |
| Schema validation | Zod + JSON Schema | Hand-written types and checks in `db-tools` | No dependency |

The web app's only runtime dependencies are React and React DOM.

---

## 4. The simulation engine (the core)

### 4.1 Model ✅

A **lumped-element equivalent circuit** solved in the frequency domain at log-spaced points, the same approach as WinISD.

- **Driver:** Re, Le (plain, or L2R2 for lossy coils), Bl, Mms, Cms, Rms, Sd. Any number of drivers in series or parallel, **isobaric** pairs, **dual voice coil** drivers, **hot voice coil** (Re rises with temperature).
- **Box:** Cab from net Vb, leakage (Ql), absorption (Qa), port loss (Qp), all set in Settings and read from WinISD projects.
- **Port:** acoustic mass with end corrections, round or slot ports, several ports, flared ends, **port compression**, and an option to model ports as **pipes** (with their own resonances).
- **Passive radiator:** Mmp with added mass, Cmp, Rmp, Sdp, Xmax; 1, 2 or 4 identical PRs, and PR groups in bandpass chambers.
- **Bandpass:** 4th and 6th order, each chamber ported, closed or with PRs, with inter-chamber leakage.
- **Lines and horns (beta):** 1-D duct of tapered sections (parallel, conical, exponential), stuffing (Wilson relaxation model, as in Hornresp), offset driver, MLTL port, tapped horn, front-loaded horn with chambers.
- **Radiation:** half or full space, baffle step, car-cabin or room gain.

### 4.2 Outputs (per design, per frequency) ✅

| Output | How it's calculated |
|---|---|
| SPL @ input power | Sum of volume velocities → far-field pressure (or radiated power, like Hornresp) |
| Driver cone excursion | X = U_d / (jω·Sd), peak in mm, with an **X_max redline** |
| PR excursion | X = U_pr / (jω·Sdp) with a **PR X_max redline**, per PR |
| Port air velocity | v = U_p / Sp, peak or RMS m/s, with a **chuffing line** |
| Impedance | Magnitude, against a measured .zma overlay |
| Group delay | −dφ/dω |
| Max SPL | Lowest of thermal, X_max, PR X_max and port-velocity limits, with a band showing which limit applies |
| Max power | Power at which each limit is first hit, per frequency (the drive setting, before filters and EQ) |
| Amplifier at max | The amplifier's RMS voltage, current and real power needed to reach Max SPL at each frequency, after the high-pass filter and EQ, into the speaker's impedance (shown as the Max SPL chart's **Volts** and **Amps** views) |
| Lines and horns | Line load (Za), cone and mouth contributions, pressure and air speed along the line |

**Input power convention:** V = √(P·Re) by default (like WinISD), or drive in volts (e.g. 2.83 V). The active one is always shown.

### 4.3 Signal-chain extras ✅
High-pass filters (Butterworth any order 1–4, Linkwitz–Riley 2 and 4), Linkwitz Transform, peaking and shelving EQ, amplifier and cable resistance. ⬜ Bessel high-pass not added.

### 4.4 Accuracy ✅
- **Validation against WinISD 0.7.0.950:** 15 cases, 114 values from real WinISD projects (sealed, ported, PR, both bandpass types, isobaric, DVC, parallel drivers, high-pass, Le, leakage). Response within about 0.01 dB for sealed and ported boxes.
- **Validation against Hornresp 55.30:** 7 lines and horns, SPL mean 0.03–0.08 dB, impedance mean 0.09–0.19 %.
- Every comparison is a CI test, and the results are published at **[speakerboxgenius.com/validation](https://speakerboxgenius.com/validation/)**, rebuilt from the same code (see `docs/validation.md`).
- Analytic and property tests for alignments, filters, isobaric equivalence, amplifier figures and more.
- **Known limits:** small-signal model, so no Bl(x)/Cms(x) nonlinearity. (Port compression and hot-coil compression were added.)

### 4.5 Performance ✅
Up to 8 designs recalculate as you type or drag, on the main thread. The only slow job, the PR finder trying every PR in the database, runs in slices with a progress bar and a stop button.

---

## 5. T/S parameter editor ✅

- **Entered vs derived:** what you type is kept; everything else is derived and shown in grey. Typing order doesn't matter, and nothing you typed is overwritten.
- **Consistency:** over-determined input is flagged with what doesn't agree.
- Fields accept units (L, ft³, in³, mm, in, g …); **datasheet text can be pasted** and the parameters are picked out.
- Help on every field.
- ⬜ A separate **Locked** state was not needed: entered values already stay put.

---

## 6. Imports and exports ✅

| Format | Direction | Status |
|---|---|---|
| `.zma` / `.txt` / `.csv` impedance | Import | ✅ Overlay, and feeds the T/S fitter (free-air plus added-mass sweep for Vas) |
| DATS, REW, ARTA exports | Import | ✅ |
| `.frd` | Import | ✅ Measured SPL overlay |
| WinISD `.wdr` drivers | Import + Export | ✅ Also a bulk CLI (`pnpm db:import-wdr`) |
| WinISD `.wpr` projects | Import | ✅ Sealed, vented, PR, bandpass, filters, losses, isobaric, DVC |
| Hornresp records | Import + Export | ✅ Lines and horns |
| CSV of every curve | Export | ✅ |
| Forum image (PNG) | Export | ✅ Summary, charts and a QR code to the live design |
| JSON project file | Import + Export | ✅ |
| Build sheet | Print | ✅ Panels, cutouts, cut list on stock sheets |

---

## 7. Driver database ✅

**About 1,530 drivers and 55 passive radiators from 18 brands.** Dayton Audio and SB Acoustics come direct with written permission (import workflows run by hand), driver-base (CC BY 4.0) covers the other brands. All records are `community` status so far; ⬜ the reviewed `verified` status isn't in use yet. Waiting on more manufacturer permissions. Every driver with enough parameters (about 1,230) also has a page on the site with suggested sealed, ported and PR boxes (§11, Phase 3).

### 7.1 Layout in the repo (as built)
```
drivers/
├─ README.md
├─ dayton-audio/
│  ├─ _brand.json                    # brand name, website
│  ├─ rss265hf-4.json                # one file per driver; path = stable ID
│  └─ …
├─ sb-acoustics/ …
passive-radiators/
└─ dayton-audio/dsa270-pr.json
```
Shared links carry the driver's ID **and** its T/S values, so old links keep working if a record changes. ⬜ The planned `measurements/` folder (contributed sweeps backing a "measured" entry) doesn't exist yet.

### 7.2 Record schema
As planned: brand, model, type, size, impedance, `ts`, `physical`, `sources` (datasheet link required) and `status`.

### 7.3 Contribution paths
1. ✅ **Send to the database** from the app opens a pre-filled GitHub issue form (drivers and passive radiators).
2. ✅ **Issue-to-PR bot** (`database-submissions.yml`): parses the form, writes the JSON, validates it and opens a PR, or comments on the issue if something is wrong.
3. ✅ **Bulk WinISD import** CLI.
4. ✅ **Direct PR.**
5. ✅ **Data correction / removal** issue form.

### 7.4 CI checks on every database PR
- ✅ Field and type validation, sources required, duplicate and filename checks.
- ✅ **T/S consistency check** with the engine's own equations (warning above 5 %, error above 15 %).
- ⬜ Bot preview comment with a deploy-preview link (preview deploys deferred).

### 7.5 How the app loads it ✅
At build time `db-tools` compiles the database into `index.json` (for search) and one shard per brand, fetched when needed and cached for offline use. Search is hand-written (⬜ MiniSearch not needed).

---

## 8. Real-world volume calculator ✅

- **Shapes:** box, cylinder, sphere, truncated pyramid. ⬜ Wedge/trapezoid prism and "sum of shapes" not added.
- **Inputs:** external dimensions plus wall thickness, or internal dimensions.
- **Deductions:** drivers, passive radiators, ports, bracing and crossover board, each listed.
- **Output:** net Vb, **live-linked** to a design. Size for a target volume keeping the box's proportions or using the golden ratio.
- **Build sheet** with panel sizes, cutouts, port and braces, and a **cut list laid out on stock sheets**, metric or imperial (to 1/16″), with a print view. (Was a stretch goal.)

---

## 9. UX and layout ✅ (with changes)

- **Driver card** with Main and **Compare** pickers (a second driver drawn dashed in every box, with Swap).
- **Designs:** up to 8, colour-coded, each easy to show/hide, rename or duplicate.
- **Charts:** SPL (relative or dB SPL, F3 marked), excursion, PR excursion, port speed, Max SPL (SPL / Volts / Amps), impedance, group delay, Za. Over-limit parts glow red; hover or tap reads every curve; a **leader marker** shows the best curve.
- **Drive** in W or V at the top, for every design.
- **Alignment presets:** Qtc 0.5 / 0.577 / 0.707 for sealed; QB3, B4 and Keele for ported. ⬜ SBB4, SC4 and Bessel vented alignments not added.
- **PR tools:** finder, best tuning, added mass for a tuning.
- **Phones: full editing**, not only viewing (changed from the plan): tall charts, a legend under each chart, one chart at a time.
- **Dark theme only** (changed from the plan; the print build sheet stays white).
- Undo/redo with keyboard shortcuts, help on every input, a welcome tour.
- ⬜ Not yet: full-screen/landscape chart view, swiping between charts, a beginner/advanced switch.

---

## 10. Shareable links (no server) ✅

- The whole design lives in the URL **hash**, versioned, with defaults stripped and deflated: **short links** (`#z=…`). Old links are migrated (e.g. the earlier A–D multi-driver links).
- Drivers are referenced by ID **plus** their T/S values.
- **Share** gives the link, a **forum image** with a QR code, and ready-to-paste **Reddit (Markdown)** and **diyAudio (BBCode)** posts.
- A site-wide **share preview card** (og:image) for pasted links, and one per driver page. Per-design preview images still need the gallery (below).
- ⬜ **Design gallery in the repo** (`gallery/`, static pages with per-design OG images and short `/g/…` URLs): not started.

---

## 11. Phased roadmap

### Phase 0: Engine spike and validation ✅
- ✅ Complex math, sealed and vented solve, SPL/excursion/port velocity.
- ✅ Golden tests against WinISD (one well-documented driver, the DSA215-8, across 15 project setups rather than 3 drivers).
- ✅ **Exit criteria met:** within ±0.1 dB on sealed and ported cases.

### Phase 1: MVP ✅
- ✅ T/S editor (entered vs derived, consistency, datasheet paste).
- ✅ Sealed, vented, single and dual PR.
- ✅ SPL, excursion, PR excursion, port velocity and impedance charts with redlines and power/voltage drive.
- ✅ Volume calculator with deductions, live-linked.
- ✅ Multiple designs overlaid.
- ✅ URL sharing, PNG (forum image) export.
- ✅ WinISD `.wdr` import.
- ✅ Repo set up: licences, CONTRIBUTING, CLA check, issue templates, CI, Pages deploy.
- ✅ Database: ~1,530 drivers and 55 PRs (planned ~50 and ~10).
- ✅ PWA offline support, installable.
- ⏸️ **Soft launch:** held back on purpose. Next: private beta with 5–10 trusted forum regulars, then r/diyaudio, diyAudio, AVS, Parts Express Tech Talk, r/CarAV, r/BudgetAudiophile, Show HN.

### Phase 2: Power-user features ✅
- ✅ Multiple drivers (series/parallel), isobaric, DVC, multiple ports, slot ports. 🟡 Non-identical PRs only as groups in bandpass chambers.
- ✅ High-pass filters, Linkwitz Transform, EQ; Max SPL and Max power; amplifier volts and amps.
- ✅ .zma/.frd import with overlay; T/S fitting from impedance.
- ✅ In-app driver search and "Send to the database".
- ✅ Alignment presets, PR tools, size for a target volume.
- 🟡 **Design assistant** (Nov 2026): goal → limits → priority → ranked drivers and boxes from the database, one tap to open. Stage A: sealed and ported. ⬜ Stage B: passive radiator boxes (pairing each driver with a database PR), "fit my space" from W × H × D, shareable results.

### Phase 3: Community and virality 🟡
- ✅ Issue-to-PR database bot and CI consistency checks. ⬜ Preview comments (needs PR preview deploys, deferred).
- ✅ Saved projects in the browser plus JSON project files. (localStorage rather than IndexedDB.)
- ✅ **SEO content pages:** 15 guides with live examples, WinISD and Hornresp alternative pages, sitemap; Google Search Console set up.
- ✅ **Validation page** built from the test results.
- ✅ **Driver pages:** one page per driver (about 1,230) with suggested sealed, ported and PR boxes, charts, parameters, a live link and its own share card (`site/drivers.ts`, `site/og.ts`).
- ⬜ Design gallery with pre-rendered pages and OG images (deferred until after launch; the driver pages share its page and share-card code).
- ⬜ Embeddable iframe widget for blogs and build logs.
- ⬜ About page (licence in plain words, privacy, credits) and privacy-friendly analytics before launch.

### Later / stretch
- ✅ 4th and 6th order bandpass.
- ✅ Transmission lines, quarter-wave, MLTL, tapped and front-loaded horns (beta), validated against Hornresp.
- ✅ Port compression, hot voice coil, ports as pipes, baffle step, room/cabin gain.
- ✅ Cut list on stock sheets.
- 🟡 Tapped-horn preset gives poor designs (≈500 L): hidden from the preset buttons and Compare types until it is reworked; then write its guide.
- ⬜ Nonlinear Bl(x)/Kms(x) large-signal sim.
- ⬜ 3D box preview, flat-pack export.
- ⬜ i18n.

---

## 12. Repo structure (as built)

```
speaker-box-genius/
├─ LICENSE                 # PolyForm Noncommercial 1.0.0 (code)
├─ LICENSE-DATA            # CC BY-NC-SA 4.0 (database, docs)
├─ CLA.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
├─ .github/
│  ├─ workflows/           # ci, deploy-pages, cla, database-submissions, dayton-import, sb-import
│  ├─ ISSUE_TEMPLATE/      # bug, new-driver, new-passive-radiator, data-correction
│  ├─ pull_request_template.md
│  └─ CODEOWNERS
├─ packages/
│  ├─ engine/              # pure TS: solver, lines, T/S, fitters, parsers, alignments, cut list
│  │  ├─ validation/       # WinISD and Hornresp cases + report generator
│  │  └─ test/             # node:test suites; fixtures/ holds WinISD and Hornresp files
│  ├─ schema/              # shared types
│  ├─ db-tools/            # validate, bundle, .wdr import, issue → driver, Dayton/SB/driver-base import
│  └─ web/                 # React app
├─ site/                   # content pages (guides, validation, driver pages, share cards) and their builder
├─ drivers/                # one JSON per driver, by brand
├─ passive-radiators/      # one JSON per PR, by brand
└─ docs/                   # build plan, validation, transmission lines, data sources and permissions
```

The engine has no UI dependency, so other non-commercial tools can reuse it.

---

## 13. Risks and mitigations

| Risk | Mitigation | Status |
|---|---|---|
| Users don't trust a new tool's numbers | Published validation page, golden tests in CI, guides with sources | ✅ |
| Driver DB licensing / bad data | Permissions on file, sources required, CI consistency checks, data-correction form | ✅ (`verified` reviews not started) |
| Someone resells it anyway | Licence plus CLA keeps the ability to enforce or grant exceptions | ✅ |
| NC licence puts some contributors off | Explained in the README; contributing kept easy (issue forms, bot) | ✅ |
| Review bottleneck as maintainer | CODEOWNERS, automated checks | 🟡 No other reviewers yet |
| WinISD habits | WinISD defaults (Ql 10, power convention), WinISD mode, `.wpr` import | ✅ |
| Model misused beyond linear range | Limitation notes, red past X_max, port-speed warnings, Max SPL limits | ✅ |
| Long URLs / no link previews | Short deflated links, forum image with QR code, site preview card | 🟡 Per-design previews need the gallery |
| Scope creep | Lines and horns were taken on (beta, validated); crossovers stay out | 🟡 |
| **Competition** (other web WinISD clones appearing, Nov 2026) | Get the private beta out; lean on validation, PR tools and sharing | New |

---

## 14. Open questions

1. ~~**Name and repo slug**~~ **Decided:** Speaker Box Genius, `daliusiv/speaker-box-genius`, custom domain speakerboxgenius.com.
2. ~~**CLA or DCO?**~~ **Decided 4 Nov 2026: a licence-grant CLA** ([`CLA.md`](../CLA.md)), checked by `.github/workflows/cla.yml`. Contributors keep copyright; database-only PRs are exempt.
3. ~~**Framework preference**~~ **Decided:** React.
4. ~~**Reference drivers for golden tests**~~ **Decided:** Dayton Audio DSA215-8 (with the DSA270-PR) across 15 WinISD and 7 Hornresp setups.
5. ~~**GitHub username/org**~~ **Decided:** `daliusiv`.
6. **New:** when to run the private beta, and who to invite.
7. **New:** PR preview deploys (declined for now; options: a gh-pages preview action, or Cloudflare/Netlify).

---

## Sources
- [PolyForm Noncommercial 1.0.0 (SPDX)](https://spdx.org/licenses/PolyForm-Noncommercial-1.0.0.html)
- [diyAudio: "Driver Database" thread on an open T/S DB with a public API](https://www.diyaudio.com/community/goto/post?id=4710602)
- [QSpeakers T/S database (XML, GitHub)](https://github.com/be1/qspeakers/blob/master/qspeakers_db.xml)
- [Thiele/Small parameters — Wikipedia](https://www.wikipedia.org/wiki/Thiele/Small)
- [Example manufacturer T/S sheet with Wright inductance model (Kicker)](https://kicker.com/app/tsparam/51CWQ102.html)
