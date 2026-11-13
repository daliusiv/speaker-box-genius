# Validation

Speaker Box Genius is checked against **WinISD 0.7.0.950** (real WinISD project files) and
**Hornresp 60.70** (re-run 10 Nov 2026; 60.60 gave identical exports; the wizard box cases B4–B6, B12, B14, B15 and S1–S5 are on 60.60 only, re-run 12 Nov 2026) (Hornresp's own exported results: SPL, impedance, cone excursion, group
delay and the line's acoustic impedance for lines and horns; SPL, impedance, excursion and the
port's or passive radiator's own output for sealed, ported, PR and bandpass boxes). Every comparison is an
automated test, and the results are published at
**[speakerboxgenius.com/validation](https://speakerboxgenius.com/validation/)**: each case,
our value next to the reference, the difference and its tolerance, charts, and the known
differences.

## How it fits together

| Piece | What it is |
|---|---|
| `packages/engine/validation/winisd.ts` | The WinISD cases: project file, setup, the values read from WinISD, tolerances, notes on known differences |
| `packages/engine/validation/hornresp.ts` | The Hornresp cases (one folder each under `packages/engine/test/fixtures/hornresp` for lines and horns, `hornresp-boxes` for boxes), tolerances and notes |
| `packages/engine/test/winisd.test.ts`, `hornresp.test.ts` | Run every case on every push |
| `packages/engine/validation/report.ts` | Writes [`docs/validation/results.json`](validation/results.json): every value, difference and curve |
| `packages/engine/test/validation-report.test.ts` | Fails when `results.json` is out of date |
| `site/validation.ts` | Builds the /validation/ page from `results.json` at deploy |
| `packages/engine/src/winisdAlignments.ts` | The ported presets as WinISD's wizard sizes them: its QB3, BB4 and C4 curves, measured from WinISD (32 drivers, Qts 0.14–0.76) |
| `packages/engine/test/fixtures/winisd-alignments.json`, `winisd-alignments.test.ts` | WinISD's own boxes for 19 other drivers, checked on every push and shown on the page ("Ported presets") |
| `packages/engine/test/fixtures/winisd-parity.json`, `winisd-parity.test.ts` | WinISD's sealed boxes, Qtc and Fsc, driver editor values and PR tunings ("Sealed presets") |
| `packages/engine/validation/winisd-run.ts`, `test/fixtures/winisd-run/`, `winisd-run.test.ts` | The full WinISD run: 51 projects and about 1,300 values read from WinISD's graphs ("The full WinISD run") |

So the page always shows what the tests check, and a change to the engine that moves a result
has to come with the updated `results.json`.

## The ported presets

WinISD's wizard doesn't size QB3, BB4 or C4 boxes with the textbook equations: each alignment
is one curve of Vb/Vas and Fb/Fs against the driver's Qts, and that Qts includes WinISD's
amplifier resistance (Rg, 0.1 Ω by default) in series with Re: Qes' = Qes·(Re + 0.1)/Re.
`winisdAlignments.ts` holds the curves, read from WinISD for synthetic drivers (Fs 30 Hz,
Qms 5, Vas 50 L, Re 6 Ω, Qts 0.14 to 0.76 in steps of 0.02) and interpolated (monotone cubic).
Against 19 drivers that aren't in that sweep (Re 3–6.5 Ω, Qts 0.20–0.70) they agree within
WinISD's two-decimal display. Settings → Box presets → Textbook gives the lossless
equations instead (QB3/B4, Keele's alignment above B4, SQB3, C4/SC4, BB4/SBB4).

To add a check: load the driver's `.wdr` in WinISD's new-project wizard, choose Vented and the
alignment, read Vb and Fb off the Box tab (leave Rg at 0.1 Ω), and add the driver to
`packages/engine/test/fixtures/winisd-alignments.json`.

## Sealed presets, Qtc, the driver editor and passive radiators

WinISD's closed-box wizard sizes Qtc 0.577 / 0.707 / 0.8 … boxes from a Q that counts its 0.1 Ω
Rg and the box's absorption: 1/Q = 1/Qes' + 1/Qms + 1/100, Vb = Vas / ((Qtc/Q)² − 1). The app's
sealed presets do the same (`sealedVolumeForAlignment` with `style: "winisd"`), and the summary's
Qtc counts Rg and Qa as WinISD's Box panel does with its leak off. (With its default leak,
WinISD's Qtc and Fsc readouts move in ways its own curves don't show; and the panel shows stale
values until a field is edited.) The app's Amp + cable setting defaults to WinISD's 0.1 Ω.

`fixtures/winisd-parity.json` and `winisd-parity.test.ts` hold the sealed boxes, Qtc and Fsc, the
driver editor's Mms, Cms, Rms, Bl, η0 and EBP for four database drivers (with WinISD's air), and
three passive radiator tunings (WinISD takes a PR's compliance from its Vas; the app's .wpr
export writes the Vas of the compliance it simulates). The page shows them under "Sealed presets".

## The full WinISD run (9 November 2026)

51 projects written by the app's .wpr export, opened in WinISD and read off its graph cursor at
15, 22, 33, 50, 80 and 150 Hz: sealed, ported, PR and 4th/6th-order bandpass boxes; losses; Rg;
Le; air, distance and a hot coil; 2 and 4 drivers; isobaric pairs; high-pass filters; and runs at
rated power. The values were read by OCR, so a signed value is accepted with either sign (a minus
can be lost) and values the OCR passes disagreed on were dropped. What isn't compared, and the
few leftover differences, are listed in `winisd-run.ts` and on the page.

