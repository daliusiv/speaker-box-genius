# Open baffle: boundary-element reference curves

On-axis response of a driver on a flat, thin, rigid open baffle, from a boundary-element (BEM)
solve. These curves are the reference for the open-baffle model in `src/openBaffle.ts`; they are
not used by the app at run time.

## Files

| File | What |
|---|---|
| `curves/<board>.csv` | `f_Hz, dB_re_monopole, phase_deg`, one row per frequency |
| `boards.json` | Board geometry and mesh settings per curve (metres) |
| `screen.py` | Mesh (gmsh) and solve (bempp-cl) |
| `sweep.py` | Solve one board over a frequency list, write its CSV and `boards.json` entry |
| `data.py` | Load the curves |
| `ob_models.py` | Candidate models: the engine's current model, v1, v2, v3 |
| `score.py` | Score v2/v3 against every board (`--sens`: v3 sensitivity) |
| `cmp.py` | The engine's current model and Hornresp's path rule against BEM |
| `fit.py` | Least-squares fit of v1's two constants |
| `rect_bass.py` | Low-frequency path D of a rectangular board without BEM (spectral Galerkin), checked against every curve |
| `btm.py` | Full on-axis response from edge diffraction (edge sources, all orders), checked against every curve |

## Boards

| Curve | Board W × H (cm) | Cone centre from left, bottom (cm) | Cone radius (cm) | Frequencies |
|---|---|---|---|---|
| B1 | 45 × 45 | 22.5, 22.5 | 1 | 20–1200 Hz, 22 points |
| B2 | 45 × 100 | 22.5, 35 | 1 | 20–1200 Hz, 22 points |
| B3 | 30 × 45 | 10, 30 | 1 | 20–1200 Hz, 22 points |
| B4 | 60 × 60 | 30, 30 | 1 | 20–1200 Hz, 22 points |
| B5 | 45 × 45 | 22.5, 22.5 | 12.35 | 20–1200 Hz, 22 points |
| N1 | 45 × 45 | 22.5, 22.5 | 2 | 250–900 Hz, 14 points |
| N2 | 30 × 90 | 15, 30 | 2 | 30–1200 Hz, 26 points |
| N3 | 60 × 60 | 15, 20 | 2 | 30–1200 Hz, 26 points |
| N4 | 25 × 25 | 12.5, 12.5 | 2 | 30–1500 Hz, 26 points |
| T120 | 30 × 120 | 15, 40 | 2 | 20–900 Hz, 1/24 octave (132 points) |

N2–N4 and T120 were never used to fit any model constant.

## Method

- **Geometry.** A zero-thickness rigid board in the z = 0 plane, meshed with gmsh (OpenCASCADE).
  The cone is a disc patch embedded in the board.
- **Mesh.** Triangles up to 3 cm (h), refined to 1 cm (he) along the outer edge where the pressure
  jump has its square-root edge behaviour, and to a third of the cone radius at the cone.
  At 1.2 kHz that is about 10 elements per wavelength.
- **Formulation.** The unknown is the pressure jump μ across the board (a double-layer
  potential). The normal velocity is continuous through a thin screen, so μ solves the
  hypersingular equation W μ = −∂p/∂n, with ∂p/∂n = jωρ·v on the cone and 0 elsewhere.
  μ is in continuous piecewise-linear functions that are zero on the board edge (bempp-cl
  `P1`); the right-hand side is piecewise constant. Solved by dense LU per frequency.
  A thin screen has no interior resonances, so no Burton–Miller coupling is needed.
- **Field point.** On the cone axis, 100 m in front of the board.
- **Normalisation.** Each value is the pressure divided by that of a free-field monopole with
  the same volume velocity (cone area × velocity), at the same distance, with the propagation
  delay e^{−jkR} removed. 0 dB is a point source in free space; a cone in an infinite wall
  would read +6.02 dB. The phase is in the e^{+jωt} convention: at low frequency the dipole
  reads +90° (pressure ∝ jkD).
- **Air.** c = 343.2 m/s, ρ = 1.204 kg/m³.

## Checks

