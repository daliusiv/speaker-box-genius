# Speaker Box Genius — Build Plan

*A modern, zero-install, web-based replacement for WinISD: enclosure and passive radiator simulation, a real-world volume calculator, and shareable live links.*

Drafted 2 Nov 2026 · Rev 2: non-commercial source-available licence, GitHub Pages only (no server), driver database stored in the repo.

**Project constraints (decided):**
- Public GitHub repo; anyone can contribute, **nobody can resell it** → non-commercial licence (see §2).
- **Hosted on GitHub Pages only.** No servers, no paid services, no backend of any kind.
- **The driver database lives in the repo** and grows through pull requests.

---

## 1. Product goals

**Must do better than WinISD at:**
1. **Entering T/S parameters.** Nothing gets silently overwritten. You choose which values are measured or locked, and the app derives the rest and flags any inconsistencies.
2. **Passive radiators as a first-class option.** Single and dual PRs, added mass, PR excursion vs X_max, all on the same chart as sealed and ported designs.
3. **Port behaviour.** Air velocity vs frequency at a given input power, with a clear chuffing redline.
4. **True net volume.** Built-in shape calculator that subtracts driver, PR, port, bracing and crossover displacement, and feeds the result straight into the sim.
5. **Sharing.** One link opens the exact live simulation. Easy to post to Reddit or diyAudio.

**Not in v1:** transmission lines and horns (Hornresp already does these), crossover design for full speakers (VituixCAD covers this), room simulation beyond a simple room-gain curve.

---

## 2. Licence and contribution model

*Not legal advice. Worth a quick check with someone who knows licensing before the first public release.*

"Contributions welcome, but no reselling" means a **non-commercial licence**. Strictly speaking that makes the project **source-available rather than OSI "open source"**. PolyForm Noncommercial is not OSI-approved. In practice that's fine for a hobby community tool, but describe it accurately in the README (e.g. "free and source-available for non-commercial use").

| Part of the repo | Licence | Effect |
|---|---|---|
| Code (`packages/*`) | **PolyForm Noncommercial 1.0.0** | Anyone can use, modify and share for personal, hobby, educational and non-profit purposes. Selling it or using it in a paid product needs your permission. Short and written for software |
| Driver database (`drivers/`) | **CC BY-NC-SA 4.0** | Anyone can copy and build on the data with attribution, non-commercially. Derivatives must stay under the same terms, so nobody can take the DB and lock it up |
| Docs and images | CC BY-NC-SA 4.0 | Same terms as the data |

**Contributions:**
- Add a lightweight **Contributor License Agreement** (e.g. via the free CLA Assistant GitHub app) or at least a DCO sign-off. A CLA lets you, as maintainer, grant commercial exceptions or change the licence later. Without one, every contributor's code stays under the original terms forever and you can't relicense.
- Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and PR templates, and `CODEOWNERS` (you review engine changes; trusted community members can review driver PRs).

**Alternative to consider:** AGPL-3.0 is real open source, and anyone hosting a modified version must publish their changes. It does *not* forbid reselling, though. Since you want no reselling, go with PolyForm NC.