What the run settled about how WinISD computes. The box losses and the bandpass phase are now the
app's for everyone; WinISD's watts are Settings → Watts "Into coil + cable (like WinISD)", which
the WinISD preset and opening a WinISD project set (the default stays the amplifier's view):

- **Watts.** WinISD's watts go into the voice coil and
  its Rg together: V = √(P·(Re + Rg)) at the amplifier, with Rg in the circuit; with a hot coil,
  Re is the hot one (WinISD's dTVC, 0.39 %/°C). An isobaric pair (coils in series) is driven from
  one driver's Re, with Rg on each coil. "Amp volts from cold Re" keeps the circuit view (as
  Hornresp: V = √(P·Re) cold, Rg taking its share), and a drive set in volts is always the
  amplifier's volts.
- **Box losses.** Each Q is at the box's tuning, as before, but WinISD takes a sealed box's Qa
  against the box in series with the driver's suspension (the compliance that sets Fc), and a
  PR box's Ql and Qa against the box in series with the radiators' suspensions. Before, PR boxes
  were up to 0.5 dB off near Fb.
- **Bandpass phase.** A bandpass box's sound is its ports': its phase is 180° from a cone facing
  the room.
- **WinISD's projects.** The export writes the driver's full record (Bl, Mms, Cms, Rms) and
  `KLe=0`: with only Fs, Qes, Qms and Vas WinISD fills its own values in, and its impedance and
  isobaric curves change; without `KLe=0` it applies its own lossy-inductance model.
- **Not followed on purpose.** WinISD's maximum SPL has no port-speed limit; WinISD plots one
  driver's impedance (one coil of an isobaric pair); and WinISD has no series 6th-order bandpass,
  so the app doesn't write one.

## Independent circuit check (SPICE)

WinISD and Hornresp are other programs' versions of the same lumped model. This check builds the
model again from the textbook equations, as an electrical equivalent circuit, and solves it with
two solvers that share no code with the engine: [ngspice](https://ngspice.sourceforge.io/) in CI
and a small standard-library Python solver (`mna.py`) on every test run. Each netlist is a plain
SPICE file. The same builder writes the app's **Save & Export → LTspice netlist** export: filters and EQ as
Laplace sources instead of ngspice's `s_xfer` blocks, every inductor with `Rser=0` (LTspice's
default is 1 mΩ), and a header saying which node is SPL, impedance, excursion and so on. A test
solves the LTspice text of every filtered case (`mna.py` reads the Laplace expressions too) and
gets the ngspice text's results, and another exports the app's example boxes and checks them
against the app.

| Piece | What it is |
|---|---|
| `packages/engine/validation/spice/elements.ts` | Element values from the case's inputs (Small's equations), the units table and the conventions ledger: every deliberate choice the engine makes (loss reference frequencies, where Qa and Ql sit, Rg, watts, air) with its source |
| `packages/engine/validation/spice/netlist.ts` | Case → netlist: coil, motor (a lossless gyrator, Bl/Sd), cone, box, port, and probes for SPL, excursion, port air speed and box pressure |
| `packages/engine/validation/spice/mna.py` | The Python solver (modified nodal analysis, LU with pivoting, residual check) |
| `packages/engine/test/fixtures/spice/inputs/*.json` | The cases, with every number resolved (driver, box, options, air); never edited once committed |
| `packages/engine/test/fixtures/spice/cases/*.cir` | The netlists written from them (`pnpm spice:netlists`) |
| `packages/engine/test/spice-analytic.test.ts` | The circuit against closed forms first: free-air and sealed resonance, Qtc and the mass-controlled level, box and far-field pressure, Helmholtz tuning, port speed, power balance of the motor, and the polarity of the port's flow |
| `packages/engine/test/spice.test.ts` | Engine vs the circuit for every case: SPL, phase, group delay, impedance and its phase, excursion, port air speed, box pressure |
| `packages/engine/test/spice-imports.test.ts` | The builder may take only types from the engine |
| `.github/workflows/spice.yml` | Every case in ngspice, against `mna.py` (within 1e-6) and the engine |

The builder never imports the engine's model code: a wrong formula on either side shows up as a
difference. Tolerances: SPL 0.01 dB (95th percentile), impedance, excursion, port speed and box
pressure 0.1 %, phase 0.1°; in practice the engine and the circuit agree to about 1e-9.

What's covered (439 cases, every one compared on every output):

- **Sealed, ported, passive radiator and bandpass boxes:** 60 generated cases of each kind (bandpass:
  4th order, 6th order parallel, 6th order series) plus hand-made ones. The generator
  (`pnpm spice:generate <kind> <count>`) draws database drivers in strata of Qts (0.15–0.8), box size
  (0.3–4 × Vas) and tuning (0.7–1.4 × Fs; bandpass fronts 0.9–2.5 × Fs), so every corner is
  covered. It writes the resolved numbers to new input files; committed cases never change.
- **Passive radiators:** 1, 2 or 4 per box with added mass, some with a second, different PR; also
  as a bandpass chamber's opening.
- **Several drivers and isobaric pairs:** the circuit builds every driver as its own coil and cone
  (an isobaric pair as two real drivers, one behind the other), wired in series or parallel, with
  one shared Rg. The engine uses one equivalent driver; the two agree.
- **Flared ports:** v08 and v09 (both ends, one end). The flare's throat-equivalent length and end
  corrections follow the engine's definition (ledger #28), so these check the circuit around it, not
  the flare model itself.
