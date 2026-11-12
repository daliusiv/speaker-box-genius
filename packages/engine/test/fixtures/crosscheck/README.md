# Cross-checks against other programs (10 Nov 2026)

Reference results from four other programs, each fed the same inputs as the engine.
`../../crosscheck.test.ts` compares them.

| Folder | Program | What was entered | What came back |
|---|---|---|---|
| `rew-eq/` | REW 5.31.3, EQ window, Generic equaliser | Peak 40 Hz −6 dB Q 2; HP (Butterworth 2nd order) 25 Hz; LS Q 30 Hz +6 dB Q 0.8; HS Q 150 Hz −6 dB Q 0.6; L-T 50 Hz Q 1.2 → 30 Hz Q 0.5 | "Save filter coefficients to file", 48 kHz, miniDSP format (a1/a2 sign-inverted), sorted by frequency |
| `rew-ts/` | REW 5.31.3, Thiele-Small parameters | Three impedance files written by the engine (`driverImpedance`): A Re 3.2 Fs 28 Qms 4.5 Qes 0.38 Le 1.2 mH; B as an L2R2 coil (Re 5.6 Fs 45 Qms 6 Qes 0.5 Le 0.4 mH, L2 1 mH, R2 8 Ω); C with ±1 % magnitude and ±0.5° phase noise (Re 6.2 Fs 72 Qms 3 Qes 0.6 Le 0.25 mH). Voice coil DC resistance entered = Re | Fs, Qms, Qes in `cases.json` |
| `xsim/` | XSim 4 | Driver A's impedance file and a flat 90 dB response, behind a ladder: 2.2 mH (0.3 Ω) in line, 220 µF across, 1 Ω in line, 3.3 Ω + 50 µF across; 2.83 V, no source resistance | "Export system FRD/ZMA" |
| `freecad/` | FreeCAD 1.0 (`vol.py` in its Python console) | Walled solids, inside made with `makeOffsetShape` (sharp joins) | Volumes in litres |
| `winisd/` | WinISD 0.7.0.950, Vents tab | Rectangular vents in a 60 L box tuned to 32.395 Hz (end correction 0.732, WinISD's air): 10×10, 25×4, 30×5, 40×2.5 cm | Vent length; the project saved with a 40×2.5 cm vent |
