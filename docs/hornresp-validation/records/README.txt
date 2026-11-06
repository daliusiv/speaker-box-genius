Speaker Box Genius - Hornresp validation records
================================================

Driver in records 01-09 and 15: Dayton DSA215-8 (fs 35 Hz, Qms 1.87, Qes 0.40,
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
15-mltl-2-drivers       05 with two DSA215s

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
