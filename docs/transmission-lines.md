# Transmission lines (beta)

## Model

`packages/engine/src/line.ts`. One-dimensional duct, as in Hornresp and Akabak:

- Each piece of the line is a transfer matrix between pressure and volume velocity. Tapered pieces are chains of thin uniform slices, which converge to Webster's horn equation. The tapers are linear in area (Hornresp "Par"), conical ("Con") or exponential ("Exp").
- The driver's rear sits anywhere along the line and sees the closed-end branch and the mouth branch in parallel.
- The mouth radiates as a baffled piston (Struve/Bessel radiation impedance) into the same half space as the cone. A port at the mouth (a mass-loaded line) is one more uniform piece.
- Stuffing uses Delany–Bazley's fibrous-absorber model. Flow resistivity comes from the density (Garai & Pompoli, polyester fibre).
- Up to four sections, each with its own taper and stuffing density.
- Fb is the impedance minimum between the first two peaks. When stuffing damps the lower peak into a shoulder, Fb is the shoulder (where the impedance rises least steeply). F3 is the low-frequency edge, because lines ripple above their tuning.
- Tapped horns: the driver's rear and front both open into the line (rear at one point, front at the tap), solved as two nodes; only the mouth radiates.
- Mouth position: when the mouth is further from the listener than the cone (on the back of a folded box, or a custom distance), its output is delayed and scaled by distance.
- The cone's mass: in a line or horn the air on both sides of the cone is modelled explicitly, so the cone carries its bare mass Mmd = Mms − 16ρa³/3 (as in Hornresp). An open line adds the front's radiation load (a baffled piston); the rear's comes from the line. Using Mms here counted the rear air mass twice and made impedance peaks up to 10 % low.
- An MLTL's port can be flared, and port compression (Settings) applies to it like a ported box's.

## Front-loaded horns

The driver sits at the throat in a sealed rear chamber (Vrc), its front into a throat chamber (Vtc) that opens into the horn. The cone sees the rear chamber's compliance in series with the throat chamber in parallel with the horn's input impedance; only the mouth radiates. The "Front horn" preset is an exponential horn with the throat at ½ Sd, the mouth sized for a normalised circumference of 1 in half space, Vrc = ½ Vas, and Vtc for a top end near 4 × the cutoff. Folded, the horn runs from the back towards the front (mouth on the front panel) under a driver section the full width and depth of the box: the sealed rear chamber on top, the motor board with the driver firing down, the throat chamber, and the throat board with a slot along the back into run 1. Chamber heights come from their volumes over that footprint; the app warns when the rear chamber is too shallow for a magnet (about 100 mm) or the throat chamber under 25 mm, giving the volume that would fit. Horns' 0 dB reference is their own passband (median over the two octaves above where the response first comes within 6 dB of its peak), not a plain cone's.

## Hornresp export and import (`packages/web/src/hornresp.ts`)

Export writes a record in the layout of recent Hornresp versions (`|SECTION:` headings, `Key = value`): segments S1…S5 with Par/Con/Exp lengths, OD for lines (a 0.01 cm first segment when the driver is at the closed end), TH for tapped horns, Nd with Vrc/Vtc for front horns, the driver as Sd/Bl/Cms/Rms/Mmd/Le/Re (Mmd without the air load, 16ρa³/3), stuffing as Fr1…Fr4 (flow resistivity per segment, mks rayls/m) with Tal = 100 %; Hornresp uses that filling only in its Loudspeaker Wizard, not from the main window. An MLTL's port is a 0.01 cm step plus a uniform segment (a flared port as its equivalent straight length). Hornresp takes at most 4 segments; designs needing more are refused with the reason. The app also lists every value to type in, in case a Hornresp version refuses the file.

Import reads `Key = value` pairs in order from a file or a one-line forum paste, with comma or point decimals and the INI form (`L12=40.90, PAR`). Unknown flares (Hyp, Tra, Obl) are read as Par with a warning; Lrc, chamber ports and angles other than 2π are flagged, as is a front horn with no rear chamber (Vrc or Lrc = 0, which Hornresp models as an open back). The record's driver can replace the current one.

Hornresp 55.30 imports the exported records unchanged (checked with the nine validation records in `docs/hornresp-validation/records`; the layout test compares against a record Hornresp itself exported).

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

Results (Hornresp 55.30, DSA215-8 at 2.83 V, half space, Hornresp's air c = 344 m/s, ρ = 1.205 kg/m³, SPL from radiated power as Hornresp does). Each case is a permanent test in `packages/engine/test/hornresp.test.ts`, with Hornresp's exports under `test/fixtures/hornresp/`:

| Case | SPL 10 Hz–1 kHz, mean | Ze 10 Hz–1 kHz, mean / worst |
|---|---|---|
| 01 straight TL | 0.08 dB | 0.16 % / 1.0 % |
| 02 tapered TL (Par) | 0.04 dB | 0.16 % / 0.9 % |
| 03 offset-driver TL | 0.04 dB | 0.15 % / 0.8 % |
| 04 TQWT (Con) | 0.03 dB | 0.15 % / 1.4 % |
| 05 MLTL | 0.06 dB | 0.18 % / 1.6 % |
| 06 tapped horn | 0.04 dB | 0.09 % / 0.9 % |
| 07 front-loaded horn (Exp, 20 L rear, 1 L throat chamber) | 0.03 dB | 0.19 % / 1.4 % |

The line's own resonances (acoustic impedance at the driver) fall on exactly the same frequencies as Hornresp's. The only large SPL differences are at the bottom of deep nulls: same frequency, different depth.

What the comparison found and fixed:
- The cone's mass in lines and horns (see Model): impedance peaks had been up to 10 % low.
- SPL: Hornresp works SPL out from the power each opening radiates (a baffled piston's radiation resistance), not from on-axis pressure. The two agree at low frequency and part once the mouth is large next to the wavelength: about 1.7 dB at 500 Hz for an 850 cm² mouth. The app shows on-axis SPL; the engine option `splFrom: "power"` gives Hornresp's.
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
6. A tapped horn (Hornresp TH, S1–S4), driver rear at the closed end.

Target: empty lines within about 0.2 dB of Hornresp, matching resonance frequencies. Stuffed lines are judged on the trend, since the stuffing models differ.
