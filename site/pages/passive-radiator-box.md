---
title: How to design a passive radiator box
description: Box size, tuning, added mass and excursion, step by step, with a worked example you can open and change in your browser.
path: guides/passive-radiator-box
image: pr-spl.png
order: 2
group: ported
---

# How to design a passive radiator box

A passive radiator gives you the bass extension of a ported box without the port: no chuffing, no long tube to fit inside a small box. Here's how to size one, step by step, with a real driver.

[[Open the worked example|pr-example]]

## What a passive radiator does

A passive radiator (PR) is a speaker cone without a magnet or voice coil. Inside a sealed box, the air pushed by the woofer moves the PR, and the PR's mass bouncing on the springiness of the air in the box forms a resonance, just as the air in a port does. Tune that resonance (Fb) low and the box gives extra bass around it, like a ported box.

**Why use one instead of a port?**

- **No port noise.** A small port at high power makes air rush and "chuff". A PR has no moving air jet.
- **Small boxes.** A port tuned low in a small box can be longer than the box is deep. A PR only needs space on one face.
- **No midrange leaking out** of a port opening, and no port resonances.

**What it costs:**

- **A notch below the tuning.** At the PR's own resonance the woofer and PR cancel, so the response falls faster below Fb than a ported box's (and the excursion rises sharply below the notch, so use a high-pass filter).
- **More cone area to move.** The PR has to move a lot of air: as a rule it needs **about twice the woofer's displacement** (Sd × Xmax).
- **Price and size.** A good PR costs about as much as the woofer, and is often bigger.

## The worked example

The rest of this guide uses a **Dayton Audio DSA215-8**, an 8″ woofer (Fs 35 Hz, Qts 0.33, Vas 37.4 L, Xmax 5.5 mm), at **35 W** with a **30 Hz high-pass filter**. All the numbers below come from Speaker Box Genius; open the example to see the charts and change anything.

## Step 1: choose the box size and tuning

Start as if you were designing a ported box. A flat "textbook" alignment is a good first try: for this driver, **QB3** gives **16.2 L tuned to 39.8 Hz**.

In the app, the passive radiator design has a **QB3** button among its presets: it sets the box volume, the target tuning and the added mass for your driver and PR in one go. You can go bigger for deeper bass or smaller to save space; the charts show what you trade.

## Step 2: pick a passive radiator that can keep up

> **No driver yet?** The [design assistant](/guides/design-assistant/) tries the database's drivers in passive radiator boxes, with the same finder, and ranks them against sealed and ported boxes.

The PR has to move more air than the woofer, because near Fb most of the sound comes from the PR. Compare displacements, Sd × Xmax:

| | Sd | Xmax | Displacement |
|---|---|---|---|
| DSA215-8 woofer | 211 cm² | 5.5 mm | 116 cm³ |
| DS215-PR (one) | 211 cm² | 11 mm | 232 cm³ |

One DS215-PR has twice the woofer's displacement, which is about right. If a PR falls short, use two of them, or a bigger one if it fits on a face of the box.

Rather than checking every PR by hand, press **Find a PR for this driver…** in the passive radiator design. It tries every PR in the database (and, if you tick the box, woofers used as PRs) in groups of 1, 2 or 4, tunes each one to your target, and ranks them by bass extension and spare travel. For this box, three of the top results:

| PRs | Added mass | F3 | Travel used when the woofer reaches its Xmax |
|---|---|---|---|
| 1 × Dayton DSA270-PR (10″) | 113 g | 55.3 Hz | 47 % |
| 1 × Dayton DS215-PR (8″) | 17 g | 57.9 Hz | 73 % |
| 2 × SB Acoustics SB20PFC-00 (8″) | 73 g each | 55.1 Hz | 38 % |

The bigger the PR (or the more of them), the more travel it has to spare and the deeper the box goes, but the dearer it gets and the more room it takes on the box. The rest of this guide uses the single DS215-PR: the cheapest and smallest option that still keeps up.

