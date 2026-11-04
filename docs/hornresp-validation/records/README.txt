Speaker Box Genius - Hornresp validation records
================================================

Driver in every record: Dayton DSA215-8 (fs 35 Hz, Qms 1.87, Qes 0.40, Vas 37.4 L,
Re 5.9 ohm, Sd 211.2 cm2, Le 1.0 mH), 2.83 V, half space (2 x Pi), 1 m.

01-straight-tl          Straight TL, driver at the closed end
02-tapered-tl           Tapered TL (Par), wide closed end
03-offset-tl            Offset-driver TL, driver at L/3
04-tqwt                 TQWT (Con), narrow closed end
05-mltl                 Mass-loaded line with a port at the mouth
06-tapped-horn          Tapped horn
07-front-horn           Front-loaded exponential horn with rear and throat chambers
08-straight-tl-stuffed  01 with stuffing (Fr) through the whole line
09-offset-tl-stuffed    03 with stuffing behind the driver

For each record:
  1. Input Parameters window: File > Import, choose the .txt
     (older versions: copy the .txt files into the Hornresp "Import" folder first).
  2. Calculate.
  3. SPL response window: File > Export > SPL + Phase...  save as  01-straight-tl.frd
  4. Open the electrical impedance chart, then File > Export  save as  01-straight-tl.zma
  (Same names for the other records, with their own numbers.)

Send back all the .frd and .zma files (a zip is fine).

If Import refuses a file: tell me the exact message, and please export any record
from your Hornresp (File > Export > Hornresp Record) and send that too, so the
layout can be matched to your version.

The .json files are the same designs in Speaker Box Genius' own format; Hornresp
doesn't need them.
