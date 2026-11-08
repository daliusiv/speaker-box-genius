---
title: "Sealed, ported or passive radiator: which box for your driver?"
description: How to choose a box type from the driver's T/S parameters, and what each one gives you in size, bass extension and output, with a worked 10-inch subwoofer example.
path: guides/sealed-vs-ported
image: box-types-spl.png
order: 6
---

# Sealed, ported or passive radiator: which box for your driver?

The same woofer can go in a small sealed box, a big ported box or a passive radiator box, and each sounds different. The driver's own parameters tell you which suits it best. Here's how to read them, and what you gain and lose with each box.

[[Open the worked example|box-types-example]]

## The three boxes in one line each

- **Sealed:** the smallest box, a gentle roll-off, tight and predictable. The least deep bass for its size and the least output at the bottom.
- **Ported:** a tuned port adds output around the tuning frequency. Deeper and louder, but a bigger box, a steeper roll-off, and a port to fit (and keep quiet).
- **Passive radiator:** the ported box's job done by an unpowered cone instead of a port. No port noise and no long tube, but it costs more and rolls off faster still.

## What the driver says: Qts and EBP

Two numbers from the datasheet point the way:

- **Qts**, the driver's total Q. Low Qts (under about 0.4) suits a ported box; high Qts (over about 0.6) suits a sealed box, or even an open baffle. In between, either works.
- **EBP**, the "efficiency bandwidth product": Fs divided by Qes. Under about 50 points to sealed, over about 90 to ported, and in between either.

| Driver | Qts | EBP | Suits |
|---|---|---|---|
| Dayton Audio RSS210HF-4 (8″) | 0.57 | 43 | Sealed |
| Dayton Audio RSS265HF-4 (10″) | 0.45 | 48 | Either |
| Dayton Audio DSA215-8 (8″) | 0.33 | 88 | Ported |

These are rules of thumb, not laws: the simulation is what decides. But they tell you where to start.

## The worked example

The **Dayton Audio RSS265HF-4**, a 10″ subwoofer that suits either box, at **130 W** behind a 24 dB/oct high-pass filter at 18 Hz. Each box is sized by the app's presets:

| | Sealed (Qtc 0.707) | Ported (flat alignment) | Passive radiators |
|---|---|---|---|
| Box | 37 L | 83 L, tuned to 22 Hz | 83 L, 2 × RSS265-PR + 186 g each |
| F3 | 42.0 Hz | 21.3 Hz | 24.9 Hz |
| Max SPL at 25 Hz | 97.4 dB | 109.0 dB | 105.4 dB |
| Max SPL at 40 Hz | 105.4 dB | 108.6 dB | 107.4 dB |
| Amplifier for max SPL at 25 Hz | 25 V, 3.8 A | 34 V, 6.5 A | 28 V, 4.5 A |
| Also needs | | A 6 × 30 cm slot, 123 cm long | Two 10″ radiators |

![Response of the three boxes: the sealed box (blue) rolls off from about 40 Hz; the ported (orange) and PR (green) boxes keep going to the low 20s.](img/box-types-spl.png)

The ported box goes a full octave deeper (21 Hz against 42 Hz) and plays almost **12 dB louder at 25 Hz** than the sealed box, but it's more than twice the size, and its port is so long it has to be folded inside. The passive radiator box gets most of the way there without a port, for the price of two radiators. The sealed box is the one that fits under a desk.

## How to choose

- **Short of space?** Sealed. A sealed box also suits a car (cabin gain lifts its low end) and EQ such as a Linkwitz Transform, because it doesn't unload below a tuning.
- **Want the most output for your watts?** Ported, if the box and the port fit.
- **Ported is right, but the port won't fit or would chuff?** A passive radiator.
- **Tight, well-damped bass?** Sealed, at Qtc 0.5–0.7; or ported tuned a little low.

## Doing it in the app

1. Pick your driver from the database (or type its parameters in).
2. On the Boxes tab, add a sealed, a ported and a passive radiator design.
3. Press a preset in each (**Qtc 0.707**, and **QB3**, **B4** or **Keele**, whichever suits the driver) to size them. The ported and PR cards also offer the other families that suit the driver (**SC4** or **C4**, **SBB4** or **BB4**, **SQB3**): hover one to see its box, tuning and shape.
4. Compare the **response**, **Max SPL** and **excursion** charts at the power you'll use, with a high-pass filter. Switch Max SPL to **Volts** or **Amps** to see the amplifier each box needs.

[[Open the worked example|box-types-example]]

For the details of each, see [the passive radiator guide](/guides/passive-radiator-box/) and [the port guide](/guides/port-chuffing/).
