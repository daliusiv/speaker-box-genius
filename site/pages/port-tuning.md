---
title: "My port tunes higher (or lower) than designed: why, and how to fix it"
description: Why a built ported box tunes away from its design (net volume, end corrections, port position, flares, losses), how to measure the real tuning from the impedance curve, and how to correct it.
path: guides/port-tuning
image: port-tuning-impedance.png
order: 12
group: ported
---

# My port tunes higher (or lower) than designed: why, and how to fix it

You cut the port to the calculated length, measured the box's impedance, and the dip is at 43 Hz instead of 40 Hz. Or it's lower than you aimed for. Port tuning errors of a few hertz are completely normal, and they have a handful of well-understood causes. Here's what they are, how big each one is, how to measure the real tuning, and how to correct it.

[[Open the example: the same port in the designed and the built box|port-tuning-example]]

## How a port tunes a box

A port and a box form a Helmholtz resonator: the air in the port is a mass, and the air in the box is a spring. The tuning frequency Fb depends on the box's volume and on the port's **acoustic mass**, which grows with its length and shrinks with its area. Air also moves just beyond each end of the port, so the port behaves as if it were longer than it really is. That extra length is the **end correction**, and it's where many of the surprises come from.

The textbook end corrections are from Beranek: **0.85 × radius** for an end set in a flat panel (flanged), and **0.61 × radius** for an end in free space (unflanged) [1]. A typical port, flush with the baffle on the outside and open in the box on the inside, gets about 1.46 × radius in total, or **0.732 × diameter**. That's the value this app, WinISD and most calculators use [2].

## Why it tunes high

### The box is smaller than you think

The simulation uses the **net** volume: the air the box really holds. Everything inside takes some of it. For the worked example, a **Dayton Audio DSA215-8** in its QB3 box, designed as 16.2 L tuned to 39.8 Hz with a 5 cm port 19.2 cm long:

| What's taken out | Net volume | Tuning |
|---|---|---|
| Nothing (as designed) | 16.2 L | 39.8 Hz |
| The driver's own displacement (0.87 L) | 15.3 L | 40.9 Hz |
| The port tube itself (0.51 L, outside diameter 5.8 cm) | 14.8 L | 41.6 Hz |
| 5 % for bracing | 14.1 L | 42.7 Hz |

![The same port in the box as designed (blue) and as built (orange): the impedance dip, which marks the tuning, moves up by about 3 Hz.](img/port-tuning-impedance.png)

That's the most common cause of a box tuning high. The tuning goes roughly with one over the square root of the volume, so every 10 % of volume you lose raises Fb by about 5 %.

### The port's inner end is crowded

Beranek's corrections assume the inner end of the port is in open space and the outer end is in a large flat panel. Real ports rarely are. An inner end close to a wall, a brace or the back of the driver has extra air loading, which makes the port act **longer** and tune **lower**. An outer end that sits proud of a small baffle, or near its edge, has less loading than a true flange and tunes a little **higher**. Either way the error is a few percent.

How much does the end correction matter? For the example port, with everything else the same:

| Total end correction (× diameter) | Tuning |
|---|---|
| 0.614 (both ends free) | 40.3 Hz |
| 0.732 (one flanged, one free: the usual value) | 39.8 Hz |
| 0.85 (both ends flanged) | 39.3 Hz |
| 1.0 (an end near a wall) | 38.7 Hz |
| 1.2 (an end very close to a wall) | 37.9 Hz |

Builders regularly report built boxes tuning differently from the calculation by around 5–10 % [3][4]. A common rule of thumb is to keep the port's inner end at least one port diameter away from any wall or brace, so its end correction stays close to the textbook value.

### The port has flared ends

A flared (rounded-over) end is wider than the tube, so the air in the flare is a lower mass per unit length: a flared port needs to be **longer** for the same tuning. The example port with 1 cm flares on both ends tunes to **41.0 Hz** at the original length. The app works this out when you set **Flare r**.

## Why it tunes low

