Speaker Box Genius - Hornresp validation records
================================================

Driver in records 01-09: Dayton DSA215-8 (fs 35 Hz, Qms 1.87, Qes 0.40,
Vas 37.4 L, Re 5.9 ohm, Sd 211.2 cm2, Le 1.0 mH); 10-14 have their own drivers.
All at 2.83 V, half space (2 x Pi), 1 m.

01-straight-tl          Straight TL, driver at the closed end
02-tapered-tl           Tapered TL (Par), wide closed end
03-offset-tl            Offset-driver TL, driver at L/3
04-tqwt                 TQWT (Con), narrow closed end
05-mltl                 Mass-loaded line with a port at the mouth
06-tapped-horn          Tapped horn
07-front-horn           Front-loaded exponential horn with rear and throat chambers
08-straight-tl-stuffed  01 with stuffing (Fr) through the whole line
09-offset-tl-stuffed    03 with stuffing behind the driver
08L / 08D               08 with light (Fr 150) and dense (Fr 2000) stuffing
                        (stuffing only in Tools > Loudspeaker Wizard: export
                        Power, Impedance and Displacement; tests S1-S4;
                        09 is S5)
10-sub-straight-tl      12" subwoofer (Le 2.4 mH), straight TL
11-sub-mltl             12" subwoofer, MLTL with a port
12-sub-tapped-horn      12" subwoofer, tapped horn
13-fr-tqwt              4" full-range, TQWT
14-fr-tapered-tl        4" full-range, tapered TL
15-mltl-2-drivers       05 with two drivers in parallel (OD = 2P)
17-front-horn-small-chambers  07 with an 8 L rear and a 3 L throat chamber
18-front-horn-no-throat 07 with no throat chamber
19-sub-front-horn       12" subwoofer, Con + Exp front horn, 40 L rear, 2 L throat

Boxes (DSA215-8; Hornresp 60.60):

B1-sealed               10.4 L sealed
B2-ported               30 L, 7 cm port 15 cm long
B3-passive-radiator     50 L with a Dayton DSA270-PR
B4-bandpass-4th         12 L sealed rear, 15 L front with a 7 cm port   (Wizard)
B5-bandpass-6th-parallel  20 L rear (6 cm port), 15 L front (7 cm port),
                        both to the outside                            (Wizard)
B6-bandpass-6th-series  the same, rear port into the front chamber     (Wizard)
B7-ported-2-drivers     B2 with two drivers in parallel (Nd = 2P, S1 = S2 = 2 Sd)

B8a / B8b               B1 with the semi-inductance model on (double-click Le, enter
                        the values, On): Re' 5.9 Ω; Leb 0.30 / 1.36 mH, Le 1.00 /
                        3.16 mH, Ke 0.05 / 0.21 sH, Rss 30 / 30.6 Ω