- **Drive and air:** Le and L2R2 coils, Rg, hot coils, both ways of counting watts, 2.83 V, standard,
  WinISD and thin (835 hPa) air, half and full space, 1 and 2 m.
- **Signal chain:** 60 generated sealed and ported boxes with a random high-pass (Butterworth 1–4,
  Linkwitz-Riley 2 and 4), up to three EQ stages (peaking, shelves, Linkwitz Transform) and passive
  parts (the four-branch ladder, parts in series or parallel). Filters and EQ are s-domain blocks
  (ngspice's `s_xfer`), built from their textbook definitions; closed-form checks confirm each
  corner (Butterworth −3 dB, Linkwitz-Riley −6 dB, the Linkwitz Transform's (f0/fp)² bass boost).

Worst difference over all of them (`pnpm spice:summary`): SPL 2e-7 dB, impedance 1e-8, excursion
2e-8, PR excursion 7e-9, port air speed 8e-7, box pressures 8e-7 (relative). In CI, ngspice and
`mna.py` agree to about 1e-13.

The /validation/ page shows the worst and mean difference per output, below, around and above
each box's resonance, and three cases' curves, from `docs/validation/spice.json`
(`pnpm spice:report`; `spice.test.ts` fails if it's stale). It's kept apart from `results.json`
because its numbers are rounding-level differences whose last digits can move between Node and
Python builds, so the test compares it loosely: the same cases and counts, each statistic within
a factor of two. Not covered: the piston cone air load (its exact radiation impedance
has no exact circuit), ports as pipes, port compression, and lines and horns, which stay with
Hornresp.

The bandpass circuits, as acoustic networks (pressure across, volume velocity through). Each
chamber is its air spring (Cab, with Qa's resistance in series) and its leak (Ql) to the room. The
cone loop (motor, Ras, Mas, Cas) joins the two chambers, and its positive flow runs from the rear
chamber into the front one.

| Kind | Rear chamber's opening | Front chamber's opening | Between the chambers | Heard |
|---|---|---|---|---|
| 4th order | none | port or PRs, to the room | cone, Qicl | front opening, both leaks |
| 6th order, parallel | port or PRs, to the room | port or PRs, to the room | cone, Qicl | both openings, both leaks |
| 6th order, series | port, into the front chamber | port or PRs, to the room | cone, Qicl, rear port | front opening, both leaks |

The cone faces into the front chamber, so it isn't heard directly; nor is any flow between the
chambers.

To look into one case: `pnpm spice:case <id> [--dump] [--frequency <Hz>] [--ngspice]` prints the
netlist, engine vs circuit per output, and with `--dump` every node voltage and current.

## Adding or updating a case

1. **WinISD:** save the project into `packages/engine/test/fixtures/`, read values off WinISD's
   cursor (or its graphs, marked `graph: true`), and add an entry to `WINISD_CASES` with a
   tolerance for each value and notes for anything that differs.
   **Hornresp, lines and horns:** run the record in Hornresp, export the chart window's table
   (File > Export) as `hornresp.txt` into a new folder under
   `packages/engine/test/fixtures/hornresp/` with the design as `input.json`
   (`options.json` for more than one driver), and give it a title in `HORNRESP_TITLES`.
   **Hornresp, boxes:** the same into `packages/engine/test/fixtures/hornresp-boxes/`, with
   `case.json` (the box, its title, and the cone air Hornresp gives it; see
   `HornrespBoxCase`). Bandpass boxes come from Hornresp's Loudspeaker Wizard as
   `hornresp-power.txt`, `-ze.txt` and `-xd.txt`.
2. Run:

   ```bash
   pnpm validation:report   # rewrites docs/validation/results.json
   pnpm spice:report        # rewrites docs/validation/spice.json (after adding SPICE cases)
   pnpm test                # every comparison, with the other engine tests
   ```

3. Commit the fixture, the code and `results.json`. The page updates on the next deploy.

## Other programs (10 November 2026)

Four more programs, each given the same inputs as the engine. The setups and what came back are
in `packages/engine/test/fixtures/crosscheck/`, compared by `crosscheck.test.ts`.

| What | Program | Result |
|---|---|---|
| DSP filters (Settings → Export to DSP) | REW 5.31.3, Generic EQ: peak, Butterworth high-pass, low and high shelf with Q, Linkwitz transform, saved as 48 kHz coefficients | Coefficients equal to rounding (1e-15); the Linkwitz transform within 2e-9 (prewarped at a slightly different point), 2e-5 dB |
| T/S fit from an impedance file | REW 5.31.3, Thiele-Small parameters, on three files the engine wrote (plain Le, L2R2 coil, one with ±1 % noise) | Fs, Qms and Qes within 0.3 % of REW and of the true values; the L2R2 file is fitted exactly with the L2R2 coil model |
| Passive parts | XSim 4: coil + resistance in line, capacitor across, resistor in line, Zobel across, in front of a driver's impedance file | Response within 0.045 dB and 0.16°, impedance within 0.09 % from 6 Hz to 20 kHz (XSim interpolates the files on its own grid) |
| Volume calculator | FreeCAD 1.0: walled box, cylinder with end caps, sphere, truncated pyramids (gentle and steep), a port tube | Equal (1e-6). A wedge with one vertical face equals the car wedge shape exactly; entered as tapered (all sides) it reads 0.31 % high |
| Slot ports | WinISD 0.7.0.950's vent panel, rectangular vents of four shapes | Lengths equal to WinISD's 0.01 cm: WinISD treats a slot as a round vent of the same area, as the app does, whatever its aspect ratio. WinISD's "1st port resonance" uses the physical length, without end corrections |

WinISD's voice-coil connection (Parallel/Series) on a two-coil driver changes nothing in its
simulation: the driver's values are taken as already wired, which is how the app imports them.

### VituixCAD (Settings → Match → VituixCAD)

**F3.** WinISD reads F3 from the passband, VituixCAD from the curve's maximum. The app does either; peak mode
searches the bass up to 5 × the box's Fc or Fb, and uses the passband if the response is still
rising there. VituixCAD 3's Enclosure tool, driver Fs 30 Hz, Qms 5, Qes 0.45, Vas 50 L, Re 6 Ω,
Sd 500 cm², 2.83 V; f3 / f6 / f10 in Hz:

| Box | VituixCAD | App (peak) |
|---|---|---|
| Sealed 20 L, lossless | 52.6 / 41.2 / 31.7 | 52.4 / 41.1 / 31.8 |
| Sealed 20.3 L, Qa 100, QL 7 | 56.6 / 43.6 / 33.6 | 56.1 / 43.6 / 33.3 |
| Vented 50.1 L, Fb about 30 Hz, lossless | 27.9 / 25.2 / 22.8 | 27.7 / 25.2 / 22.6 |
| Vented 50.7 L, Qa 100, QL 7, Qp 100 | 29.5 / 25.9 / 22.4 | 29.6 / 25.9 / 22.6 |

Within 0.3 Hz, except the lossy sealed f3 (0.5 Hz). The conventions differ most on boxes with a hump or a
high Q: a vented box with a 1.3 dB hump reads 27.7 Hz from the peak and 26.6 Hz from the passband; a small
sealed box (Qtc well above 1) can move 5-10 Hz; flat boxes (Qtc 0.5-0.7) under 1 Hz. The WinISD
comparison above checks F3 from the passband. Tests: `f3ref.test.ts` (engine and web).

The preset sets F3 from the response peak, coil inductance off, leaked air lost, Absorption "damping + bigger box" and Port sound "from the port's far end". Air stays standard, and losses, Rg and units are kept, as with the other presets. With it, the Enclosure tool and the app agree: sealed and vented f3/f6/f10 within 0.3 Hz (lossy sealed f3 0.5 Hz), group delay within about 0.15 ms, impedance peaks within about 1 %.

**Coil inductance.** VituixCAD's enclosure tool leaves Le out of the SPL: with Le 2 mH its f3/f6/f10 don't move, though its impedance includes Le. The preset turns Le off for the SPL only.

**Absorption (Settings → Box losses → Absorption).** VituixCAD's Qa makes the box act larger, as Vb × (1 + 0.9·Qa^−0.9): +1.4 % at Qa 100, +11.3 % at Qa 10, +48 % at Qa 2. Box volume it reports for 500 L typed:

| Qa | 2 | 5 | 10 | 20 | 50 | 100 | 200 | 500 | 1000 |
|---|---|---|---|---|---|---|---|---|---|
| VituixCAD (L) | 741.1 | 605.7 | 556.7 | 530.4 | 513.3 | 507.1 | 503.8 | 501.7 | 500.9 |

The formula matches within VituixCAD's display rounding (0.05 L on 500 L) for any volume and tuning. It is ignored when stuffing is set (stuffing has its own gain). Alignment presets give the slightly smaller typed volume VituixCAD's tables give; they were 1-2 % smaller than ours at Qa 100, which this explains. Bandpass chambers follow too, and exports to WinISD and LTspice carry the volume the box acts as, with a note.

**Port sound (Settings → Ports → Port sound).** A ported box in VituixCAD with the port left next to the driver has its port heard later by the port's length (the physical length, no end correction), at the same level. Found by changing only the port's length at the same box and tuning (Fb 30 Hz, 50 L, and one 10 L box); the group delay peak in ms:

| Port | VituixCAD | App |
|---|---|---|
| Ø3 × 2.1 cm | 26.1 | 26.10 |
| Ø5 × 8.8 cm | 25.9 | 25.95 |
| Ø7 × 19.6 cm | 25.6 | 25.60 |
| Ø10 × 43.7 cm | 24.8 | 24.87 |
| Ø7 × 12 cm, 10 L | 11.9 | 11.93 |

All within 0.07 ms (with the end correction added, the app read 0.08-0.19 ms low). "On the back" or a set distance still wins; bandpass boxes are unchanged.

**Passive radiator boxes.** A PR left next to the driver is heard later by the spacing of their centres side by side, (driver diameter + PR diameter) / 2, which is VituixCAD's rule. Measured in VituixCAD 3 (40 L box, driver Sd 500 cm², the same acoustic PR with only its size changed); the group delay peak in ms:

| PR | VituixCAD | App |
|---|---|---|
| Sd 200 cm² | 22.9 | 22.85 |
| Sd 800 cm² | 22.5 | 22.47 |
| Two Sd 200 cm² | 21.1 | 21.11 |
| Sd 200 cm², 10 L | 8.2 | about 8.25 |

Without it the app read 0.3-1 ms higher. The number of PRs doesn't change the spacing rule. F3, F6 and F10 move by 0.1 Hz or less. The other PR checks hold too: f3, f6 and f10 within 0.4 Hz, tuning, PR and cone excursion match, and the Qa volume gain applies to PR boxes as well.

**Bandpass boxes.** The app's bandpass boxes have a leak between the chambers (Qicl 100 by default, as in WinISD and OpenISD); VituixCAD has none. Clear Qicl to compare. Rear 10 L closed, front 35 L, Ø7 × 15 cm port, all Q 1000:

| | VituixCAD | App, Qicl 100 | App, Qicl cleared |
|---|---|---|---|
| Highest impedance peak (Ω) | 70.2 | 56.3 | 70.8 |
| Group delay peak (ms) | 76.3 | 80.1 | 78.55 |
| f3 / f6 / f10 (Hz) | 34.1 / 32.7 / 30.8 | 33.7 / 32.5 / 30.7 | 33.7 / 32.5 / 30.7 |
| Port speed (m/s) | 9.7 | 9.66 | 9.69 |

A rear 40 L version agrees the same way (impedance within 1 %, F3 within 0.15 Hz). A small difference remains: F3 0.15-0.4 Hz and group delay up to 3 %; the app's bandpass matches Hornresp to 0.03 dB. The preset doesn't change Qicl: like the other box losses it describes your build, and presets keep losses.

**Air.** VituixCAD's ρc² is about 0.4 % lower than standard air, which is about 0.1 Hz, so the preset leaves air standard.

Tests: `vituixcad.test.ts` (the whole preset against VituixCAD's f3/f6/f10, impedance peaks, group delay and port speed, for sealed, ported and passive radiator boxes) and `qavolume.test.ts` (the Qa volume).

## Not compared with WinISD or Hornresp

These have no equivalent in either program, so they're checked by their own tests.

### L2R2 voice-coil model against measured drivers

WinISD has only a plain series Le, and that can't follow a real voice coil above a few
hundred hertz: eddy currents make the coil look less inductive and more resistive as
frequency rises. The optional L2R2 model adds a second inductor L2 with a resistor R2
across it: Ze = Re + jωLe + (jωL2 ∥ R2).

We fitted both models to the free-air impedance measurements Dayton Audio publishes for
12 of its drivers (November 2026). The T/S values were the same for both (fitted around
the resonance); only the coil differed. Below is the RMS error of the fitted impedance
against the measurement:

| Driver | 1–5 kHz, Le | 1–5 kHz, L2R2 | 5–20 kHz, Le | 5–20 kHz, L2R2 |
|---|---|---|---|---|
| DC160-8 | 38.9 % | 6.2 % | 99.3 % | 8.0 % |
| DSA215-8 | 31.6 % | 4.4 % | 93.8 % | 7.3 % |
| MX12-22 | 76.1 % | 7.9 % | 131.6 % | 8.6 % |
| ND91-4 | 11.5 % | 4.1 % | 47.5 % | 6.6 % |
| PS95-8 | 9.7 % | 2.7 % | 66.9 % | 2.9 % |
| RS150-8 | 13.4 % | 3.7 % | 70.5 % | 5.3 % |
| RS180-8 | 18.7 % | 3.8 % | 83.5 % | 5.6 % |
| RS225-8 | 27.2 % | 4.6 % | 95.1 % | 6.1 % |
| RSS315HF-4 | 84.2 % | 6.1 % | 152.3 % | 10.1 % |
| SD270A-88 | 44.7 % | 6.4 % | 100.4 % | 8.2 % |
| TCP115-8 | 22.8 % | 4.9 % | 73.0 % | 6.6 % |
| UMII12-22 | 58.3 % | 5.5 % | 115.0 % | 7.8 % |

Below 200 Hz both models are within 1.5–6.3 %, since the resonance dominates there. The
plain Le is fitted around the resonance like WinISD's, so it gets the low end right but
can be off by 2× or more in the treble. With L2R2 the impedance stays within about 10 %
up to 20 kHz, and so does the response above the resonance of a driver with a lossy coil.
Letting the L2R2 fit move Fs, Qms and Qes too lowers the error a little more, but it
pushes Qes 5–10 % above the datasheets (DC160-8: 0.38 published, 0.41 held, 0.45 free).
The app therefore keeps the T/S values from the fit around the resonance and fits only
the coil. The comparison script is `packages/db-tools/src/le-check.ts`. Dayton's measurement files
aren't kept in the repository.

### Volume calculator: car wedge (single slope)

WinISD takes a volume, not a shape, and Hornresp has no wedge, so the car wedge is checked against geometry. Its inside is a trapezoidal prism with the sloped panel taking its thickness ÷ sin θ across the horizontal; `wedge.test.ts` and `shapeCrosscheck.test.ts` (cases in `fixtures/crosscheck/shapes.json`) compare the closed form with an independent shoelace sum of the inside polygon (the worked example, 800 × 380 mm, 400/250 mm deep, 18 mm walls: 75.5986 L), check that every panel of the panel table plus the inside fills the outside exactly (butt and mitred, slope front and rear, double baffle), that equal depths give the box, the solver's round trips, the saw angles and a hand-worked motor-clearance case at 60°. FreeCAD 1.1.4 agrees to six decimals on five wedges, three with a double-thickness sloped baffle (`fixtures/crosscheck/wedge_check.py` cuts each wall out of the outside shape as a slab, so no inside formula is shared; readings in `freecad-wedge.json`). The FreeCAD wedge in the cross-checks above (one vertical face, 18 mm walls) equals the wedge shape exactly (it read 0.31 % high as a tapered shape). Other calculators usually take `(W − 2T)(H − 2T)(D_avg − 2T)`: 0.47 % high on the example, more with a double baffle or a steeper slope. The tapered (all sides) shape reads a one-slope wedge about 0.2 % high (it splits the taper between front and back); its own model is unchanged.

### FreeCAD macro export (Build → Cut list → FreeCAD macro)

The macro is generated from the same panel table as the cut list (`packages/engine/src/freecad.ts`) and checks itself when it runs: it builds the air inside as a hidden `Cavity` solid and raises an error if FreeCAD's volume of it differs from the app's inside volume by more than 1 part in 10⁶, and likewise for the panels (before their holes are cut) plus the cavity against the outside volume. A CAD kernel thereby re-measures every design that is exported, not only the fixed cases in `vol.py`. Without FreeCAD in CI, `freecad.test.ts` reads the polygons and extrusions back out of the generated macros for every wedge (slope front and rear, butt and mitred, double baffle) and box, and checks that panels plus cavity equal the outside and the cavity the inside (within 10⁻⁸; coordinates are written to 10⁻⁶ mm), one cylinder per baffle hole starting 1 mm outside the face, and that every macro parses as Python (`ast.parse`, skipped when python3 is missing). Cylinders, spheres and tapered boxes are written as FreeCAD primitives (`makeCylinder`, `makeSphere`, a ruled loft between two rectangles) with the same check against the calculator's gross volume. A box is modelled with the wedge's joinery (the sides cover the outside), not the cut list's; the inside is the same. **Run in FreeCAD 1.1.4 (11 Nov 2026):** nine exported macros (wedge slope front and rear, butt and mitred, double baffle; a box with two driver holes; cylinder; sphere; tapered box) all ran, every self-check passed (worst 1.2 × 10⁻⁹) and every solid is valid; the holes sit on the baffle and nothing is mirrored. Log: `packages/engine/test/fixtures/freecad-run/results.txt` (made by `run_all.py` there).

### Ports as pipes (Settings → Ports → Pipe)

Not in WinISD, so not part of the WinISD comparison (the default, "Air mass", is what's compared). It is how Hornresp models ports, so the Hornresp box cases use it: the ported box matches within 0.3 % in impedance and 0.02 dB in the port's own output. A port is modelled as a uniform pipe of its throat's area and its effective length (end corrections included, so it tunes the box exactly as the air-mass port), radiating at its outer end: it adds the pipe's resonances at about c / 2L, 2c / 2L, … Checks (`portflare.test.ts`): within 0.35 dB of the air-mass port below 60 Hz (the pipe's air is slightly springy, which the air-mass model leaves out), and the port's air speed peaks within 5 % of c / 2L. Not modelled: the box's own standing waves, which drive the port hardest when they coincide (the port card warns when they do), and wall losses in the port. Bandpass ports are pipes too: those to the outside like a vented box's, and a series box's rear port as a pipe joining the two chambers (`portflare.test.ts`: within 0.5 dB of air-mass ports below 60 Hz).

### High-pass filter (Settings → High-pass filter)

Butterworth (orders 1–4) and Linkwitz-Riley, applied to the voltage before the amplifier. Compared with Hornresp's Active Filter Wizard on the ported box at 25 Hz (2nd- and 3rd-order Butterworth, 4th-order Linkwitz-Riley): the filtered voltage agrees within 0.0005 %, and SPL, excursion, impedance and group delay as closely as without the filter (see the Hornresp notes, case B12).

### Leaked air (Settings → Box losses → Leaked air)

A box's leak (Ql) takes energy out; "Heard (like WinISD)", the default, also counts the air that escapes as sound, as through a real gap, and "Lost (like Hornresp)" leaves it out. Hornresp's QL is the second kind: with it, the bandpass cases match within 0.03 dB (4th-order port, parallel 6th-order), 0.05 dB (series 6th-order) and 0.1 dB (4th-order with a passive radiator) at the 95th percentile, where the parallel 6th-order box had differed by up to 1.3 dB. Impedance and excursion don't change. Hornresp has no QL for ordinary sealed, ported and PR boxes (their records have no leak), so there the setting is checked only against itself. Checks (`bandpass.test.ts`): only the output changes, the leak's share grows above a bandpass box's passband, nothing changes without a leak.

### Cone air load (Settings → Box losses → Cone air load)

Sealed, ported and PR boxes. "Fixed mass (like WinISD)", the default, keeps the air in front of the cone in Mms. "Piston, like Hornresp" takes that air (8ρa³/3) out of Mms and loads the cone with a baffled piston's radiation impedance instead, n × that of a piston of n·Sd for n drivers side by side. Compared with Hornresp (see the notes): two drivers in one box (B7, B11) and two identical boxes side by side (Tools → Multiple Speakers, B17: one box of twice the volume with twice the drivers) within 0.04 dB and 0.25 % in impedance (the SPL compared from radiated power, as Hornresp gives it; the app's box charts are on-axis, which is within 0.17 dB of it here). With it, a sealed box's Fc, Qtc and F3 use the piston's bass mass (√n × one cone's front air). Checks (`simulate.test.ts`): the same in the deep bass, a lighter cone up high, two drivers' resonance lower, bandpass boxes unchanged.

### Box pressure (chart "Box pressure")

The peak sound pressure inside the box: the chamber pressure the network solves for, per frequency (both chambers of a bandpass box). Compared with Hornresp's Tools → Diaphragm Pressure → Rear Chamber Side (screenshots, as it can't be exported; `boxpressure-hornresp.test.ts`): the sealed box (B1) within 2 Pa of its 267 Pa in the bass, the ported box (B2) peaking at 342 Pa at 44 Hz against Hornresp's 340 Pa at about 44 Hz. Checks: in the bass a sealed box's pressure is its air spring's, ρc²·Sd·x / V.

### Air distortion (Air distortion chart; limit and box fill in Settings → Air distortion)

The box's air is a spring that stiffens more when squeezed than it softens when stretched (P·Vⁿ = const, n = 1.4 for an empty box, 1.3 / 1.2 / 1.1 for the fill settings). Solved as a 2nd-order perturbation: the box pressure P at f (the linear model's) gives a pressure source n(n+1)/4 · P₀ · (P/ρc²)² at 2f in series with the air spring, which drives the same circuit at 2f with the amplifier silent (its source resistance still damps the cone); HD2 is the radiated 2f over the radiated f, at the frequency of the note that makes it. Ports, passive radiators, pipes, leaks and both chambers of a bandpass box are in the circuit as for the response, so near a ported or PR box's tuning, where the cone barely moves but the box pressure peaks, it isn't the cone's excursion that counts. Neither WinISD nor Hornresp models it. Checks (`airspring.test.ts`): against a direct time-domain solution of the nonlinear equations (sealed and PR boxes, 6 and 7 frequencies, 15–100 Hz) within 1 % (3 % where the air is squeezed by more than 5 %); a sealed box against its closed form (γ+1)·(Sd·x/Vb)·kb/|kt − (2ω)²M + j2ωR| within 0.5 %; HD2 ∝ √power and ∝ n(n+1); at max SPL with the limit counted, HD2 equals the limit; a bandpass box with a transparent front chamber gives its sealed box's. Every other result is the same with or without it (it counts in Max SPL only when set to). Where the cone squeezes the air by more than 10 % of the box the chart calls it a rough estimate (the perturbation reads about 0.7 % high there, and higher harmonics grow), past 20 % outside the model. The driver's own nonlinearity (Bl, suspension) isn't included.

#### Lines and horns: along the path

In a line or horn the air's nonlinearity shows as the wave steepening as it travels (weak-shock theory, first term of Fubini's solution): for a plane wave of peak pressure p₁ over a distance L, p₂/p₁ = β·ω·p₁·L / (2ρc³) with β = (γ+1)/2 = 1.2 (Thuras, Jenkins and O'Neil 1935, eq. 12; Blackstock). With the area changing slowly (a horn), the local pressure carries it: p₂/p₁ at the exit = β·ω/(2ρc³) · ∫ p₁(x) dx along the path, the same assumption as Thuras' horn theory, which for an exponential horn gives their "effective tube length" (eq. 20). The engine takes p₁(x) from the line's own pressure profile at each frequency (`pathHd2`, `line.ts`) from where the sound sets off: the driver (an offset driver's closed stub behind it is left out), a tapped horn's rear tap, a front-loaded horn's throat; through a mass-loaded line's port too. Inside a line the pressure is a standing wave, so it's an estimate; the chart calls it rough above 25 % (σ > 0.5) and outside the model past 50 % (where a shock forms). Unstuffed sections are lossless, as in Hornresp, so in a long narrow line it reads a little high; stuffed sections use β = 1.2 too.

Checks (`airpath.test.ts`, data in `fixtures/thuras1935.json`, read off the paper's figures to about ±0.3 dB):

| Check | Cases | Result |
|---|---|---|
| Closed forms: uniform tube, exponential and conical horns; slice size | 4 | within 0.01 % (0.1 % for halved slices) |
| Thuras Figs. 3–5, 3.8 cm tube: their theory (distance 0.7–6 m, 300–3000 Hz, 100–1000 Pa), with the tube's wall loss (Kirchhoff) applied as their theory does | 15 | within 0.51 dB |
| Thuras Figs. 3–5: their measurements | 10 | 3.2 dB under on average (2.3–3.8), as the paper reports for its measurements against theory ("about 3 db lower") |
| Thuras Fig. 7, exponential horn (3.8 cm throat, 78 cm, 200 Hz cutoff, 13 cm feed tube) through the line model, 0.4–14 W at 1 and 2 kHz | 18 | mean 0.00 dB, each within 1.14 dB |
| Thuras Fig. 8, the same horn at 10 W, 500 Hz–4 kHz (shown, not gated) | 5 | −1.42, +0.16, +0.80, +0.57, −2.13 dB (their own curve bends below theory at 4 kHz) |
| Engine: HD2 ∝ √power; at max SPL with the limit counted it equals the limit; off changes nothing; an offset driver's stub is left out | — | exact |



### Passive parts (Signal tab → Passive parts)

Up to four branches between the amplifier and the drivers, in line, across, in line, across (the layout of Hornresp's passive Filter Wizard), each a resistor, coil and capacitor joined in series or in parallel. The bank sees the network as a Thévenin source per frequency (with the amplifier's resistance), and the impedance chart shows what the amplifier sees. Compared with XSim 4 (see Other programs above); not yet with Hornresp. Checks (`passive.test.ts`): no parts changes nothing; a series resistor acts exactly like the amplifier's resistance; a series coil exactly like adding its inductance to the driver's Le; a capacitor across after it makes 12 dB/octave of 6; a Zobel (R = Re, C = Le / Re²) flattens the impedance up high and leaves the response alone; R ∥ L in line keeps the bass and cuts 6 dB up high; two parallel drivers share the network. The passband reference level (for F3) takes the network's resistance with coils as wires and capacitors left out.

### EQ (EQ card: Peaking, Low shelf, High shelf)

Peaking and shelving bands are the standard analog (RBJ) shapes, applied to the voltage before the amplifier. Compared with Hornresp's Equaliser Filter Wizard on the ported box (case B15: a 40 Hz Q 2 −6 dB peak, a 30 Hz Q 0.71 +6 dB low shelf, a 150 Hz Q 0.71 −6 dB high shelf): the voltage reaching the speaker agrees within 0.00005 % from 10 Hz to 20 kHz (Hornresp's Ein), and SPL, excursion, impedance and group delay as closely as without EQ. Checks (`eq.test.ts`): each shape's gain at DC, at its corner and far above it.

### Impulse and step response (chart "Impulse / step")

The response at 48 kHz up to 20 kHz (from radiated power), inverse-FFT'd, peak scaled to 1, as Hornresp's impulse response; the step response is its running sum. Compared with Hornresp's WAV exports for a sealed and a ported box and an MLTL (see its notes): within 0.02 RMS of the peak. Checks (`transient.test.ts`): the FFT round trip; a sealed box's impulse starts positive at t = 0 with nothing before it and its step settles to zero; the impulse's spectrum is the simulated response.

### Frequency-dependent damping (Driver → Suspension losses)

Hornresp's FDD model: the suspension is Rms + 1/(jω(Cms − j·Ams)), with its own Rms in place of the one from Qms (Ams in mm/N in the app, m/N in Hornresp). Compared with Hornresp on a sealed box with two parameter sets (case B13, see its notes): within 0.46 % in impedance and 0.04 dB. Checks (`simulate.test.ts`): the closed form at three frequencies, off when Ams is 0, an isobaric pair doubling Rms and halving Ams.

### Semi-inductance coil model (Driver → Coil model)

Hornresp's semi-inductance model (Thorborg and Futtrup): Re + jωLeb + (jωLe ∥ Rss ∥ Ke·√(jω)), in place of Le and L2R2. Compared with Hornresp on a sealed box with three parameter sets, one with its own Re′ (see its notes): impedance within 0.3 % up to 20 kHz, the coil's effect on SPL within 0.03 dB. Re′, when set, is the coil's resistance; Bl stays from Re and Qes, as in Hornresp. Checks (`simulate.test.ts`): the closed form at three frequencies, and series isobaric coils doubling it.

### Port and PR position (Box → port or PR card → Position)

A port or passive radiators next to the cone (the default, as WinISD has them), on the back panel (the volume calculator's outside depth, when it's linked to the box) or a set distance away; a parallel 6th-order bandpass box takes the distance between its two openings. Settings → SPL decides how the two add up, as for a line's mouth. In front of the box, the port's sound arrives d/c later at the same level (a far listener on axis). VituixCAD's Enclosure tool hears the port from its far end instead (Settings → Ports → Port sound; see the VituixCAD section), which is where its 2–3 % lower group delay comes from. From radiated power, the two are point sources d apart with their powers summed, |a|² + |b|² + 2·Re(a·b*)·sinc(kd), as Hornresp's Acoustic Path Length: the level changes, the phase doesn't (matched to Hornresp 60.60 on the ported box B2 with the port 25, 50 and 100 cm away and the PR box B3 with the PR 50 cm away: 0.012–0.015 dB on average, as on lines, cases 34–36). The SPICE netlist delays the port's sound with a matched lossless line (ledger #29; cases p01–p03, within 1e-9 dB of the engine); radiated power has no linear-circuit form, so a netlist from that setting says so. Checks: a distance of 0 gives the same numbers bit for bit; impedance, excursion and port speed never change; a 4th-order or series 6th-order bandpass box (one opening to the room) is unaffected. When a distance is set, the Response chart adds the same box with its port side by side, dashed.

### Max SPL: power rating against real power, amplifier limits

The default holds Pe against V²/Re, as WinISD does (that's what the WinISD cases compare). Settings → "Power rating vs" → "Real power" holds it against the real power the driver takes, V·I·cos φ, as Hornresp's Maximum SPL does; "Amp max volts" and "Amp max current" add the amplifier's own limits (shown as "Amplifier" in the limit strip). Both are compared with Hornresp (see its notes): maximum SPL within 0.03 dB on average for a sealed and a ported box, an MLTL and a tapped horn, also with the amplifier at 25 V. Checks (`simulate.test.ts`): at a thermally limited point the driver takes exactly Pe; never below the V²/Re maximum; volts and amps never exceed the amplifier's limits and each sets the maximum somewhere.

### Hot voice coil (Settings → Voice coil °C)

WinISD's "voice coil temperature rise" (compared in the full WinISD run: same results at +60 °C) and Hornresp's Power Compression, compared at 120 °C for a sealed box and an MLTL (see its notes: within 0.05 dB and 0.5 %). Re(T) = Re · (1 + 0.00393 (T − 20)), Bl, suspension and Le unchanged. With Settings → Watts "Into coil + cable" (WinISD's way, set by the WinISD preset) the watts go into the hot coil; with "Amp volts from cold Re" (Hornresp's way and the default, and with a drive set in volts) the volts stay and the hot coil takes less power, which the thermal limit counts. Checks (`simulate.test.ts`): factor 1.3144 at 100 °C; above the bass the output falls towards 20·log of the Re ratio (2.37 dB at 100 °C; 0.13 dB short of it at 10 × fs with Qes 0.4, where the motor's damping still counts); less loss near resonance (higher Q); impedance minimum up by the Re ratio. Relative view: referred to the hot driver (shape and F3); dB SPL view: the lost output.
