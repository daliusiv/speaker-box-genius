# Validation against WinISD

Speaker Box Genius is checked against **WinISD 0.7.0.950** using real WinISD
project files (`packages/engine/test/fixtures/*.wpr`). Every row below is an
automated test in `packages/engine/test/winisd.test.ts`, run on every push.

All cases: Dayton Audio DSA215-8, 100.08 W, amplifier resistance 0.1 Ω,
voice-coil inductance not simulated (WinISD's default), WinISD's air constants,
losses Ql 10 / Qa 100 / Qp 100. Importing the `.wpr` file into the app sets all
of these automatically.

Values are WinISD's *transfer function magnitude* (dB) from its cursor read-out.

## Ported: 18.02 L, 10.2 × 70.64 cm port, Fb 41.67 Hz

| Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|
| 20.09 Hz | −25.034 | −25.040 | 0.006 |
| 40 Hz | −5.783 | −5.784 | 0.001 |
| 80.63 Hz | −0.143 | −0.143 | 0.000 |
| Fb | 41.673 Hz | 41.673 Hz | 0 |

Cone excursion and port velocity agree with WinISD's graphs within reading
accuracy. WinISD plots **peak** port velocity.

## Sealed: 10.4 L

| Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|
| 20.28 Hz | −23.679 | −23.677 | 0.002 |
| 40 Hz | −12.113 | −12.107 | 0.006 |
| 80.38 Hz | −2.860 | −2.845 | 0.015 |

WinISD's sealed-box "Fsc" field (79.03 Hz) is the −3 dB frequency; our F3 is
78.94 Hz. The box resonance Fc is 75.0 Hz.

## Passive radiator: 1× DSA270-PR

| Box | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| 18 L, +50 g (Fb 45.90 Hz) | 20.09 Hz | −38.840 | −38.862 | 0.02 |
| | 40 Hz | −7.790 | −7.916 | 0.13 |
| | 61.25 Hz | −0.315 | −0.421 | 0.11 |
| 50 L, +0 g (Fb 38.67 Hz) | 25.33 Hz | −25.974 | −26.031 | 0.06 |
| | 40.13 Hz (peak) | −1.213 | −1.700 | 0.49 |
| | 80.13 Hz (dip) | −1.741 | −1.757 | 0.02 |
| | 120.08 Hz | −1.082 | −1.083 | 0.00 |

Box tuning matches exactly in both cases (45.897 and 38.671 Hz, and 17.49 Hz
PR resonance with 50 g added), so radiator mass and stiffness are modelled the
same way. The remaining difference is **damping near the tuning frequency**:
WinISD shows less loss there than the standard lumped loss model used here
(the same model that matches WinISD's ported and sealed boxes to 0.01 dB).
We tested moving the loss reference frequencies, scaling the radiator's Qms and
removing individual losses; none reproduces both WinISD boxes, so WinISD
evidently treats passive-radiator losses differently internally. In practice
real box leakage varies far more than this (Ql 5–20 is typical), so both
results are within normal build-to-build variation.

## Reproduce

```bash
pnpm test   # runs these comparisons with all other engine tests
```

To add a case: save a WinISD project, note three or four transfer-function
read-outs, add the `.wpr` to `packages/engine/test/fixtures/` and a test to
`winisd.test.ts`.
