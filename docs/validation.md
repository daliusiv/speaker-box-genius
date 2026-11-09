# Validation

Speaker Box Genius is checked against **WinISD 0.7.0.950** (real WinISD project files) and
**Hornresp 60.60** (Hornresp's own exported results: SPL, impedance, cone excursion, group
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
   pnpm test                # every comparison, with the other engine tests
   ```

3. Commit the fixture, the code and `results.json`. The page updates on the next deploy.

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

### Passive parts (Signal tab → Passive parts)

Up to four branches between the amplifier and the drivers, in line, across, in line, across (the layout of Hornresp's passive Filter Wizard), each a resistor, coil and capacitor joined in series or in parallel. The bank sees the network as a Thévenin source per frequency (with the amplifier's resistance), and the impedance chart shows what the amplifier sees. Not yet compared with Hornresp. Checks (`passive.test.ts`): no parts changes nothing; a series resistor acts exactly like the amplifier's resistance; a series coil exactly like adding its inductance to the driver's Le; a capacitor across after it makes 12 dB/octave of 6; a Zobel (R = Re, C = Le / Re²) flattens the impedance up high and leaves the response alone; R ∥ L in line keeps the bass and cuts 6 dB up high; two parallel drivers share the network. The passband reference level (for F3) takes the network's resistance with coils as wires and capacitors left out.

### EQ (EQ card: Peaking, Low shelf, High shelf)

Peaking and shelving bands are the standard analog (RBJ) shapes, applied to the voltage before the amplifier. Compared with Hornresp's Equaliser Filter Wizard on the ported box (case B15: a 40 Hz Q 2 −6 dB peak, a 30 Hz Q 0.71 +6 dB low shelf, a 150 Hz Q 0.71 −6 dB high shelf): the voltage reaching the speaker agrees within 0.00005 % from 10 Hz to 20 kHz (Hornresp's Ein), and SPL, excursion, impedance and group delay as closely as without EQ. Checks (`eq.test.ts`): each shape's gain at DC, at its corner and far above it.

### Impulse and step response (chart "Impulse / step")

The response at 48 kHz up to 20 kHz (from radiated power), inverse-FFT'd, peak scaled to 1, as Hornresp's impulse response; the step response is its running sum. Compared with Hornresp's WAV exports for a sealed and a ported box and an MLTL (see its notes): within 0.02 RMS of the peak. Checks (`transient.test.ts`): the FFT round trip; a sealed box's impulse starts positive at t = 0 with nothing before it and its step settles to zero; the impulse's spectrum is the simulated response.

### Frequency-dependent damping (Driver → Suspension losses)

Hornresp's FDD model: the suspension is Rms + 1/(jω(Cms − j·Ams)), with its own Rms in place of the one from Qms (Ams in mm/N in the app, m/N in Hornresp). Compared with Hornresp on a sealed box with two parameter sets (case B13, see its notes): within 0.46 % in impedance and 0.04 dB. Checks (`simulate.test.ts`): the closed form at three frequencies, off when Ams is 0, an isobaric pair doubling Rms and halving Ams.

### Semi-inductance coil model (Driver → Coil model)

Hornresp's semi-inductance model (Thorborg and Futtrup): Re + jωLeb + (jωLe ∥ Rss ∥ Ke·√(jω)), in place of Le and L2R2. Compared with Hornresp on a sealed box with three parameter sets, one with its own Re′ (see its notes): impedance within 0.3 % up to 20 kHz, the coil's effect on SPL within 0.03 dB. Re′, when set, is the coil's resistance; Bl stays from Re and Qes, as in Hornresp. Checks (`simulate.test.ts`): the closed form at three frequencies, and series isobaric coils doubling it.

### Max SPL: power rating against real power, amplifier limits

The default holds Pe against V²/Re, as WinISD does (that's what the WinISD cases compare). Settings → "Power rating vs" → "Real power" holds it against the real power the driver takes, V·I·cos φ, as Hornresp's Maximum SPL does; "Amp max volts" and "Amp max current" add the amplifier's own limits (shown as "Amplifier" in the limit strip). Both are compared with Hornresp (see its notes): maximum SPL within 0.03 dB on average for a sealed and a ported box, an MLTL and a tapped horn, also with the amplifier at 25 V. Checks (`simulate.test.ts`): at a thermally limited point the driver takes exactly Pe; never below the V²/Re maximum; volts and amps never exceed the amplifier's limits and each sets the maximum somewhere.

### Hot voice coil (Settings → Voice coil °C)

WinISD's "voice coil temperature rise" (compared in the full WinISD run: same results at +60 °C) and Hornresp's Power Compression, compared at 120 °C for a sealed box and an MLTL (see its notes: within 0.05 dB and 0.5 %). Re(T) = Re · (1 + 0.00393 (T − 20)), Bl, suspension and Le unchanged. With Settings → Watts "Into coil + cable" (WinISD's way, the default) the watts go into the hot coil; with "Amp volts from cold Re" (Hornresp's way, and a drive set in volts) the volts stay and the hot coil takes less power, which the thermal limit counts. Checks (`simulate.test.ts`): factor 1.3144 at 100 °C; above the bass the output falls towards 20·log of the Re ratio (2.37 dB at 100 °C; 0.13 dB short of it at 10 × fs with Qes 0.4, where the motor's damping still counts); less loss near resonance (higher Q); impedance minimum up by the Re ratio. Relative view: referred to the hot driver (shape and F3); dB SPL view: the lost output.
