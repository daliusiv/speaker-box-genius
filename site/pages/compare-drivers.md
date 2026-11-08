---
title: How to compare two drivers for the same box
description: Put two woofers in the same boxes, on the same charts, to see which suits your build, with a worked comparison of two 10-inch subwoofers.
path: guides/compare-drivers
image: compare-spl.png
order: 9
group: start
---

# How to compare two drivers for the same box

Choosing between two woofers from their datasheets is guesswork: the numbers that matter depend on the box you'll put them in. Simulate both in the same boxes, at the same power, and the answer is usually obvious. Here's how, with two 10″ subwoofers from the same family.

[[Open the worked example|compare-example]]

## The worked example

The **Dayton Audio RSS265HF-4** and **RSS265HO-4** look almost the same: same size, same Xmax (12.3 mm). The "HO" (high output) model has a much stronger motor and a heavier cone, and handles 600 W against the HF's 350 W.

| | RSS265HF-4 | RSS265HO-4 |
|---|---|---|
| Fs | 25.6 Hz | 26.9 Hz |
| Qts | 0.45 | 0.35 |
| Vas | 54 L | 29.4 L |
| Moving mass | 120 g | 201 g |
| Power handling | 350 W | 600 W |

In a **30 L sealed box** and a **40 L ported box** tuned to 30 Hz, at 150 W:

| | HF, sealed | HO, sealed | HF, ported | HO, ported |
|---|---|---|---|---|
| F3 | **42.6 Hz** | 55.4 Hz | 28.5 Hz | **26.6 Hz** |
| Qtc | 0.76 | 0.50 | | |
| Output at 60 Hz | **105.7 dB** | 103.0 dB | 108.1 dB | 105.5 dB |
| Max SPL at 30 Hz | 100.4 dB | 100.2 dB | 108.2 dB | **110.3 dB** |

![The two drivers in the same boxes: the HF solid, the HO dashed. In the sealed box (blue) the HF goes deeper; in the ported box (orange) the HO does.](img/compare-spl.png)

**In the sealed box, the HF wins clearly.** Its higher Qts suits a small sealed box: F3 42.6 Hz against the HO's 55.4 Hz, where the HO's strong motor overdamps it (Qtc 0.50).

**In the ported box, the HO wins.** Its low Qts suits a port: it goes a little deeper and, with its extra power handling, plays 2 dB louder at 30 Hz.

**The HF is more sensitive:** about 2.5 dB louder at 60 Hz for the same power, because its cone is lighter. To beat it, the HO needs its extra watts.

So the "better" driver depends on the box you can build: a small sealed sub wants the HF; a bigger ported sub with a big amplifier wants the HO.

## Doing it in the app

Shortlisting? Each driver's [page](/drivers/) shows its suggested boxes, so you can narrow the list before comparing.

1. Pick the first driver on the **Driver** tab, and add the boxes you're considering on the **Boxes** tab.
2. Next to **Compare**, pick the second driver. It appears in every box as a dashed curve, in the same colour, on every chart.
3. Read the summary: each box shows a "vs" row for the second driver, with its F3 and whether it goes over a limit.
4. Press **Swap** (⇅) to make the second driver the main one, for example to size the boxes for it with a preset, then swap back.

The comparison driver uses the same number of drivers, wiring and settings as the main one, so the comparison is like for like.

[[Open the worked example|compare-example]]

## What to look at

- **Response** in the boxes you can actually build, not just F3 on paper.
- **Max SPL**: which driver plays louder in the bottom octave, and what stops it (Xmax, port speed or power handling). For one driver against two smaller ones, see [one 15″ or two 10″](/guides/one-15-vs-two-10s/).
- **The amplifier each one needs**: switch the Max SPL chart to **Volts** or **Amps**. Here, to use its full 600 W rating the HO needs up to **46 V** from the amplifier, where the HF needs 35 V: a bigger amplifier, not just a bigger number on the box.
- **Cone excursion** at your amplifier's power: a driver with less Xmax may be fine in a sealed box and in trouble in a ported one.
- **Impedance**, if you're matching an amplifier or wiring several drivers.

> Datasheet values vary from sample to sample, often by 10–20 %. Differences of a dB or two between similar drivers are within that spread; big differences in F3, excursion or output are real.
