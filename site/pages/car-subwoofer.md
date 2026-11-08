---
title: "Car subwoofer box design: sealed or ported?"
description: How a car's cabin gain changes subwoofer box design, why small sealed boxes work so well in cars, and when a ported box is worth its size, with a worked 10-inch example.
path: guides/car-subwoofer
image: car-spl.png
order: 8
group: start
---

# Car subwoofer box design: sealed or ported?

A subwoofer that sounds thin in a living room can shake a car. A car's cabin is small enough to boost the deep bass on its own, and that changes which box you should build. Here's how cabin gain works, and how to design for it.

[[Open the worked example|car-example]]

## What cabin gain does

Below the frequency whose half wavelength matches the cabin's longest dimension, a car stops behaving like a room and starts behaving like a pressure chamber: the sub pressurises the whole cabin, and the deeper the note, the bigger the boost, about **12 dB per octave** below that frequency. For a typical car about 2.5 m long, it starts around **70 Hz**, so by 35 Hz the cabin adds about 12 dB.

That's the same slope as a sealed box's roll-off. So in a car, a sealed box's falling bass and the cabin's rising boost cancel out, and the result is close to flat.

## The worked example

A **Dayton Audio RSS265HF-4** 10″ subwoofer at **200 W**, behind a 24 dB/oct high-pass filter at 24 Hz, in a car (cabin gain on, 2.5 m cabin). Three boxes:

| | Sealed 28 L | Ported 45 L, 33 Hz | Ported 45 L, 28 Hz |
|---|---|---|---|
| 25 Hz | 109.4 dB | 113.1 dB | 115.9 dB |
| 30 Hz | 111.9 dB | 117.9 dB | 118.8 dB |
| 40 Hz | 112.8 dB | 119.8 dB | 118.0 dB |
| 60 Hz | 111.1 dB | 114.1 dB | 113.0 dB |
| 80 Hz | 109.6 dB | 110.9 dB | 110.4 dB |
| Peak above 80 Hz level | +3 dB | **+9 dB** | +8 dB |

![In the car: the small sealed box (blue) is almost flat from 25 to 80 Hz; the ported boxes (orange, green) are louder but have a big hump.](img/car-spl.png)

The sealed box, at only 28 L, is within about 3 dB from 25 Hz to 80 Hz in the car: deep, even bass from a box that fits in a boot corner. Out of the car its F3 is 43 Hz, which looks poor on paper; in the car, the app puts it at **21 Hz**.

The ported boxes play **6–7 dB louder** at 30–40 Hz, which is a lot (about four times the amplifier power). But in the car they have a big hump: 9 dB at 40 Hz for the box tuned to 33 Hz. Some people want exactly that; others hear it as one-note "boom". Tuning lower (28 Hz) moves the hump down and spreads it, for a longer port.

## How to choose

- **Small, flat and accurate:** sealed. Size it for a Qtc around 0.7–0.8; in a car, a slightly small box is fine.
- **Loudest for the watts:** ported, tuned in the low 30s or high 20s Hz, and EQ the hump down if you don't like it.
- **Tight on space but want output:** a sealed box with more amplifier power usually beats a ported box that's been squeezed too small. A small box tuned high is what gives ported boxes their "boomy" reputation; see the [group delay guide](/guides/group-delay/).
- **Bandpass boxes** (4th and 6th order) are popular in cars for very high output in a narrow band; the app models those too, and the [design assistant](/guides/design-assistant/) can suggest them (tick **Bandpass** in its limits). On a bandpass design, **Size for a flat band** sizes both chambers and their ports for your driver in the same total volume.

## Things that are different in a car

- **Cabin size matters.** A small hatchback boosts from higher up than a big SUV. In the app's **Signal** tab, set **Longest inside** (the cabin's longest inside dimension) under **Room / cabin gain**.
- **Mounting position matters** (boot, firing forward or back, through a ski hatch) in ways no simulation captures. Use the simulation to choose the box, then tune by ear or with a measurement.
- **Protect the driver.** Ported car boxes need a subsonic filter too; see [the subsonic filter guide](/guides/subsonic-filter/).
- **Check the port speed.** Car audio runs high power, and a chuffing port is easy to hear in a quiet cabin. If you accept some port noise at full power (common in SPL builds), raise the chuffing line in **Settings → Ports**.
- **Polyfill in a sealed box** makes it act 15–25 % bigger, which helps when the box has to be small. How much to use is in the [box stuffing guide](/guides/box-stuffing/).

## Doing it in the app

Not sure which sub to buy? The [design assistant](/guides/design-assistant/) tries every suitable one in the database in sealed, ported and bandpass boxes, with the cabin gain, at your power.

1. Pick your sub from the database and set your amplifier power.
2. On the **Signal** tab, under **Room / cabin gain**, set **Space** to **Car cabin**, and adjust **Longest inside** for your car.
3. Add a sealed and a ported design and compare them with the cabin gain in the charts. The summary gives each box's own F3 (as WinISD does, and as the chart's "Box F3" dots show) and, next to it, the F3 in the car with the cabin gain.
4. Check the cone excursion and port speed at full power, with a high-pass filter.

[[Open the worked example|car-example]]

> Cabin gain in the app is a simple model: a 12 dB/oct rise below the frequency set by the cabin length, up to a maximum. Real cars vary a lot with their shape, seats and leaks, so treat it as a guide.
