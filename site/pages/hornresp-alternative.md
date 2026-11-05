---
title: A free online Hornresp alternative for lines and horns
description: Design transmission lines, MLTLs, tapped horns and front-loaded horns in your browser, checked against Hornresp, with Hornresp import and export.
path: hornresp-alternative
image: tl-za.png
order: 5
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

![The line load (Za) chart for the three example lines: resistance solid, reactance dashed, as Hornresp shows it.](img/tl-za.png)

## Checked against Hornresp

The line model is a one-dimensional duct, the same approach as Hornresp and Akabak. It was checked against **Hornresp 55.30** with seven records, all for the same Dayton Audio DSA215-8 driver at 2.83 V, in half space:

| Design | SPL, mean difference (10 Hz–1 kHz) | Impedance, mean difference |
|---|---|---|
| Straight TL | 0.08 dB | 0.16 % |
| Tapered TL | 0.04 dB | 0.16 % |
| Offset-driver TL | 0.04 dB | 0.15 % |
| TQWT | 0.03 dB | 0.15 % |
| MLTL | 0.06 dB | 0.18 % |
| Tapped horn | 0.04 dB | 0.09 % |
| Front-loaded horn | 0.03 dB | 0.19 % |

The line's resonances fall on the same frequencies as Hornresp's, and the only bigger SPL differences are at the bottom of deep nulls (the same frequency, a different depth). Each case runs as an automated test whenever the code changes. Stuffed lines were checked against Hornresp's Loudspeaker Wizard charts: acoustic power within about 1 dB, and every impedance peak at the same frequency. The details are in [the transmission line notes](https://github.com/daliusiv/speaker-box-genius/blob/main/docs/transmission-lines.md).

For like-for-like comparisons, set these in **Settings**: **Air** to **Hornresp defaults**, and **Line/horn SPL** to **From radiated power (like Hornresp)**. Then drive at **2.83 V** (the **V** switch at the top).

## Your Hornresp records, both ways

Each line or horn design has a **Hornresp** section:

- **Export** writes a record in Hornresp's own layout (segments with their flares, the driver, chambers and stuffing) that Hornresp opens unchanged. The app also lists every value, in case your version of Hornresp needs typing in.
- **Import** reads a record from its `.txt` file, or pasted straight from a forum post. It can bring the record's driver in too.

## What it adds

- **A driver database** of about 1,360 drivers, so you don't need to type parameters in.
- **Line types side by side:** **Compare types** makes and tunes a classic TL, TQWT, offset TL, MLTL, tapped horn and front horn for your driver, and ranks them by bass extension, size and smoothness.
- **Tuning by simulation:** **Set line length** scales the whole line until it tunes where you ask; **Best line** searches the driver position and stuffing.
- **Inside the line:** the cone and mouth contributions on their own, and the pressure and air speed along the line at any frequency.
- **Folding and building:** a side view of the folded line and a cut list.
- **Live links:** share the whole design with a link that opens in any browser.

## What Hornresp still does better

Hornresp is a specialist's tool, developed over many years: more horn shapes and flare types (hyperbolic, tractrix, oblate spheroidal), more segments, chamber ports, other radiation angles, multiple drivers in many arrangements, and many more charts and tools. If you design horns for a living, keep it. Speaker Box Genius covers the designs most DIY builders make, and shows them next to ordinary boxes, so it's a quick place to start, compare and share.

[[Open the example|tl-example]]

> Speaker Box Genius isn't affiliated with Hornresp or its author, David McBean. Transmission lines and horns are marked beta in the app.