**Data-licence compatibility:** you can only import outside driver data whose licence allows it under NC-SA terms. GPL-licensed databases (e.g. check QSpeakers' licence) or "all rights reserved" sites **cannot** be imported. Manufacturer datasheet *numbers* (facts) entered by hand by contributors, with a datasheet link, are the safe main route.

---

## 3. Architecture overview

```
┌──────────────── Browser (static site on GitHub Pages / PWA) ────────────────┐
│  UI (React + TypeScript)                                                     │
│   ├─ Driver panel (T/S editor w/ locking, import)                            │
│   ├─ Designs list (A/B/C/D: sealed, vented, 1×PR, 2×PR …)                    │
│   ├─ Chart area (SPL, excursion, port velocity, impedance, GD, max SPL)      │
│   └─ Volume calculator side panel                                            │
│                                                                              │
│  State store (Zustand) ⇄ URL hash (versioned, compressed)                    │
│                                                                              │
│  Web Worker: @sbg/engine  (pure TS, no DOM; later optionally WASM)           │
│   ├─ Lumped-element circuit solver (complex, per frequency)                  │
│   ├─ T/S parameter solver (constraint graph)                                 │
│   ├─ Impedance fitter (Levenberg–Marquardt)                                  │
│   └─ File parsers (.zma, .frd, DATS, WinISD .wdr)                            │
│                                                                              │
│  Driver DB: static JSON shards fetched from the same Pages site              │
└──────────────────────────────────────────────────────────────────────────────┘
            ▲ built and deployed by
┌──────────────────────── GitHub Actions (free for public repos) ─────────────┐
│  CI: lint, typecheck, engine golden tests, driver-JSON schema validation     │
│  Build: validate drivers/ → bundle into search index + shards → Vite build   │
│  Deploy: actions/deploy-pages on every push to main                          │
│  Bot: "Submit a driver" issue form → auto-opens a PR with the JSON file      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Main decision:** all simulation runs in the browser, and GitHub itself is the backend. Pages serves the app, the repo stores the database, Issues and PRs handle contributions, and Actions does the build, validation and moderation tooling. Running costs: £0.

**GitHub Pages limits to design around:** static files only (no server code), published sites capped at 1 GB, and a soft bandwidth limit of about 100 GB/month. The app plus driver DB should be a few MB, so there's plenty of room. Use hash-based routing (`/#/…`) so deep links never 404, and set Vite's `base` to `/<repo-name>/` (or use a custom domain).

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | The engine and UI share types |
| UI | React + Vite (or SvelteKit if preferred) | Large ecosystem, fast HMR |
| State | Zustand + Immer | Small, and serialises easily to the URL |
| Charts | uPlot (or custom Canvas) | Handles thousands of points across multiple overlaid series at 60 fps while sliders move. Recharts/Chart.js are too slow for this |
| Complex math | Small hand-rolled `Complex` lib, typed arrays | Avoids allocations in the hot loop |
| Worker comms | Comlink | Keeps the solver off the main thread |
| URL compression | lz-string or fflate + base64url | Keeps links short |
| Testing | Vitest + Playwright | Golden-file tests for the engine, E2E for the UI |
| Monorepo | pnpm workspaces | `engine`, `web`, `schema`, `db-tools` |
| Hosting/CI | GitHub Pages + GitHub Actions | Free for public repos, no infrastructure to run |
| Schema validation | Zod (shared) + JSON Schema export | The same schema validates PRs in CI and data in the app |

---

## 4. The simulation engine (the core)

### 4.1 Model

A **lumped-element equivalent circuit** solved in the frequency domain at about 400–800 log-spaced points from 5 Hz to 500 Hz. This is the same approach WinISD uses, so results should match closely.

Elements:
- **Driver:** Re, Le (with an optional semi-inductance / Wright / LR-2 model to handle lossy inductance correctly), Bl, Mms, Cms, Rms, Sd. Supports N drivers in series, parallel or series-parallel, and isobaric (compound) loading.
- **Box:** acoustic compliance Cab from net Vb, plus leakage loss (Ql, default 7–10), absorption loss (Qa), and an optional fill factor that increases effective Vb.
- **Port:** acoustic mass Map using effective length with selectable end corrections (flanged/free, 0.613 / 0.849 × r), port loss Qp, and round or slot geometry (slot ports can use a box wall, which changes the end correction). Multiple ports supported.
- **Passive radiator:** Mmp (with added-mass input), Cmp, Rmp (from Qmp), Sdp, Xmax_PR. N PRs (1, 2 or 4) combined as parallel acoustic branches, or modelled individually when they differ.
- **Radiation:** sum of all volume velocities (driver − ports/PRs, with correct sign), half-space or full-space toggle, optional baffle-step/room-gain overlay.

### 4.2 Outputs (per design, per frequency)

| Output | How it's calculated |
|---|---|
| SPL @ input power | Sum of volume velocities → far-field pressure |
| Driver cone excursion | X = U_d / (jω·Sd), peak in mm, with an **X_max redline** |
| PR excursion | X = U_pr / (jω·Sdp) with a **PR X_max redline**, per PR |
| Port air velocity | v = U_p / Sp, peak m/s, with a **chuffing redline** (configurable; default warning ~17 m/s, about 5% of c) |
| Impedance | |Z| and phase, for checking against a measured .zma |
| Group delay | −dφ/dω |
| Max SPL | Lowest of: thermal limit (Pe), X_max limit, PR X_max limit, port-velocity limit, shown as a single limiting curve with each region labelled by which limit applies |
| Max power | Power at which each limit is first hit, per frequency (the drive setting, before filters and EQ) |
| Amplifier at max | The amplifier's RMS voltage, current and real power needed to reach Max SPL at each frequency, after the high-pass filter and EQ, into the speaker's impedance (shown as the Max SPL chart's **Volts** and **Amps** views) |

**Input power convention:** WinISD uses V = √(P·Re). Use the same as the default for familiarity, offer "2.83 V" and "V = √(P·Z_nom)" as alternatives, and always show which one is active.

### 4.3 Signal-chain extras (phase 2)
High-pass filters (Butterworth/LR/Bessel, orders 1–4), Linkwitz Transform, parametric/shelf EQ, amplifier output impedance and cable resistance. These are needed because subwoofer builds are almost always EQ'd and/or high-passed, and the excursion results are misleading without them.

### 4.4 Accuracy plan
- **Golden tests:** pick 6–8 well-known drivers (e.g. Dayton RSS/UM, SB Acoustics, a car-audio woofer, a small full-range with PRs). Model each in WinISD, Hornresp and VituixCAD, export the curves, and require the engine to match within **±0.1 dB SPL and ±2% excursion**.
- **Analytic checks:** sealed box Qtc/Fc match the closed-form equations, and the vented box Fb matches Helmholtz.
- **Property tests:** energy/sign sanity, and that an infinite box tends toward the infinite-baffle result.
- **Known limits, stated in the UI:** small-signal linear model only, so no Bl(x)/Cms(x) nonlinearity, port compression or thermal compression in v1. Add a "model limitations" info popover.

### 4.5 Performance target
Up to 8 designs × 800 points recalculated in **under 5 ms** in the worker, so dragging any slider updates in real time. Lumped solves are cheap, so plain TypeScript with typed arrays is enough. Keep WASM (Rust) as an option, not the plan.

---

## 5. T/S parameter editor: fixing the "wrong order overwrites my values" problem

**Approach: a constraint graph, not a cascade.**

- Parameters are nodes: fs, Qts, Qes, Qms, Vas, Re, Le, Bl, Mms, Mmd, Cms, Kms, Rms, Sd, Xmax, Pe, η0, SPL.
- Relationships are equations: fs = 1/(2π√(Mms·Cms)), Vas = ρc²·Sd²·Cms, Qes = 2π·fs·Mms·Re / Bl², and so on.
- Each field has a state: **Entered** (what the user typed), **Locked** (pinned), or **Derived** (calculated and shown greyed out).
- When a field changes, the solver only recalculates Derived fields. It **never** overwrites Entered or Locked values.
- **Over-determined input** (e.g. user enters fs, Qes, Vas, Sd, Mms and Cms): show a consistency badge, such as "Vas implies Cms = 1.12 mm/N but you entered 1.05 mm/N (6% off)", with one-click "trust this one" buttons.
- **Under-determined input:** list exactly which parameters are still missing for each output (e.g. "Need Sd or Vas to compute excursion").
- Every field accepts units (L / ft³ / in³, mm / in, g / kg …) and lets you paste "Vas = 44.2 L" directly.
- **Datasheet paste box:** paste a block of text from a PDF datasheet, and a parser pulls out recognised parameters for review before they're applied.

---

## 6. Imports and exports

| Format | Direction | Notes |
|---|---|---|
| `.zma` / `.txt` impedance (freq, |Z|, phase) | Import | Overlays the measured impedance on the simulated curve. Also feeds the T/S fitter |
| DATS export | Import | DATS saves .zma plus a T/S text file. Parse both |
| `.frd` | Import | Optional measured SPL overlay |
| WinISD `.wdr` driver files | Import + Export | **Key migration path:** lots of users have folders of these |
| WinISD `.wpr` projects | Import (best effort) | Nice to have |
| CSV of any curve | Export | |
| PNG/SVG chart | Export | Forum-ready, with the shared link printed on the image |

**T/S from impedance (phase 2):** fit Re, fs, Qms, Qes, Le-model to a .zma with Levenberg–Marquardt, using added-mass or known-Sd/Vas methods for Mms/Vas. This turns a DATS sweep straight into a usable driver profile.

---

## 7. Driver database (stored in the repo, built by the community)

**Finding:** loudspeakerdatabase.com does not appear to offer a public API, and I couldn't find any published terms that allow reuse. Don't scrape it or import from it. You could ask its owner to link to or contribute to this project. The repo database is the source of truth.

### 7.1 Layout in the repo
```
drivers/
├─ _schema/driver.schema.json        # generated from packages/schema (Zod)
├─ dayton-audio/
│  ├─ _brand.json                    # brand name, website, country
│  ├─ rss265hf-4.json
│  └─ um12-22.json
├─ sb-acoustics/ …
passive-radiators/
├─ dayton-audio/dsa270-pr.json       # PRs are first-class: Mmp, Cmp, Qmp, Sd, Xmax, max added mass
measurements/                        # optional: contributed .zma files backing a "measured" entry
└─ dayton-audio/rss265hf-4/2026-11-alice.zma
```
- **One file per driver** means PRs are small, merge conflicts are rare, git blame shows who added what, and reviews are easy.
- File path = stable ID (`dayton-audio/rss265hf-4`). Shared links refer to drivers by ID **and** also carry the T/S values, so old links keep working even if a record changes later.

### 7.2 Record schema
```json
{
  "brand": "Dayton Audio", "model": "RSS265HF-4", "type": "woofer",
  "nominal_ohms": 4, "size_in": 10,
  "ts": { "fs": 22.0, "qms": 3.9, "qes": 0.42, "vas_l": 63.8, "re": 3.3, "le_mh": 1.4,
          "bl": 11.4, "mms_g": 88.6, "sd_cm2": 330, "xmax_mm": 14.2, "pe_w": 300 },
  "physical": { "displacement_l": 1.9, "cutout_mm": 230, "depth_mm": 140 },
  "sources": [
    { "kind": "datasheet", "url": "https://…", "retrieved": "2026-11-02" },
    { "kind": "measured", "by": "github:alice", "method": "DATS v3, added mass",
      "file": "measurements/dayton-audio/rss265hf-4/2026-11-alice.zma" }
  ],
  "status": "verified"
}
```
(Example numbers are placeholders.) Every value must have a source. `status` is `community` → `verified` once a reviewer has checked the numbers against the datasheet link.

### 7.3 Contribution paths (from easiest to most technical)
1. **"Submit this driver" button in the app.** After entering or importing T/S parameters, the button opens a pre-filled **GitHub Issue Form** (`.github/ISSUE_TEMPLATE/new-driver.yml`) with the values encoded. The user only needs a GitHub account; no git knowledge.
2. **Issue-to-PR bot (GitHub Action):** when an issue labelled `new-driver` is opened, the action parses the form, writes the JSON file, runs validation, opens a PR and links it back to the issue. A maintainer reviews and merges.
3. **Bulk WinISD import:** a CLI in `packages/db-tools` (`pnpm db:import-wdr ./folder`) converts `.wdr` files into JSON for contributors with large libraries. They must add datasheet links before submitting.
4. **Direct PR** for people comfortable with git.

### 7.4 CI checks on every driver PR
- JSON Schema validation (types, units, required fields, `sources` present).
- **T/S consistency check** using the engine's own parameter solver: e.g. fs, Qes, Vas and Sd must agree with Mms, Cms and Bl within 5%, otherwise the PR fails with a readable explanation.
- Plausibility ranges (fs 5–5000 Hz, Qts 0.1–3, etc.), duplicate detection (same brand + model), and filename/ID rules.
- A bot comment shows a preview: the parameters as a table, plus a link to the PR's deploy preview with the driver loaded in a sample sealed/vented box.

### 7.5 How the app loads it
At build time, `db-tools` compiles `drivers/` into:
- `index.json`: brand, model, type, size and a few key parameters for every driver (small enough for instant client-side fuzzy search, using MiniSearch).
- One shard per brand (`drivers/dayton-audio.json`), fetched only when needed and cached by the service worker so it works offline.

Even 10,000 drivers stays at a few MB in total.

## 8. Real-world volume calculator (side panel)

**Gross shapes:** rectangular box, cylinder (sonotube), sphere, truncated pyramid (frustum), wedge/trapezoid prism, plus a "custom" sum of shapes for complex builds.

**Inputs:** external dimensions plus wall thickness (with per-face overrides) → internal gross volume. Or enter internal dimensions directly.

**Deductions (each one listed, can be toggled on/off):**
- Driver(s): from the database if known, otherwise estimated from cutout and depth (truncated cone plus magnet cylinder)
- Passive radiators: frame plus surround volume × N
- Ports: outer tube volume inside the box (OD, wall, internal length). Slot ports subtract the panel volume
- Bracing: list of braces (L×W×T), or window braces (outer minus window), or a "% of gross" shortcut
- Crossover board, plate amp, terminal cup, other items

**Additions:** optional stuffing factor (e.g. +10–25% effective Vb for heavy fill), clearly labelled as an approximation.

**Output:** Net Vb, which goes **live** into the selected design. Change the wall thickness and the SPL chart updates. There's also a "solve for dimensions" mode: give a target net Vb plus a ratio (golden ratio or fixed footprint), and it returns the external dimensions. A cut list is a later stretch goal.

---

## 9. UX and layout

- **Left rail:** Drivers (library search, editor, imports) and Designs list (A/B/C/D, colour-coded, each with type, net Vb, tuning, and visibility toggle).
- **Centre:** stacked, synchronised charts with a shared frequency axis and crosshair. Default stack: **SPL / Excursion (driver and PRs) / Port velocity**, with tabs for Impedance, Group delay, Max SPL, Max power. Redlines are drawn as dashed horizontal lines, and the curve turns red/hatched where it crosses a limit.
- **Global power slider** (watts or volts) in the header updates every design.
- **Right panel:** volume calculator (collapsible).
- **Alignment helpers:** one click to apply QB3, SBB4, SC4 or Bessel for vented, Qtc 0.5/0.577/0.707 for sealed, and PR mass optimisation ("add mass to tune Fb = X Hz").
- **Comparison mode:** "Sealed vs Ported vs 2×PR for this driver" creates three designs at once with sensible starting volumes.
- **Mobile:** read-only friendly, so shared links look good on a phone. Editing is desktop-first.
- Light and dark themes. Keyboard shortcuts for power users.

---

## 10. Shareable links (no server)

**Design stored in the URL:**
- Serialise the store into a **versioned** schema (`v: 1`), strip defaults, compress (fflate deflate-raw), and base64url-encode into the URL **hash** (`…github.io/speaker-box-genius/#s=…`). The hash never reaches any server, and GitHub Pages serves it like any other URL.
- A typical 3-design project should come to well under 1–2 KB. A schema-migration layer means old links keep working forever.
- Drivers are referenced by DB ID **plus** their T/S values, so links with custom or unreleased drivers still work.
- "Copy link", "Copy BBCode for diyAudio" and "Copy Markdown for Reddit" buttons.

**Trade-off of having no server:**
- **No short links and no per-link preview images.** A static host can't create a link preview (OG image) for each design. Pasted links will show the generic site preview card instead.
- **Workaround 1, image plus link:** "Export for forum" renders a PNG of the charts with a QR code and a short summary baked in (driver, box, tuning). Users upload the image and paste the link underneath. This gives the same result as a preview card on every forum.
- **Workaround 2, design gallery in the repo (phase 3):** users can submit a design to `gallery/` with a PR or issue form (same bot pattern as drivers). At build time, Actions creates a static page for each gallery entry with its own pre-rendered OG image (headless chart render in CI). This gives short URLs like `/g/rss265-2xpr-50l` **with** real link previews, using only GitHub Pages. It also doubles as a browsable library of proven builds.

## 11. Phased roadmap

Rough estimates for one experienced developer working steadily. Roughly double them for evenings and weekends.

### Phase 0: Engine spike and validation (1–2 weeks)
- Complex math lib, sealed and vented circuit solve, SPL/excursion/port velocity.
- Golden tests against WinISD for 3 drivers.
- **Exit criteria:** matches WinISD within ±0.1 dB on all test cases.

### Phase 1: MVP (4–6 weeks)
- T/S editor with the constraint solver and locking.
- Sealed, vented, single PR and dual PR (identical PRs).
- Charts: SPL, driver excursion, PR excursion, port velocity, impedance, with redlines and a power slider.
- Volume calculator: box, cylinder, sphere, frustum, plus driver/port/PR/brace deductions, live-linked.
- Multiple designs overlaid on one chart.
- URL-hash sharing, PNG export.
- WinISD `.wdr` import.
- Repo set up: licences, CONTRIBUTING, CLA bot, issue templates, Actions CI and Pages deploy.
- First ~50 drivers and ~10 passive radiators in the repo, entered by hand from datasheets, with schema validation in CI.
- PWA offline support.
- **Launch:** soft-launch on diyAudio and r/diyaudio for feedback.

### Phase 2: Power-user features (4–6 weeks)
- Multiple drivers (series/parallel/isobaric), non-identical PRs, multiple ports, slot ports.
- Filters, Linkwitz Transform, EQ; Max SPL and Max power charts.
- .zma/DATS import with overlay; T/S fitting from impedance.
- In-app driver search and the "Submit this driver" issue form.
- Alignment presets, PR mass solver, solve-for-dimensions.

### Phase 3: Community and virality (3–4 weeks)
- Issue-to-PR driver bot, CI consistency checks and preview comments (the basic JSON + schema DB ships in Phase 1).
- Design gallery with pre-rendered static pages and OG images.
- Local project library (IndexedDB) plus JSON project file import/export. No accounts needed.
- Embeddable iframe widget for blogs and build logs.

### Later / stretch
4th and 6th order bandpass, simple TL/quarter-wave, nonlinear Bl(x)/Kms(x) large-signal sim, port compression, 3D box preview and cut-list/flat-pack export, i18n.

---

## 12. Repo structure

```
speaker-box-genius/
├─ LICENSE                 # PolyForm Noncommercial 1.0.0 (code)
├─ LICENSE-DATA            # CC BY-NC-SA 4.0 (drivers/, passive-radiators/, gallery/, docs/)
├─ CONTRIBUTING.md         # how to add a driver, how to run tests, CLA note
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml            # lint, typecheck, engine tests, DB validation
│  │  ├─ deploy-pages.yml  # build + deploy to GitHub Pages on push to main
│  │  └─ driver-bot.yml    # issue form → PR
│  ├─ ISSUE_TEMPLATE/      # new-driver.yml, new-pr.yml, bug.yml, gallery.yml
│  └─ CODEOWNERS
├─ packages/
│  ├─ engine/              # pure TS: circuits, solvers, T/S graph, fitters, parsers
│  │  └─ test/golden/      # reference curves from WinISD/Hornresp/VituixCAD
│  ├─ schema/              # Zod types: drivers, URL state + migrations → JSON Schema
│  ├─ db-tools/            # validate, consistency-check, bundle, .wdr import CLI
│  └─ web/                 # React app (UI, store, charts, worker, PWA)
├─ drivers/                # one JSON per driver, by brand
├─ passive-radiators/      # one JSON per PR, by brand
├─ measurements/           # optional contributed .zma backing "measured" entries
├─ gallery/                # phase 3: community designs (URL-state JSON + notes)
└─ docs/                   # model equations, validation reports
```

Keep `engine` free of any UI dependency so it stays reusable. Under PolyForm NC, other non-commercial tools can use it too.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Users don't trust a new tool's numbers | Publish the validation reports. Golden tests in CI. Show the equations in docs |
| Driver DB licensing / bad data | Data entered by hand from datasheets, with sources required. CI consistency checks. `verified` status from reviewers. No scraping, no importing incompatible licences |
| Someone resells it anyway | Clear licence plus "Required Notice" line. The CLA keeps your ability to enforce or grant exceptions. Accept that NC licences mainly deter rather than prevent |
| NC licence puts some contributors off | Say clearly in the README why it's non-commercial (to protect the community from being resold). Keep contributing as easy as possible |
| Review bottleneck as maintainer | CODEOWNERS for drivers/ with trusted reviewers. Automated checks do most of the work |
| WinISD habits (people expect its exact behaviour) | Match its defaults (Ql = 10, power convention). Offer "WinISD mode" for end corrections |
| Model misused beyond linear range | Clear limitation notes. Turn the curve red past X_max. Port-velocity warnings |
| Long URLs breaking in some forums / no link previews | Compression. Forum-export PNG with QR code. Gallery pages with static OG images |
| Scope creep (horns, TL, crossovers) | Stated non-goals. Defer to Hornresp/VituixCAD |

---

## 14. Open questions to decide

1. **Name and repo slug:** this sets the Pages URL (`<user>.github.io/<repo>`). A custom domain (~£10/yr) is optional and can be added later without breaking hash links if you redirect.
2. ~~**CLA or DCO?**~~ **Decided 4 Nov 2026: a licence-grant CLA** ([`CLA.md`](../CLA.md)), checked by `.github/workflows/cla.yml` (sign by PR comment, signatures on the `cla-signatures` branch). Contributors keep copyright; database-only PRs are exempt.
3. **Framework preference:** React vs Svelte?
4. **Which 6–8 reference drivers** to use for the golden-test suite? These are also good first entries in the DB.
5. **Your GitHub username/org** for the Required Notice and CODEOWNERS.

---

## Sources
- [PolyForm Noncommercial 1.0.0 (SPDX)](https://spdx.org/licenses/PolyForm-Noncommercial-1.0.0.html)
- [diyAudio: "Driver Database" thread on an open T/S DB with a public API](https://www.diyaudio.com/community/goto/post?id=4710602)
- [QSpeakers T/S database (XML, GitHub)](https://github.com/be1/qspeakers/blob/master/qspeakers_db.xml)
- [Thiele/Small parameters — Wikipedia](https://www.wikipedia.org/wiki/Thiele/Small)
- [Example manufacturer T/S sheet with Wright inductance model (Kicker)](https://kicker.com/app/tsparam/51CWQ102.html)