- **Solver.** A pulsating sphere (ka 0.9–5.5) reproduces the exact surface pressure within
  0.5 % and the exact far field.
- **Thin disc, exact theory.** A point source at the centre of a thin rigid disc of radius a
  has a low-frequency dipole path of exactly 4a/π (the potential jump of the disc in uniform
  flow, by reciprocity). For a 45 cm disc, BEM gives 28.52 cm (h 3 cm, edge 1 cm) and 28.58 cm
  (h 2 cm, edge 0.5 cm) against 28.65 cm.
- **Mesh convergence, 30 × 120 board** (2191 unknowns at h 3 cm / edge 1 cm, 5326 at h 2 cm /
  edge 0.5 cm):

  | f (Hz) | h 3 cm | h 2 cm | Difference |
  |---|---|---|---|
  | 20 | −19.561 dB, 88.43° | −19.535 dB, 88.43° | 0.03 dB |
  | 570 (peak) | +11.771 dB, 23.48° | +11.770 dB, 23.20° | 0.00 dB, 0.3° |
  | 879 | +8.424 dB, −5.08° | +8.399 dB, −5.09° | 0.02 dB |

- **Repeatability.** Re-solving the first nine boards to add phase reproduced their earlier
  levels exactly.

## Low-frequency path without BEM (`rect_bass.py`)

By reciprocity the low-frequency dipole path D at the driver equals the potential jump across
the board when the whole board moves normal to itself at unit velocity (for a thin disc, 4a/π).
`rect_bass.py` solves that Laplace problem for the rectangle directly: spectral Galerkin with
edge-singular Chebyshev products √(1−X²)√(1−Y²)·U₂ₘ(X)U₂ₙ(Y), closed-form Fourier transforms
(Bessel J), operator |k|/2 in Fourier space, jump averaged over the cone. Nothing is fitted.

- **Convergence (45 × 45, centre jump / W).** Modes: 0.69909 (4), 0.69904 (6). Radial cut-off
  qmax 400 / 800 / 1600: 0.69909 / 0.69943 / 0.69959 (error ∝ 1/qmax), limit ≈ 0.6997.
  Odd mode counts converge to the same limit from above. The script extrapolates over qmax
  400 → 800.