- **The box is bigger than you think**: the dimensions you entered are outside dimensions, or the walls are thinner than planned. A box 10 % bigger tunes the example to 37.9 Hz.
- **The port's ends are crowded** (above): close to a wall, brace or the driver's magnet.
- **Stuffing**: fibre in a ported box makes the box act slightly bigger (the air's compression changes from adiabatic towards isothermal), which lowers the tuning a little. It also adds losses. The [box stuffing guide](/guides/box-stuffing/) has measured tuning shifts and how much fill to use.
- **Soft panels**: a box that flexes acts slightly bigger, and loses energy.

## How to measure the real tuning

Measure the box's **impedance** with a DATS, REW, ARTA, a sound card and a resistor, or a multimeter and a signal generator. A ported box has **two peaks** with a **dip** between them, and the tuning is at (or very near) the dip [5].

For a cross-check, Small showed that the two peak frequencies (fL and fH) and the driver's free-air resonance Fs are related to the tuning by fL × fH ≈ Fs × Fb [5]. In the example, the simulated peaks are at 19.0 Hz and 73.1 Hz: 19.0 × 73.1 = 1389, and 35 × 39.8 = 1393.

A second check: measure the port's output in the near field (the microphone at the port's mouth). It peaks at the tuning frequency, and the cone's near-field output has a deep notch there, where the cone barely moves.

In the app, load your impedance measurement (`.zma`) with the **Measured** card and lay it over the simulated impedance chart: if the dips don't line up, the box isn't tuned where the simulation thinks.

## How to correct it

1. **Fix the model first.** Enter the **net** volume (use the volume calculator, which subtracts the driver, port and bracing), so the simulation shows what you really built.
2. **Then recut the port.** Type the tuning you want and press **Set port length**: the app gives the new length for the real volume.
3. **If it still disagrees with your measurement**, adjust the simulated volume until its impedance dip matches the measured one. That tells you the box's **effective** volume, including stuffing and flex, and from then on the simulation will match your box.
4. **Leave some spare.** Make the port a little long, measure, and trim it: it's easy to shorten a port and hard to lengthen one. As a rule, cutting 10 % off a port raises the tuning by a little under 5 % (the end correction doesn't change).

## What a few hertz really costs

A tuning a little off isn't a disaster. In the example, the box tuned 3 Hz high (42.6 Hz) has its F3 at **52.9 Hz** instead of 50.8 Hz, and about 1.5 dB less output around 30–40 Hz. It's worth fixing, but it's rarely the reason a speaker sounds wrong; check the other causes in [why your measurement doesn't match the simulation](/guides/simulation-vs-measurement/).

[[Open the example|port-tuning-example]]

## Sources

1. L. L. Beranek, *Acoustics* (McGraw-Hill, 1954; Acoustical Society of America reprint, 1986), on the acoustic mass of tubes: end corrections of 0.85 a (flanged) and 0.613 a (unflanged). Cited in many forum discussions, for example [diyAudio: Port correction factor](https://www.diyaudio.com/community/threads/port-correction-factor.77742/).
2. [Port length calculator](https://omnicalculator.com/other/port-length), Omni Calculator: k = 0.732 for one flanged and one free end (0.850 both flanged, 0.614 both free).
3. [Hornresp thread, page 691](https://www.diyaudio.com/community/threads/hornresp.119854/page-691), diyAudio: measured tuning compared with prediction, and the 1.462 × radius total end correction (8/3π + 0.1952π).
4. [Port Correction Factor](https://www.diyaudio.com/community/threads/port-correction-factor.77742/) and [Calculating port end correction](https://www.diyaudio.com/community/threads/calculating-port-end-correction.317643/), diyAudio: builders' reports of built boxes tuning differently from prediction, and ports near walls.
5. R. H. Small, "Vented-Box Loudspeaker Systems, Part IV: Appendices", *J. Audio Eng. Soc.* 21 (8), 635–639, October 1973: parameters from voice-coil impedance measurements. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=1941).
