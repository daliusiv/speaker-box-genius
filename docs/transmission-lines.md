# Transmission lines (beta)

## Model

`packages/engine/src/line.ts`. One-dimensional duct, as in Hornresp and Akabak:

- Each piece of the line is a transfer matrix between pressure and volume velocity. Tapered pieces are chains of thin uniform slices, which converge to Webster's horn equation. The tapers are linear in area (Hornresp "Par"), conical ("Con") or exponential ("Exp").
- The driver's rear sits anywhere along the line and sees the closed-end branch and the mouth branch in parallel.
- The mouth radiates as a baffled piston (Struve/Bessel radiation impedance) into the same half space as the cone. A port at the mouth (a mass-loaded line) is one more uniform piece.
- Stuffing uses Delany–Bazley's fibrous-absorber model. Flow resistivity comes from the density (Garai & Pompoli, polyester fibre).
- Fb is the impedance minimum between the first two peaks. F3 is the low-frequency edge, because lines ripple above their tuning.

## Checks so far (engine tests)

- A straight line driven at its closed end tunes to its quarter wave within 2 %.
- Offset driver: at L/3 the 3rd quarter-wave resonance drops from 44.6× to 2.7× the cone's output; at L/5 the 5th drops from 16.4× to about 1×.
- A short, wide line with a port lands within 7 % of the ported box of the same volume (the end corrections differ slightly).
- Stuffing at 8 kg/m³ cuts the 150–800 Hz ripple from about 72 dB (empty and lossless) to about 8 dB.
- Baffled piston radiation: its low-frequency limits match 8a/3π and (ka)²/2.

## Validation against Hornresp (to do)

For each case, the user saves the Hornresp record and exports SPL and impedance (File → Export → Chart data), with stuffing off (Fr = 0) and then on:

1. A straight TL with the driver at the closed end (OD with S1 = S2 = S3, no offset).
2. A tapered TL (Par taper), closed end wider than the mouth.
3. An offset-driver TL with the driver at L/3.
4. A TQWT (Con taper, narrow closed end).
5. An MLTL (offset driver plus a port at the mouth).

Target: empty lines within about 0.2 dB of Hornresp, matching resonance frequencies. Stuffed lines are judged on the trend, since the stuffing models differ.