- **Against BEM** (D from each curve's lowest frequency):

  | Curve | BEM D (cm) | Galerkin D (cm) | Difference |
  |---|---|---|---|
  | B1 | 31.43 | 31.48 | +0.16 % |
  | B2 | 40.15 | 40.12 | −0.08 % |
  | B3 | 22.43 | 22.54 | +0.50 % |
  | B4 | 42.03 | 41.98 | −0.13 % |
  | B5 | 29.35 | 29.41 | +0.20 % |
  | N2 | 27.94 | 27.95 | +0.05 % |
  | N3 | 35.53 | 35.38 | −0.41 % |
  | N4 | 17.30 | 17.40 | +0.58 % |
  | T120 | 28.74 | 28.82 | +0.30 % |

  All within 0.6 % (≤ 0.05 dB). The BEM itself reads 0.2–0.5 % low on the exact thin-disc
  case, so part of the difference is the BEM's.
- **Speed.** About 6 s per board in Python (two solves for the extrapolation); an engine port
  needs a faster radial integral (asymptotic tail) or a precomputed table over aspect ratio
  and driver position.

## Full response from edge diffraction (`btm.py`)

Biot-Tolstoy-Medwin edge sources for a thin screen (wedge index 1/2), driver as a point source on the
front face (+U) and rear face (-U), receiver on the front axis at infinity:

- Direct sound: 2 (front half-space), rear blocked.
- Order n: `F_n = 2 (-1/2pi)^n * integral b_1 ... b_n exp(-jk L) / (m d_12 ... d_n-1,n)` over the perimeter,
  with `b = 1/cosh(eta/2)` at each edge-to-edge hop along the face and `b = sqrt(r(d+r))/d` at the last edge.
- Each face-grazing hop carries the usual factor 1/2. The front- and rear-face paths and the
  front and rear sources all add with the same sign, which cancels it and leaves the leading 2.
- Orders are summed until a term is below 1e-6 (about 20 orders). The series alternates
  (B1 statics: 2 - 2.91 + 1.41 - 0.77 ...), so first- or second-order truncation is badly wrong at
  low frequency, but the full sum goes to zero at DC and gives the right path D.
- Nodes: graded Gauss points along each edge, one per 5 cm (`h=0.05`). This is within 0.03 dB of
  a 30-point-per-edge solve up to 1200 Hz.

Finite cone: the source terms are averaged over the cone face (flat disc of radius `a` from boards.json,
area-uniform Gauss rule, 6 radii x 16 angles; 4 x 12 is already within 0.001 dB). The direct term
stays 2 on axis.

Nothing is fitted. Against BEM, 20-900 Hz, `python btm.py`:

| Board | D (cm) | rms dB | max dB | max phase ° | peak level error dB |
|---|---|---|---|---|---|
| B1 | 31.45 | 0.03 | 0.05 | 0.9 | -0.01 |
| B2 | 40.12 | 0.04 | 0.06 | 1.6 | +0.03 |
| B3 | 22.57 | 0.08 | 0.10 | 1.0 | +0.03 |
| B4 | 41.96 | 0.03 | 0.05 | 1.4 | +0.01 |
| B5 | 29.39 | 0.04 | 0.06 | 0.9 | -0.01 |
| N1 | 31.41 | 0.03 | 0.05 | 0.4 | -0.01 |
| N2 | 27.95 | 0.06 | 0.08 | 1.0 | +0.01 |
| N3 | 35.37 | 0.04 | 0.06 | 0.9 | +0.03 |
| N4 | 17.35 | 0.06 | 0.09 | 5.3 | -0.01 |
| T120 | 28.83 | 0.06 | 0.08 | 1.7 | +0.00 |

Peak frequencies match within the BEM grid on every board. D agrees with `rect_bass.py` within 0.6 %.
Treating the 247 mm cone (B5) as a point gave +1.1 dB at the peak; the cone average fixes it.

Cost: about N^3 operations per order per frequency, with N about 50 nodes, so 1-7 ms per frequency
in numpy. The edge-to-edge kernel does not depend on frequency and is built once per board.

## Running

```
pip install bempp-cl gmsh meshio scipy numpy
python3 sweep.py T120 0.30 1.20 0.15 0.40 0.02 --f0 20 --f1 900 --ppo 24
python3 score.py
python3 score.py --sens
```

The 30 × 120 board takes about an hour on two cores (bempp-cl with numba, one thread per
process, frequencies split across two processes).

## Frames (`frames/`)

Mouth flows of four open-baffle frames, from `frames/frame.py` (bempp-style Galerkin of zero-thickness
rigid screens: walls and board, cone = a centred disc patch; run with `frames/fsweep.py`). `frames.json`
holds the geometry (F1–F3 H-frames, F4 a U-frame); `frames/<ID>-mouths.csv` the volume velocity out of
each mouth per unit cone volume velocity (outward, e^{+jωt}). `open-baffle-frame-bem.test.ts` checks the
engine's duct model against them below the first cross-mode (0.9·c/W).

## Thick boards and frames (`btm_thick.py`)

`btm.py` extended to a closed rigid slab (twelve 90° edges, wedge index ⅔; every edge-to-edge hop
along the face the two edges share). Against boundary-element runs of nine thick boards (30, 45 and
60 cm squares; 18, 25 and 40 mm) it is within 0.04 dB rms to 900 Hz, nothing fitted. The engine's
`slabDiffraction.ts` is its port, used for H/U frames (the frame's outline × its depth, each mouth
spread over its face); `frames/slab-python.json` holds this script's values for the parity test.
The thick-board BEM curves and the run scripts are on the `ob-bem-data` branch.

`frames/frame_thick.py` (with `thick.py` on the `ob-bem-data` branch) solves the same frames with 18 mm
walls and board as one rigid solid; `frames/FT1.csv` (H), `frames/FT4.csv` (U) and `frames/FT5.csv` (U, 45 × 100 × 30 cm, cone 35 cm up) are its curves.