## Step 3: tune it with added mass

A PR's tuning depends on its moving mass and the box volume. Out of the box, one DS215-PR in 16.2 L tunes to about 44.5 Hz. **Adding mass** to the cone lowers the tuning: **17 g** brings it down to the 39.8 Hz target. Most PRs come with a threaded bolt for adding washers.

Keep the added mass reasonable. Past about **1.5 times the PR's own moving mass**, the cone can sag and rock, and the finder flags it; past three times, it's ruled out. If the tuning needs more mass than that, use a PR with a heavier cone, or two PRs (two PRs in the same box need more mass each, because the box air is shared).

The app does the sums: type the target Fb and press **Set added mass**, or use **Best tuning…** for the added mass that gives the flattest response, the deepest bass or the smallest box.

![The worked example: the PR box (orange) next to a ported box of the same size (blue), both behind the 30 Hz high-pass filter. The PR box rolls off a little higher.](img/pr-spl.png)

## Step 4: check the excursion at your real power

This is where PR designs fail. Look at **both** excursion charts at the power you'll actually use:

- **Cone excursion** against the woofer's Xmax (5.5 mm).
- **PR excursion** against the PR's Xmax (11 mm).

At 35 W with the 30 Hz high-pass filter, the woofer peaks at **5.2 mm** and the PR at **7.6 mm**. Both are within their limits.

The PR chart also shades a band from **75 % of the PR's Xmax** up to it (8.25 mm here). A PR's suspension stiffens as it nears its limit, so its travel stops growing in step with the woofer's and its distortion rises; staying under the band leaves that headroom. 75 % is a rule of thumb, not a datasheet figure: change it, or turn it off, with **PR caution** in **Settings**. This design's 7.6 mm is 69 %, under the band.

![PR excursion at 35 W with the 30 Hz high-pass filter: 7.6 mm at most, against an Xmax of 11 mm (the red line).](img/pr-excursion.png)

Without the high-pass filter, the same 35 W pushes the woofer to 12 mm (more than twice its Xmax) down at 15 Hz, where the PR no longer holds it back. A PR box almost always needs a high-pass filter (a "subsonic" filter) just below the tuning.

The **Max SPL** chart puts it together: the loudest the box can play at each frequency, and whether the woofer, the PR or the amplifier's power is the limit there. Switch it to **Volts** or **Amps** to see what the amplifier must deliver to get there.

## Step 5: compare it with a port

It's worth putting a ported box of the same size next to the PR box, because the result often surprises people: **the port goes a little deeper** (F3 53.1 Hz against the PR box's 57.8 Hz). The catch is the port itself:

| Port diameter | Length for 39.8 Hz | Peak air speed at 35 W |
|---|---|---|
| 5 cm | 19 cm | 18.9 m/s: chuffs (over 17 m/s) |
| 6 cm | 29 cm | 13.1 m/s |
| 7 cm | 40 cm | 9.7 m/s |

A 16 L box is only about 25 cm deep, so the quiet 7 cm port doesn't fit without bending it round, and the 5 cm port that does fit chuffs. That's where the passive radiator earns its place: in a small box, at real power, it does the port's job without the noise. In the example, the ported box uses the 5 cm port; try 6 or 7 cm and watch the port speed fall and its length grow.

## Checklist

1. Start from a flat alignment (QB3) for your driver's box size and tuning.
2. Pick PRs with about twice the woofer's displacement (Sd × Xmax), that fit on a face of the box.
3. Tune with added mass, keeping it under about 1.5 times the PR's moving mass.
4. Check the cone and PR excursion at your real power, with a high-pass filter.
5. Compare with a ported box of the same size before you buy the PRs.

[[Open the worked example|pr-example]]

> All the numbers on this page are simulations, small-signal, in half space. Real drivers vary from their datasheets by 10–20 %, so measure your driver if you can: the app can fit its T/S parameters from an impedance sweep.
