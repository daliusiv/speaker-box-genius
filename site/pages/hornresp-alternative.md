---
title: A free online Hornresp alternative for lines and horns
description: Design transmission lines, MLTLs, tapped horns and front-loaded horns in your browser, checked against Hornresp, with Hornresp import and export.
path: hornresp-alternative
image: chart:tl-example/za
order: 5
group: switching
---

# A free online Hornresp alternative for lines and horns

Hornresp is the standard free tool for simulating horns and transmission lines, and it's what this app is checked against. Speaker Box Genius models the everyday line and horn designs, in your browser on any computer or phone, next to sealed, ported and passive radiator boxes, and with your Hornresp records going both ways.

[[Open an example: three line types|tl-example]]

## What it models

- **Transmission lines:** straight, tapered (parallel, conical or exponential sections) and offset-driver lines, and TQWTs (Voigt pipes).
- **Mass-loaded lines (MLTLs):** a line with a port at the mouth, with the port sized for your power.
- **Tapped horns:** the driver's rear near the closed end and its front feeding the horn further along.
- **Front-loaded horns:** the driver at the throat, with a sealed rear chamber and a throat chamber.
- **Stuffing** per section, in kg/m³.

All of them sit on the same charts as any sealed, ported, passive radiator or bandpass box. So you can put a tapped horn next to a ported box for the same driver and see which gives more for the space.

![The line load (Za) chart for the three example lines: resistance solid, reactance dashed, as Hornresp shows it.](chart:tl-example/za)

## Checked against Hornresp

The line model is a one-dimensional duct, the same approach as Hornresp and Akabak. It's checked against **Hornresp 60.70** (and earlier 60.60 and 55.30, with identical results) with thirty-two line and horn records at 2.83 V in half space: seven line and horn types with a Dayton Audio DSA215-8, then the same with two drivers, a hot voice coil and front-horn chambers of other sizes (or none), six more with a 12″ subwoofer and a 4″ full-range driver, twelve more flares, segment mixes, driver positions and taps (cases 20–32), and three with the mouth further away than the cone (Hornresp's Acoustic Path Length, 34–36). Every frequency Hornresp exports from 10 Hz to 1 kHz is compared:

| Design | SPL, mean | Impedance, mean | Cone excursion, mean | Group delay, 95 % | Line load (Za), mean |
|---|---|---|---|---|---|
| 01 Straight transmission line | 0.03 dB | 0.14 % | 0.25 % | 0.06 ms | 0.00 dB |
| 02 Tapered transmission line | 0.04 dB | 0.14 % | 0.28 % | 0.22 ms | 0.02 dB |
| 03 Offset-driver transmission line | 0.02 dB | 0.13 % | 0.26 % | 0.09 ms | 0.00 dB |
| 04 TQWT | 0.03 dB | 0.14 % | 0.27 % | 0.22 ms | 0.02 dB |
| 05 Mass-loaded line | 0.03 dB | 0.16 % | 0.27 % | 0.07 ms | 0.01 dB |
| 06 Tapped horn | 0.03 dB | 0.08 % | 0.28 % | 0.10 ms | 0.01 dB |
| 07 Front-loaded horn | 0.03 dB | 0.18 % | 0.32 % | 0.13 ms | 0.07 dB |
| 10 Subwoofer in a straight line | 0.02 dB | 0.17 % | 0.23 % | 0.10 ms | 0.00 dB |
| 11 Subwoofer in a mass-loaded line | 0.03 dB | 0.18 % | 0.26 % | 0.19 ms | 0.01 dB |
| 12 Subwoofer in a tapped horn | 0.03 dB | 0.06 % | 0.26 % | 0.16 ms | 0.01 dB |
| 13 Full-range TQWT | 0.03 dB | 0.20 % | 0.34 % | 0.14 ms | 0.02 dB |
| 14 Full-range tapered line | 0.04 dB | 0.17 % | 0.35 % | 0.22 ms | 0.01 dB |
| 15 Mass-loaded line, two drivers | 0.03 dB | 0.21 % | 0.25 % | 0.05 ms | 0.01 dB |
| 16 Mass-loaded line, voice coil at 120 °C | 0.02 dB | 0.33 % | 0.20 % | 0.09 ms | 0.01 dB |
| 17 Front horn, 8 L rear and 3 L throat chamber | 0.03 dB | 0.21 % | 0.35 % | 0.13 ms | 0.07 dB |
| 18 Front horn, no throat chamber | 0.03 dB | 0.17 % | 0.30 % | 0.13 ms | 0.07 dB |
| 19 Subwoofer front horn, two segments | 0.03 dB | 0.18 % | 0.22 % | 0.12 ms | 0.04 dB |
| 20 Exponential line | 0.03 dB | 0.16 % | 0.25 % | 0.33 ms | 0.03 dB |
| 21 Three-segment line (Con + Par + Exp) | 0.04 dB | 0.19 % | 0.30 % | 0.34 ms | 0.05 dB |
| 22 Offset line, driver at a fifth | 0.02 dB | 0.13 % | 0.26 % | 0.12 ms | 0.00 dB |
| 23 Offset tapered line | 0.03 dB | 0.15 % | 0.27 % | 0.15 ms | 0.02 dB |
| 24 Subwoofer in a tapered mass-loaded line | 0.03 dB | 0.19 % | 0.26 % | 0.40 ms | 0.01 dB |
| 25 Mass-loaded line, wide short port | 0.03 dB | 0.12 % | 0.27 % | 0.07 ms | 0.01 dB |
| 26 Conical tapped horn | 0.05 dB | 0.09 % | 0.28 % | 0.11 ms | 0.02 dB |
| 27 Subwoofer tapped horn, two segments | 0.03 dB | 0.09 % | 0.29 % | 0.17 ms | 0.02 dB |
| 28 Full-range front horn | 0.03 dB | 0.20 % | 0.29 % | 0.10 ms | 0.09 dB |
| 29 Subwoofer front horn, Par + Exp | 0.03 dB | 0.16 % | 0.24 % | 0.13 ms | 0.04 dB |
| 30 Straight line, two drivers | 0.03 dB | 0.14 % | 0.24 % | 0.06 ms | 0.00 dB |
| 32 Subwoofer TQWT | 0.03 dB | 0.15 % | 0.25 % | 0.58 ms | 0.02 dB |
| 34 Straight line, mouth 50 cm away | 0.02 dB | 0.14 % | 0.25 % | 0.07 ms | 0.00 dB |
| 35 Straight line, mouth 100 cm away | 0.02 dB | 0.14 % | 0.25 % | 0.07 ms | 0.00 dB |
| 36 Mass-loaded line, port 50 cm away | 0.02 dB | 0.16 % | 0.27 % | 0.08 ms | 0.01 dB |

