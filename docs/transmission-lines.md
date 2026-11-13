# Transmission lines (beta)

## Model

`packages/engine/src/line.ts`. One-dimensional duct, as in Hornresp and Akabak:

- Each piece of the line is a transfer matrix between pressure and volume velocity. Tapered pieces are chains of thin uniform slices, which converge to Webster's horn equation. The tapers are linear in area (Hornresp "Par"), conical ("Con") or exponential ("Exp").
- The driver's rear sits anywhere along the line and sees the closed-end branch and the mouth branch in parallel.
- The mouth radiates as a baffled piston (Struve/Bessel radiation impedance) into the same half space as the cone. A port at the mouth (a mass-loaded line) is one more uniform piece.
- Stuffing uses D. K. Wilson's relaxation model for porous media, as Hornresp does (it replaced Delany–Bazley's empirical fit, which was up to 1.2 dB out against Hornresp). Flow resistivity comes from the density (Garai & Pompoli, polyester fibre). Checked against Hornresp's Loudspeaker Wizard at three densities: within 0.07 dB and 0.3 %.
- Up to four sections, each with its own taper and stuffing density.
- Fb is the impedance minimum between the first two peaks. When stuffing damps the lower peak into a shoulder, Fb is the shoulder (where the impedance rises least steeply). F3 is the low-frequency edge, because lines ripple above their tuning.
- Tapped horns: the driver's rear and front both open into the line (rear at one point, front at the tap), solved as two nodes; only the mouth radiates.
- Mouth position: when the mouth is further from the listener than the cone (on the back of a folded box, or a custom distance), its output arrives d/c later in front of the box, at the same level (a far listener on axis, like the 1 m SPL itself and a box's port position). A 1/r drop for the extra distance is left out: below the line's tuning the cone and mouth nearly cancel, and a level mismatch there would show bass a far listener doesn't get. With SPL from radiated power the distance is how far apart the two sources are, as Hornresp's Acoustic Path Length: their powers are added over all directions, |M|² + |C|² + 2·Re(M·C*)·sin(kd)/(kd), and the phase stays that of the two side by side (Hornresp's does too). The Hornresp export writes the distance as the Path and the import reads it back.
- The cone's mass: in a line or horn the air on both sides of the cone is modelled explicitly, so the cone carries its bare mass Mmd = Mms − 16ρa³/3 (as in Hornresp). An open line adds the front's radiation load (a baffled piston); the rear's comes from the line. Using Mms here counted the rear air mass twice and made impedance peaks up to 10 % low.
- An MLTL's port can be flared, and port compression (Settings) applies to it like a ported box's.

## Charts and settings

- **Line load (Za)** chart, for lines and horns: the line's acoustic impedance as Hornresp's Za chart shows it (at the driver; at a front horn's throat without its chambers), resistance and reactance divided by ρc/S there. Checked against Hornresp's Za export for record 01 (`hornresp.test.ts`).
- **Pressure and air speed inside** (line card): at a chosen frequency (slider, or one tap on each of the line's resonances, the peaks of Za), the sound pressure level and peak air speed from the closed end (or throat) to the mouth and on through a port, at the drive on the Signal tab. Stuffed stretches and the port are shaded, the driver (and tap) marked. Engine: `lineProfile()` walks the line's slice matrices from the driver; checked that a quarter wave puts the pressure at the closed end and the air speed at the mouth, that the flows either side of an offset driver add up to the cone's, and that the mouth's (or port's) air speed equals the Port speed chart. Against Hornresp (`lineprofile-hornresp.test.ts`): its Tools → Sound Pressure and Particle Velocity charts for the mass-loaded line (case 05), at the driver ("Offset Throat") and the port's end ("Horn Mouth"), read off screenshots since Hornresp can't export them. Every peak from 27 to 620 Hz is within 2.5 % of full scale and on the same frequency (e.g. 342 Pa at 44 Hz and 520 Pa at 172 Hz at the driver, 5.0 m/s at 40 Hz at the mouth), and the nulls fall where Hornresp's do (no pressure at the driver at 125 Hz, no air moving on from it at 50 Hz). Hornresp samples about 70 points per octave, which clips the sharp upper resonances: at a resonance's exact peak the app's chart reads higher (750 Pa at 473 Hz where Hornresp shows 305), so the test samples the app on Hornresp's frequencies.
- Settings: **SPL** "From radiated power (like Hornresp)" (engine `splFrom: "power"`; it applies to boxes too), and **Air** "Hornresp defaults" (ρ 1.205, c 344). With both, and 2.83 V drive, the app's curves line up with Hornresp's.

## Front-loaded horns

The driver sits at the throat in a sealed rear chamber (Vrc), its front into a throat chamber (Vtc) that opens into the horn. The cone sees the rear chamber's compliance in series with the throat chamber in parallel with the horn's input impedance; only the mouth radiates. The "Front horn" preset is an exponential horn with the throat at ½ Sd, the mouth sized for a normalised circumference of 1 in half space, Vrc = ½ Vas, and Vtc for a top end near 4 × the cutoff. Folded, the horn runs from the back towards the front (mouth on the front panel) under a driver section the full width and depth of the box: the sealed rear chamber on top, the motor board with the driver firing down, the throat chamber, and the throat board with a slot along the back into run 1. Chamber heights come from their volumes over that footprint; the app warns when the rear chamber is too shallow for a magnet (about 100 mm) or the throat chamber under 25 mm, giving the volume that would fit. Horns' 0 dB reference is their own passband (median over the two octaves above where the response first comes within 6 dB of its peak), not a plain cone's.

## Hornresp export and import (`packages/web/src/hornresp.ts`)

Export writes a record in the layout of recent Hornresp versions (`|SECTION:` headings, `Key = value`): segments S1…S5 with Par/Con/Exp lengths, OD for lines (a 0.01 cm first segment when the driver is at the closed end; more than one driver as `2P` or `2S`), TH for tapped horns, Nd with Vrc/Vtc for front horns, the driver as Sd/Bl/Cms/Rms/Mmd/Le/Re (Mmd without the air load, 16ρa³/3), stuffing as Fr1…Fr4 (flow resistivity per segment, mks rayls/m) with Tal = 100 %; Hornresp uses that filling only in its Loudspeaker Wizard, not from the main window. An MLTL's port is a 0.01 cm step plus a uniform segment (a flared port as its equivalent straight length). Hornresp takes at most 4 segments; designs needing more are refused with the reason. The app also lists every value to type in, in case a Hornresp version refuses the file.

Import reads `Key = value` pairs in order from a file or a one-line forum paste, with comma or point decimals and the INI form (`L12=40.90, PAR`). Unknown flares (Hyp, Tra, Obl) are read as Par with a warning; Lrc, chamber ports and angles other than 2π are flagged, as is a front horn with no rear chamber (Vrc or Lrc = 0, which Hornresp models as an open back). The record's driver can replace the current one, with its count and wiring (`2P` / `2S`).

Settings → Amp + cable is written as Rg (and read back: the import says to set it). The high-pass filter, EQ bands (as Peak EQ, Low Shelf, High Shelf), passive parts (the same four branches), a hot coil and non-Hornresp air come with the export as steps to repeat in Hornresp's Filter Wizard and Power Compression tool: the record fields that hold them aren't documented, so they aren't written.

Hornresp 55.30, 60.60 and 60.70 import the exported records unchanged (checked with the fourteen validation records in `docs/hornresp-validation/records`; the layout test compares against a record Hornresp itself exported).

## Folding (`linefold.ts`)

The line is folded into vertical runs side by side, front to back, separated by dividers alternately from the top and the bottom. The box height is solved so that the path along the centre of the runs (straight parts plus the turns) equals the line's length. The cut list adds the dividers, the driver cutout (which must be in the first run) and the mouth opening or port hole on the back. Bends aren't modelled acoustically.

Tapped horns: the driver mounts on the divider between the run holding its rear and the next run, which must hold the tap. Heights along a run are taken as proportional to the distance along it; "Line up the tap" moves the tap level with the rear. The side view also appears on the printed build sheet and on the forum image.

## "Best line"

Tries driver positions (0–40 % along) against stuffing (none, or the first 1…n sections at 4, 8 or 12 kg/m³). "Smoothest": least ripple (1.5 × F3 to 400 Hz) without raising F3 more than 10 %. "Deepest": lowest F3 without more than 1 dB extra ripple. The length is then retuned to the target.

## Checks so far (engine tests)

- A straight line driven at its closed end tunes to its quarter wave within 2 %.
- Offset driver: at L/3 the 3rd quarter-wave resonance drops from 44.6× to 2.7× the cone's output; at L/5 the 5th drops from 16.4× to about 1×.
- A short, wide line with a port lands within 7 % of the ported box of the same volume (the end corrections differ slightly).
- Stuffing at 8 kg/m³ cuts the 150–800 Hz ripple from about 72 dB (empty and lossless) to about 8 dB.
- Baffled piston radiation: its low-frequency limits match 8a/3π and (ka)²/2.
- Textbook horns (`horn.test.ts`): an exponential horn's throat resistance follows √(1 − (fc/f)²) above cutoff (averaged over one mouth-ripple period, within 10 %) and is near zero below; a conical horn's throat impedance follows jkx₀/(1 + jkx₀) within 0.06 ρc/S; a TQWT (cone closed at its narrow end) resonates where tan kL = −k·x₁, within 3 %.
- Front-loaded horn: horn gain over the same driver in a sealed box, less excursion in band, and a throat chamber rolls off the top near S₁c / (2π·Vtc).

## Validation against Hornresp

Results (Hornresp 60.60, re-run on 60.70 on 10 Nov 2026 with identical exports; records 01–07 were first run in 55.30 with the same results; 20–32 added with 60.70; 34–36 (Acoustic Path Length) run on 60.60 on 12 Nov 2026). DSA215-8 unless noted, 2.83 V, half space, Hornresp's air c = 344 m/s, ρ = 1.205 kg/m³, SPL from radiated power as Hornresp does, every exported point from 10 Hz to 1 kHz. Each case is a permanent test in `packages/engine/test/hornresp.test.ts`, with Hornresp's exported table (`hornresp.txt`: SPL, Ze and its phase, excursion, Za, group delay) under `test/fixtures/hornresp/`; the [validation page](https://speakerboxgenius.com/validation/#hornresp) shows every case with both curves:

| Case | SPL, mean | Impedance, mean | Cone excursion, mean | Group delay, 95 % | Line load (Za), mean |
|---|---|---|---|---|---|
| 01 Straight transmission line | 0.08 dB | 0.14 % | 0.25 % | 0.07 ms | 0.00 dB |
| 02 Tapered transmission line | 0.04 dB | 0.15 % | 0.28 % | 0.29 ms | 0.02 dB |
| 03 Offset-driver transmission line | 0.04 dB | 0.13 % | 0.26 % | 0.17 ms | 0.00 dB |
| 04 TQWT | 0.03 dB | 0.14 % | 0.27 % | 0.26 ms | 0.02 dB |
| 05 Mass-loaded line | 0.06 dB | 0.16 % | 0.27 % | 0.07 ms | 0.01 dB |
| 06 Tapped horn | 0.04 dB | 0.08 % | 0.28 % | 0.10 ms | 0.01 dB |
| 07 Front-loaded horn | 0.03 dB | 0.18 % | 0.32 % | 0.13 ms | 0.07 dB |
| 10 Subwoofer in a straight line | 0.05 dB | 0.17 % | 0.24 % | 0.24 ms | 0.01 dB |
| 11 Subwoofer in a mass-loaded line | 0.04 dB | 0.18 % | 0.26 % | 0.41 ms | 0.01 dB |
| 12 Subwoofer in a tapped horn | 0.03 dB | 0.06 % | 0.26 % | 0.12 ms | 0.01 dB |
| 13 Full-range TQWT | 0.03 dB | 0.20 % | 0.35 % | 0.16 ms | 0.02 dB |
| 14 Full-range tapered line | 0.04 dB | 0.17 % | 0.35 % | 0.31 ms | 0.01 dB |
| 20 Exponential line | 0.03 dB | 0.16 % | 0.25 % | 0.33 ms | 0.03 dB |
| 21 Three-segment line (Con + Par + Exp) | 0.04 dB | 0.19 % | 0.30 % | 0.34 ms | 0.05 dB |
| 22 Offset line, driver at a fifth | 0.02 dB | 0.13 % | 0.26 % | 0.12 ms | 0.00 dB |
| 23 Offset tapered line | 0.03 dB | 0.15 % | 0.27 % | 0.15 ms | 0.02 dB |
| 24 Subwoofer in a tapered mass-loaded line | 0.03 dB | 0.19 % | 0.26 % | 0.40 ms | 0.01 dB |
| 25 Mass-loaded line, wide short port | 0.03 dB | 0.12 % | 0.27 % | 0.07 ms | 0.01 dB |
| 26 Conical tapped horn | 0.05 dB | 0.09 % | 0.28 % | 0.11 ms | 0.02 dB |
| 27 Subwoofer tapped horn, two segments | 0.03 dB | 0.09 % | 0.29 % | 0.17 ms | 0.02 dB |
| 28 Full-range front horn | 0.03 dB | 0.20 % | 0.29 % | 0.10 ms | 0.09 dB |
| 29 Subwoofer front horn, Par + Exp | 0.03 dB | 0.16 % | 0.24 % | 0.13 ms | 0.04 dB |
| 30 Straight line, two drivers | 0.03 dB | 0.14 % | 0.24 % | 0.06 ms | 0.00 dB |
| 32 Subwoofer TQWT | 0.03 dB | 0.15 % | 0.25 % | 0.58 ms | 0.02 dB |
| 34 Straight line, mouth 50 cm away | 0.02 dB | 0.14 % | 0.25 % | 0.07 ms | 0.00 dB |
| 35 Straight line, mouth 100 cm away | 0.02 dB | 0.14 % | 0.25 % | 0.07 ms | 0.00 dB |
| 36 Mass-loaded line, port 50 cm away | 0.02 dB | 0.16 % | 0.27 % | 0.08 ms | 0.01 dB |

Group delay is compared away from deep nulls (within 10 dB of the response's highest point a third of an octave either side), where it swings by tens of milliseconds in both. The MLTLs' port output alone (Hornresp's "Horn" output) is compared too: within 0.05 dB, so the port's air speed matches (peaks of 5.0 m/s at 40 Hz in case 05 and 4.5 m/s at 32 Hz in case 11, in both). Hornresp counts drivers with their wiring (OD = 2P or 2S; a bare 2 is read as one), and case 15 is case 05 with two drivers in parallel. Hornresp treats side-by-side cones as one piston of their total area, so each cone's front carries √2 × one cone's air and their output beams like the bigger piston; the app's lines do the same (each cone sees n × the impedance of a piston of n·Sd), and case 15 matches within 0.03 dB and 0.2 %. Before that change the impedance was 0.8 % out and the SPL up to 1.2 dB high at 1 kHz.

What the comparison found and fixed:
- The cone's mass in lines and horns (see Model): impedance peaks had been up to 10 % low.
- SPL: Hornresp works SPL out from the power each opening radiates (a baffled piston's radiation resistance), not from on-axis pressure. The two agree at low frequency and part once the mouth is large next to the wavelength: about 1.7 dB at 500 Hz for an 850 cm² mouth. The app shows on-axis SPL; the engine option `splFrom: "power"` gives Hornresp's.
- Acoustic Path Length (cases 34–36): Hornresp treats the cone and the mouth as two point sources that far apart and sums their powers; its level changes, its phase and group delay don't. The app's on-axis model (in front of the box) is a different thing and was 4–5 dB from it on average, so with SPL from radiated power the app now does the same as Hornresp: within 0.03 dB.
- Za's definition: for an offset driver, Hornresp charts the line ahead of it only ("Offset Throat S2"); for a tapped horn, the rear tap's pressure over the air going on into the horn ("Tapped Throat S2"); always normalised by ρc over the exact area there (the first slice's average had read 3 % high at a horn's throat).
- Export: Hornresp drops the rear chamber and lets the back of the cone radiate when Lrc = 0, so front horns are now exported with Lrc set (the depth of a cube of that volume; with chamber resonances masked it changes nothing else). Stuffing in Hornresp's records was also exported in the wrong unit (rayls/cm; Hornresp reads Fr1–Fr4 as mks rayls/m).

Stuffed lines (8 kg/m³ polyester = 481.65 rayls/m, run in Hornresp's Loudspeaker Wizard, which is the only place it uses segment filling; read off its charts, so no fixtures):

- 08, straight TL filled throughout: acoustic power within about 1 dB from 20 Hz to 1 kHz; acoustic impedance at the driver within 5–10 % with every peak and dip at the same frequency (ours a little more damped below 40 Hz, a little more absorbent above 200 Hz); electrical impedance peak 63 Hz / 13.8 Ω against Hornresp's ~63 Hz / ~14.0 Ω, within about 0.4 Ω elsewhere.
- 09, offset TL filled behind the driver: impedance peaks 21.5 Hz / 30.6 Ω and 60.4 Hz / 19.0 Ω against ~21.5 Hz / ~30.3 Ω and ~60 Hz / ~19.5 Ω; driver input power within 0.02 W from 10 Hz to 2 kHz.
- Hornresp reckons 481.65 rayls/m over 30 L as 0.297 kg of Polyfill (about 9.9 kg/m³), against our 8 kg/m³ of polyester: the two fibre models put the same filling in the same ballpark.

For each case, the user saves the Hornresp record and exports SPL and impedance (File → Export → Chart data), with stuffing off (Fr = 0) and then on:

1. A straight TL with the driver at the closed end (OD with S1 = S2 = S3, no offset).
2. A tapered TL (Par taper), closed end wider than the mouth.
3. An offset-driver TL with the driver at L/3.
4. A TQWT (Con taper, narrow closed end).
5. An MLTL (offset driver plus a port at the mouth).
6. A tapped horn (Hornresp TH, S1–S4), driver rear at the closed end. Hornresp takes the driver's front tap where the last segment starts (S3, or S4 with four segments: case 27), so the export allows only one section after the tap and the import reads the tap there.

Target: empty lines within about 0.2 dB of Hornresp, matching resonance frequencies. Stuffed lines are judged on the trend, since the stuffing models differ.
