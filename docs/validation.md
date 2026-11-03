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

## Ported at 100 W: every graph (Test 1)

Same ported project, 100.08 W (24.3 V), read from each WinISD graph's cursor.

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| SPL | 20.03 Hz | 82.822 dB | 82.789 dB | −0.033 dB |
| SPL | 40.13 Hz | 102.235 dB | 102.207 dB | −0.028 dB |
| SPL | 80.63 Hz | 107.808 dB | 107.778 dB | −0.030 dB |
| Cone excursion | 20.16 Hz | 20.311 mm | 20.236 mm | −0.37 % |
| Cone excursion | 60.32 Hz | 5.930 mm | 5.910 mm | −0.34 % |
| Port air velocity | 20.03 Hz | 8.616 m/s | 8.586 m/s | −0.35 % |
| Port air velocity | 35.14 Hz | 10.406 m/s | 10.370 m/s | −0.34 % |
| Impedance | 20.22 Hz | 28.769 Ω | 28.997 Ω | +0.79 % |
| Impedance | 42.29 Hz | 6.886 Ω | 6.896 Ω | +0.14 % |
| Impedance | 100.39 Hz | 11.729 Ω | 11.802 Ω | +0.62 % |
| Group delay | 30.67 Hz | 11.268 ms | 11.268 ms | 0 |
| Group delay | 60.32 Hz | 6.584 ms | 6.568 ms | −0.24 % |
| Maximum SPL (Xmax-limited) | 20.16 Hz | 71.664 dB | 71.673 dB | +0.009 dB |
| Maximum SPL (thermal-limited) | 40.13 Hz | 101.262 dB | 101.234 dB | −0.028 dB |
| Maximum power (Xmax-limited) | 19.79 Hz | 7.062 W | 7.114 W | +0.74 % |
| Maximum power (thermal-limited) | 40.25 Hz | 80 W | 80 W | 0 |

The shapes match; absolute level sits a uniform ~0.03 dB (0.35 %) below WinISD and
the impedance peaks are up to 0.8 % higher. Simulating from the Bl/Mms/Cms/Rms values
stored in the .wpr instead of deriving them from Fs/Qes/Qms/Vas made the agreement
worse, so WinISD derives them as we do. The remaining offset is far below anything
measurable and is locked in by a golden test.

## Ported + 2nd-order Butterworth high-pass at 25 Hz (Test 3)

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| Transfer function | 15.12 Hz | −43.222 dB | −43.237 dB | −0.015 dB |
| Transfer function | 25.41 Hz | −20.808 dB | −20.804 dB | +0.004 dB |
| Transfer function | 40.13 Hz | −6.326 dB | −6.324 dB | +0.002 dB |
| Cone excursion | 15.22 Hz | 8.894 mm | 8.864 mm | −0.34 % |
| Cone excursion | 20.22 Hz | 11.081 mm | 11.043 mm | −0.34 % |
| Cone excursion | 40.13 Hz | 1.959 mm | 1.951 mm | −0.43 % |
| Maximum SPL (Xmax-limited) | 19.60 Hz | 70.559 dB | 70.553 dB | −0.006 dB |

The filter is read from the project's `[Filters]` section on import.

## Ported with voice coil inductance simulated (Test 4)

WinISD's "Simulate voice coil inductance" on, Le = 1 mH.

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| Transfer function | 99.77 Hz | 0.243 dB | 0.240 dB | −0.003 dB |
| Transfer function | 201.71 Hz | 0.516 dB | 0.512 dB | −0.004 dB |
| Transfer function | 500 Hz | −0.390 dB | −0.376 dB | +0.014 dB |
| Impedance | 99.77 Hz | 11.452 Ω | 11.525 Ω | +0.6 % |
| Impedance | 199.85 Hz | 6.394 Ω | 6.404 Ω | +0.2 % |
| Impedance | 500 Hz | 6.303 Ω | 6.300 Ω | −0.05 % |

WinISD models Le as a plain series inductor, as we do. The setting is read from the
project's `VCInd` option on import.

## Two drivers in parallel (Test 5)

Same ported box with WinISD's "Num. of drivers" set to 2 (parallel), 100 W.

