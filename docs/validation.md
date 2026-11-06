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

So the page always shows what the tests check, and a change to the engine that moves a result
has to come with the updated `results.json`.

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

### Max SPL: power rating against real power, amplifier limits

The default holds Pe against V²/Re, as WinISD does (that's what the WinISD cases compare). Settings → "Power rating vs" → "Real power" holds it against the real power the driver takes, V·I·cos φ, as Hornresp's Maximum SPL does; "Amp max volts" and "Amp max current" add the amplifier's own limits (shown as "Amplifier" in the limit strip). Both are compared with Hornresp (see its notes): maximum SPL within 0.03 dB on average for a sealed and a ported box, an MLTL and a tapped horn, also with the amplifier at 25 V. Checks (`simulate.test.ts`): at a thermally limited point the driver takes exactly Pe; never below the V²/Re maximum; volts and amps never exceed the amplifier's limits and each sets the maximum somewhere.

### Hot voice coil (Settings → Voice coil °C)

Not in WinISD (20 °C, the default, is what's compared). Re(T) = Re · (1 + 0.00393 (T − 20)), Bl, suspension and Le unchanged; watts are turned into volts with the cold Re (as an amplifier rating would be), and the thermal limit counts the smaller power the hot coil takes. Checks (`simulate.test.ts`): factor 1.3144 at 100 °C; above the bass the output falls towards 20·log of the Re ratio (2.37 dB at 100 °C; 0.13 dB short of it at 10 × fs with Qes 0.4, where the motor's damping still counts); less loss near resonance (higher Q); impedance minimum up by the Re ratio. Relative view: referred to the hot driver (shape and F3); dB SPL view: the lost output.