The line's resonances fall on the same frequencies as Hornresp's, and the only bigger SPL differences are at the bottom of deep nulls (the same frequency, a different depth); group delay is compared away from them. The port's output on its own matches too (within 0.05 dB in the mass-loaded lines), and with it the port's air speed, read off Hornresp's Particle Velocity chart at several frequencies for three lines and two ported boxes: within 1 % everywhere (5.0 m/s at 40 Hz for the DSA215, 4.5 m/s at 32 Hz for the subwoofer). Inside the line, the pressure and air speed at the driver and at the port's end match Hornresp's Sound Pressure and Particle Velocity charts, peak for peak. Each case runs as an automated test whenever the code changes. Stuffed lines match Hornresp's Loudspeaker Wizard within 0.07 dB and 0.3 % in impedance at light, medium and dense stuffing: the app uses the same fibre model (Wilson's). Hornresp sets stuffing by flow resistivity (Fr), the app by kg/m³ of polyester; 481.65 rayls/m is 8 kg/m³ in the app. Ordinary boxes are checked too (sealed, ported, passive radiator, one or two radiators with added mass or extra damping, 4th-order bandpass with a port or a passive radiator, 6th-order bandpass, two drivers in parallel or series, a 12″ subwoofer and a 4″ full-range): impedance and excursion within 0.6 % on average, SPL and the port's or radiator's own output within 0.25 dB. Every case, with both curves on one chart, is on the [validation page](/validation/#hornresp); the model is described in [the transmission line notes](https://github.com/daliusiv/speaker-box-genius/blob/main/docs/transmission-lines.md).

For like-for-like comparisons, set these in **Settings**: **Air** to **Hornresp defaults**, **SPL** to **From radiated power (like Hornresp)**, for ported and bandpass boxes, **Ports** to **Pipe, like Hornresp**, for bandpass boxes, **Leaked air** to **Lost (like Hornresp)**, for boxes with more than one driver, **Cone air load** to **Piston, like Hornresp**, and for the Max SPL chart, **Power rating vs** to **Real power (like Hornresp)** (Hornresp's maximum SPL is then matched within 0.03 dB). Then drive at **2.83 V** (the **V** switch on the Power bar above the charts).

## Your Hornresp records, both ways

Each line or horn design has a **Hornresp** section:

- **Export** writes a record in Hornresp's own layout (segments with their flares, the driver, chambers and stuffing) that Hornresp opens unchanged. The app also lists every value, in case your version of Hornresp needs typing in.
- **Import** reads a record from its `.txt` file, or pasted straight from a forum post. It can bring the record's driver in too.

Sealed, ported and passive radiator boxes go both ways too. **Save & Export → Hornresp record** writes each one the way Hornresp models a box: a horn too short to matter, with the box as its rear chamber and the port or passive radiator in it. A port's distance from the cone becomes the Acoustic Path Length. **Open** takes a Hornresp record (box or line) as a new design, brings in its driver, and sets Hornresp's conventions in Settings.

## What it adds

- **A driver database** of about 1,610 drivers, so you don't need to type parameters in, each with [its own page](/drivers/).
- **Line types side by side:** **Compare types** makes and tunes a classic TL, TQWT, offset TL, MLTL and front horn for your driver, and ranks them by bass extension, size and smoothness.
- **Tuning by simulation:** **Set line length** scales the whole line until it tunes where you ask; **Best line** searches the driver position and stuffing.
- **Inside the line:** the cone and mouth contributions on their own, and the pressure and air speed along the line at any frequency.
- **Folding and building:** a side view of the folded line and a cut list.
- **Live links:** share the whole design with a link that opens in any browser.

## What Hornresp still does better

Hornresp is a specialist's tool, developed over many years: more horn shapes and flare types (hyperbolic, tractrix, oblate spheroidal), more segments, chamber ports, other radiation angles, multiple drivers in many arrangements, and many more charts and tools. If you design horns for a living, keep it. Speaker Box Genius covers the designs most DIY builders make, and shows them next to ordinary boxes, so it's a quick place to start, compare and share.

[[Open the example|tl-example]]

> Speaker Box Genius isn't affiliated with Hornresp or its author, David McBean.