WinISD applies its Rg to **each driver separately**, as if every driver had its own
cable. Speaker Box Genius treats the amplifier resistance as shared, so two parallel
drivers each see twice the value. Importing a .wpr divides WinISD's Rg by the number of
drivers so the two agree. WinISD's impedance graph also shows a **single driver**;
ours shows what the amplifier sees, which is half that for two in parallel.

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| Transfer function | 20.09 Hz | −25.716 dB | −25.721 dB | −0.005 dB |
| Transfer function | 40.13 Hz | −10.897 dB | −10.895 dB | +0.002 dB |
| Transfer function | 80.38 Hz | −0.440 dB | −0.440 dB | 0 |
| Cone excursion | 19.91 Hz | 13.521 mm | 13.472 mm | −0.36 % |
| Port air velocity | 35.68 Hz | 8.554 m/s | 8.525 m/s | −0.34 % |
| Impedance, one driver | 19.91 Hz | 16.451 Ω | 16.562 Ω | +0.7 % |
| Impedance, one driver | 100.39 Hz | 18.553 Ω | 18.688 Ω | +0.7 % |

With a shared 0.1 Ω instead, the response differs from WinISD by up to 0.1 dB around
80 Hz.

## Ported with leakage Ql 7 (Test 6)

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| Transfer function | 19.91 Hz | −25.422 dB | −25.419 dB | +0.003 dB |
| Transfer function | 40.25 Hz | −6.154 dB | −6.154 dB | 0 |
| Transfer function | 80.38 Hz | −0.275 dB | −0.275 dB | 0 |
| Impedance | 20.03 Hz | 27.680 Ω | 27.896 Ω | +0.8 % |
| Impedance | 41.13 Hz | 7.193 Ω | 7.206 Ω | +0.2 % |
| Impedance | 100.70 Hz | 11.662 Ω | 11.733 Ω | +0.6 % |

Box losses (Ql, Qa, Qp) are now set in the app's Settings and read from imported
projects. With the default Ql 10 instead, the response would be 0.5 dB off at Fb.

## 4th-order bandpass (Test 7)

15 L closed rear chamber, 20 L front chamber tuned to 50 Hz with one 7.5 cm port, 100.1 W.
WinISD stores this as BType=2 and includes **leakage between the two chambers**
(`Qiclfr`, default Q 100). Without that leak our response was up to 0.21 dB high near
the tuning; with it:

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| Transfer function | 30.67 Hz | −9.702 dB | −9.695 dB | +0.007 dB |
| Transfer function | 49.65 Hz | −1.758 dB | −1.755 dB | +0.003 dB |
| Transfer function | 80.88 Hz | −7.529 dB | −7.522 dB | +0.007 dB |
| Transfer function | 120.45 Hz | −14.039 dB | −14.043 dB | −0.004 dB |
| Cone excursion | 30.39 Hz | 10.017 mm | 9.990 mm | −0.27 % |
| Front port air velocity | 49.81 Hz | 21.993 m/s | 21.922 m/s | −0.32 % |
| Impedance | 30.11 Hz | 11.046 Ω | 11.100 Ω | +0.5 % |
| Impedance | 60.50 Hz | 8.526 Ω | 8.554 Ω | +0.3 % |

WinISD's rear-chamber "Frc" (65.42 Hz) is the driver's resonance in the closed rear
chamber, which we report as Fc. The inter-chamber leak's reference (driver compliance
at Fs, or front-chamber compliance at Frc, which are almost equal for this box) is
being pinned down with the 6th-order projects.

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

### Excursion at 100 W (Test 2)

18 L + 50 g project, 100.1 W.

| Graph | Frequency | WinISD | Speaker Box Genius | Difference |
|---|---|---|---|---|
| PR excursion | 10 Hz | 13.445 mm | 13.379 mm | −0.5 % |
| PR excursion | 20.16 Hz | 12.134 mm | 12.077 mm | −0.5 % |
| PR excursion | 40.50 Hz | 9.274 mm | 9.106 mm | −1.8 % |
| Cone excursion | 20.03 Hz | 19.373 mm | 19.305 mm | −0.35 % |
| Cone excursion | 40.50 Hz | 4.646 mm | 4.654 mm | +0.2 % |
| Cone excursion, dip | 46.11 Hz (ours 46.15) | 2.183 mm | 2.301 mm | +5.4 % |
| Cone excursion, bump | 65.36 Hz (ours 65.32) | 5.695 mm | 5.636 mm | −1.0 % |

Away from the tuning the agreement matches the ported box (0.35–0.5 %). Close to Fb,
WinISD's lighter PR damping shows up again: a slightly deeper cone dip and a little more
PR travel. The dip and bump frequencies agree within 0.05 Hz.

## Reproduce

```bash
pnpm test   # runs these comparisons with all other engine tests
```

To add a case: save a WinISD project, note three or four transfer-function
read-outs, add the `.wpr` to `packages/engine/test/fixtures/` and a test to
`winisd.test.ts`.