B8c                     B8a with Re' = 6.50 (Re stays 5.90)
B9 / 16                 B1 and 05 with Tools > Power Compression at 120 °C
B10                     B1 with Rg = 0.50 (edit and Calculate)
B11-sealed-2P / -2S     B1 with two drivers, parallel and series (import these:
                        counts typed into the editor didn't simulate both cones)

B17 (parallel / series) B1, Calculate, then Tools > Multiple Speakers: 2 in parallel
                        (load 2.95 ohms), or 2 in series (11.80 ohms); OK, then
                        File > Export in the chart window

B13a / B13b             B1 with the FDD model (double-click the Cms label, On):
                        Rms 2.00 / Ams 3.00E-04, and Rms 8.00 / Ams 1.00E-03

B14-bandpass-4th-pr     B4 with a DSA270-PR in place of the front port (Edit,
                        double-click the Ap1 label: it reads PR)       (Wizard)

B12 (bw2 / bw3 / lr4)   B2 with Tools > Filter Wizard (Active): high pass 25 Hz,
                        order 2, 3 (Butterworth) and 4 (Linkwitz-Riley), On,
                        then File > Export in the chart window

B15 (peak / lowshelf /   B2 with Tools > Filter Wizard, Equaliser (click the band's
  highshelf)            type label to change it): Peak EQ 40 Hz Q 2.00 -6 dB; Low Shelf
                        30 Hz Q 0.71 +6 dB; High Shelf 150 Hz Q 0.71 -6 dB. On, then
                        File > Export in the chart window

Impulse response: B1, B2 and 05, the chart window's Impulse Response, Export
(a 16-bit 48 kHz WAV, t = 0 at sample 10000; masking as Hornresp has it).

Maximum SPL: B1, B2, 05 and 06, Tools > Maximum SPL with 80 W and 5.5 mm (the
amplifier limits off), then File > Export; B2 again with the amplifier at 25 V.

More than one driver is written with its wiring: "2P" (parallel) or "2S"
(series). Hornresp reads a bare "2" as one driver.

The boxes' chambers are 5 cm deep (Lc), so Hornresp treats them as plain volumes.
B1-B3 and B7: Calculate, then File > Export in the chart window; for B2 and B3
also Tools > Output > Horn (the cone's front) and the port's or radiator's
output, each exported on its own. B4-B6 and B14: Wizard, then export Power, Impedance and
Displacement one by one.

For each record:
  1. Input Parameters window: File > Import, choose the .txt
     (older versions: copy the .txt files into the Hornresp "Import" folder first).
     Check the Comment shows the record's name.
  2. Calculate.
  3. In the chart window that opens (not the Input Parameters window):
     File > Export, save as  01-straight-tl.txt  (its first line starts
     "Freq (hertz)": one table with SPL, impedance, excursion, Za, group delay...).
  4. Tools > Combined Response, leave the entry blank, OK; then File > Export
     again, saved as  01-straight-tl-mouth.txt  (the port's or mouth's output
     alone; skip for 07).

Send back all the files (a zip is fine).

If Import refuses a file: tell me the exact message, and please export any record
from your Hornresp (File > Export > Hornresp Record) and send that too, so the
layout can be matched to your version.

The .json files are the same designs in Speaker Box Genius' own format; Hornresp
doesn't need them.

Re-run on Hornresp 60.70 (10 Nov 2026)
======================================

Every earlier export came out identical. File names in the Export dialog are
limited to 16 characters.

Records with the coil models already on (import, Calculate, export; no
double-clicking): B8a / B8b / B8c-sealed-semi-*, B13a / B13b-sealed-fdd-*
("Semi-Inductance Model Flag = 1", "Damping Model Flag = 1") and B10-sealed-rg.
The filter and EQ fields of a record are NOT applied on import: B12 and B15
still need Tools > Filter Wizard.

More lines and horns (make-records.ts):
20-exp-tl, 21-multi-seg-tl, 22-offset-l5, 23-offset-tapered,
24-sub-mltl-tapered, 25-mltl-big-port (also Output > Horn, and Particle
Velocity > Horn Mouth read with the cursor), 26-tapped-con,
27-sub-tapped-2seg, 28-fr-front-horn, 29-sub-front-par, 30-tl-2p, 32-sub-tqwt.

More boxes (Calculate, Yes to masking, File > Export in the Acoustical Power
window; for ported and PR boxes also Tools > Output > Port / Passive Radiator):
N1-sealed-full-space, N2-ported-full-space (Ang = 4 x Pi)
N3-sealed-quarter-space (Ang = 1 x Pi; the app has no quarter space yet)
N4-pr-dual (two DSA270-PR as one radiator of 706 cm2)
N5-pr-added-mass (+30 g), N6-pr-lossy (Rmp x5), N7-pr-small-box (20 L)
N8-sub-sealed, N9-sub-ported (also Particle Velocity > Port Outlet)
N10-fr-ported, N11-ported-all-coil-models (Rg 0.8 + semi B8b + FDD B13b)
N12-pr-semi, N13-sealed-2p-rg, N14-ported-2s, N15-fr-sealed

Maximum SPL with the amplifier's current limit: B13b, Tools > Maximum SPL,
double-click the current limit's Off to turn it On, 2 A (Hornresp rounds the
field to whole amps), OK, export as hornresp-maxspl-2a.txt.

Air speed: Tools > Particle Velocity (Horn Mouth or Port Outlet) can't be
exported; click the chart and read Freq / Velocity under it (the arrow keys
step point by point). The readings are in each case's velocity.json.

Probe 33-sub-tapped-early-tap (27 with the tap at 120 cm, written as four
segments 30 / 90 / 30 / 150 cm by the old export), run 11 Nov 2026: it matches
the app's case 27 layout with the tap at 150 cm (0.03 dB, 0.07 % impedance),
not 120 cm (6.2 dB off). Hornresp takes the front tap where the last segment
starts; the export refuses a horn with more than one section after its tap.
