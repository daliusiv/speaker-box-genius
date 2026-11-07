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
10-sub-straight-tl      12" subwoofer (Le 2.4 mH), straight TL
11-sub-mltl             12" subwoofer, MLTL with a port
12-sub-tapped-horn      12" subwoofer, tapped horn
13-fr-tqwt              4" full-range, TQWT
14-fr-tapered-tl        4" full-range, tapered TL
15-mltl-2-drivers       05 with two drivers in parallel (OD = 2P)

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

Impulse response: B1, B2 and 05, the chart window's Impulse Response, Export
(a 16-bit 48 kHz WAV, t = 0 at sample 10000; masking as Hornresp has it).

Maximum SPL: B1, B2, 05 and 06, Tools > Maximum SPL with 80 W and 5.5 mm (the
amplifier limits off), then File > Export; B2 again with the amplifier at 25 V.

More than one driver is written with its wiring: "2P" (parallel) or "2S"
(series). Hornresp reads a bare "2" as one driver.

The boxes' chambers are 5 cm deep (Lc), so Hornresp treats them as plain volumes.
B1-B3 and B7: Calculate, then File > Export in the chart window; for B2 and B3
also Tools > Output > Horn (the cone's front) and the port's or radiator's
output, each exported on its own. B4-B6: Wizard, then export Power, Impedance and
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
