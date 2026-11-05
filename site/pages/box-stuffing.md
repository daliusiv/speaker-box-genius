---
title: "Polyfill and box stuffing: does it really make a box bigger?"
description: What polyfill and other stuffing really do inside a speaker box, how much bigger they make it act (measured), how much to use in sealed and ported boxes, how to model it in a simulator and how to measure it.
path: guides/box-stuffing
image: stuffing-sealed-spl.png
order: 16
---

# Polyfill and box stuffing: does it really make a box bigger?

Ask about polyfill on any car-audio or DIY forum and you'll get every possible answer: it makes the box act 10 %, 30 % or 50 % bigger; it does nothing; it slows sound down; it takes up space and makes the box smaller; never put it in a ported box; always put it in a ported box; use a pound per cubic foot. Some of these are right, some are half right, and a few are wrong. Here's the physics, what careful measurements found, what stuffing does to a sealed and a ported design in the simulator, and how much to use.

[[Open the sealed example|stuffing-sealed]]

## The short answer

- **Yes, stuffing makes a box act bigger, but only at bass frequencies and only up to a limit.** Physics caps the gain at 40 %; real stuffing usually gets 15–30 %.
- **It also adds losses,** which lowers the box's Q. In a sealed box that means a smaller bass hump; in a ported box it means a softer, less efficient port.
- **It doesn't make a box louder** and won't rescue a box that's far too small. A stuffed box acts like a slightly bigger box with a little less output near its resonance.
- **Too much is worse than too little.** Packed tightly, fibres stop working and the box acts *smaller* again.
- **Sealed boxes:** fill loosely, about **8–24 g per litre** (0.5–1.5 lb/ft³). **Ported boxes:** line the walls; filling them works but retunes the box lower and softens the port.

## How stuffing makes a box act bigger

A sealed box's air works as a spring on the cone: push the cone in, the air is squeezed, and its pressure pushes back. How stiff that spring is depends on more than the volume.

When air is squeezed quickly, it **heats up**, and warmer air pushes back harder. In an empty box, the air has nowhere to lose that heat within one cycle of a bass note, so it compresses **adiabatically** (without heat exchange). If the heat could flow out as fast as it's made, the air would compress **isothermally** (at constant temperature), and the spring would be softer by a factor equal to the ratio of air's specific heats, γ ≈ 1.4. A softer spring is exactly what a bigger box gives, so:

> **The ceiling:** a perfectly isothermal box acts **1.4 times** its real volume, a 40 % gain. That limit comes from the air itself, so no material or amount of stuffing can beat it [2].

Fibres make the difference. A box stuffed at 16 g/L holds more than ten times as much fibre as air by weight (air is about 1.2 g/L), and fine fibres sit close to every bit of air, so they soak up the heat of compression and give it back as the air expands. The air stays closer to constant temperature, and the box acts bigger [2][3].

It isn't all or nothing. The heat has to travel from the air to the fibres within each cycle, so stuffing works best at **low frequencies** and fades out higher up. For a typical fibreglass filling, Putland worked out that the change from isothermal to adiabatic happens around **290 Hz**, and showed that earlier estimates for the same case differed by a factor of almost 2,000 (3.5 Hz and 6.4 kHz) [2]. That's one reason forum rules of thumb disagree so much: the effect depends on fibre diameter, how densely it's packed and the frequency. In practice, a well-filled box usually behaves as if γ had dropped from 1.4 to about **1.2**, which is a **15–20 %** bigger box [5].

Two more things happen at the same time:

- **Losses.** Air moving through fibres loses energy to friction. In a simulator this is the box's absorption loss, **Qa** (see the [box losses guide](/guides/box-losses/)). More fill means more loss [6].
- **Moving mass.** Loose fibres move a little with the air, adding mass. Leach's model of a filled box includes both the thermal effect and the mass and friction of the filling itself [3].

### "Doesn't the stuffing take up space?"

Barely. Polyester has a density of about 1.38 g/cm³, so 16 g of it takes up about 12 cm³: **about 1 % of each litre**. Even a heavily stuffed box loses only 2 % of its volume to the fibre itself. When packed fill makes a box act smaller, it isn't the space the fibres take up: they're jammed together and have stopped working (see the measurements below).

### "Doesn't it slow down the sound?"

In a sense, yes. The same heat exchange that softens the spring also lowers the speed of sound in the filling. Rubino measured sound in a test line slowing from about 344 m/s to about 320 m/s with Dacron fibre at 16 kg/m³ (16 g/L) [5]. That matters in a [transmission line](/guides/transmission-line/), where the line's length sets its tuning. In a subwoofer box, the dimensions are tiny next to the wavelengths, so what counts is the softer spring, not the speed.

## What the measurements show

The best-known measurement is Tom Nousaine's [1]. He measured the impedance of three boxes with the same woofer and worked out from each curve how big the box was acting: a 40 L (1.4 ft³) sealed box, a 144 L (5.1 ft³) sealed box, and the same 40 L box ported (7.6 cm × 15 cm port, 3″ × 6″). The fill was polyester fibrefill.

**40 L sealed box**

| Fill | Resonance | Acts like | Gain |
|---|---|---|---|
| Empty | 56.6 Hz | 40 L | — |
| 11 g/L (0.70 lb/ft³) | 53.0 Hz | 45 L | +14 % |
| 24 g/L (1.50 lb/ft³) | 51.7 Hz | 51 L | +29 % |
| 28 g/L (1.75 lb/ft³) | 50.8 Hz | 54 L | **+36 %** |
| 42 g/L (2.60 lb/ft³) | 50.4 Hz | 45 L | +14 % |
| 50 g/L (3.10 lb/ft³) | 52.6 Hz | 34 L | **−14 %** |

**144 L sealed box**

| Fill | Resonance | Acts like | Gain |
|---|---|---|---|
| Empty | 42.0 Hz | 144 L | — |
| 4 g/L (0.25 lb/ft³) | 42.0 Hz | 144 L | 0 % |
| 8 g/L (0.50 lb/ft³) | 41.2 Hz | 164 L | +14 % |
| 16 g/L (1.00 lb/ft³) | 39.4 Hz | 184 L | **+27 %** |
| 20 g/L (1.25 lb/ft³) | 38.6 Hz | 184 L | +27 % |
| 24 g/L (1.50 lb/ft³) | 40.2 Hz | 159 L | +9 % |

**40 L ported box**

| Fill | Tuning | Acts like | Gain |
|---|---|---|---|
| Empty | 42.0 Hz | 40 L | — |
| 6 g/L (0.40 lb/ft³) | 39.1 Hz | 45 L | +14 % |
| 14 g/L (0.85 lb/ft³) | 37.2 Hz | 51 L | +29 % |
| 22 g/L (1.40 lb/ft³) | 34.2 Hz | 57 L | **+43 %** |
| 28 g/L (1.75 lb/ft³) | 35.2 Hz | 54 L | +36 % |

What these show:

- **The gain is real:** roughly 25–35 % at 16–28 g/L (1–1.75 lb/ft³) in all three boxes [1].
- **There is a best amount.** Past it, the gain falls and finally reverses: at 50 g/L the small sealed box acted 14 % *smaller* than empty. Nousaine's explanation was that tightly packed fibres stop moving and stop exchanging heat [1].
- **Big boxes gain less.** The 144 L box topped out at 27 % and turned down earlier [1].
- **Resonance isn't the whole story.** In the small sealed box, 42 g/L gave a *lower* resonance than 28 g/L but a smaller gain, because the sizes were worked out from both the resonance and Qes, and Qes dropped as the losses grew [1].
- **The ported result is above the physical ceiling.** +43 % is more than the 40 % that heat exchange alone can give, so not all of that tuning drop is the box "getting bigger". Fill moving with the air and fill near the port load the air that the port's tuning depends on [3]. Treat the ported numbers as tuning shifts, not volumes.

Nousaine's figures are at the top of the usual range: one woofer, one material, sizes inferred from impedance. Other sources put a well-filled box at 15–20 % [5]. Plan on **15–25 %** and measure what you get.

## What stuffing does to a sealed box

The example: a **Dayton Audio RSS265HF-4** 10″ subwoofer, whose textbook sealed box (Qtc 0.707) is 37.3 L, squeezed into **18 L**, the kind of box that fits a car boot. The stuffed box is simulated as 25 % bigger (22.5 L), and then with the absorption it adds (Qa 20). The overstuffed box is simulated as 14 % smaller, like Nousaine's most tightly packed box.

| Box | Acts like | Qtc | F3 | At 30 Hz | Hump |
|---|---|---|---|---|---|
| 18 L, empty | 18 L | 0.90 | 45.4 Hz | −9.7 dB | +1.1 dB at 96 Hz |
| 18 L, stuffed (volume only) | 22.5 L | 0.83 | 43.9 Hz | −8.6 dB | +0.8 dB |
| 18 L, stuffed (volume and losses, Qa 20) | 22.5 L | 0.83 | 44.7 Hz | −8.7 dB | +0.7 dB |
| 18 L, overstuffed (Qa 20) | 15.5 L | 0.96 | 47.5 Hz | −10.6 dB | +1.1 dB |
| 37.3 L, empty | 37.3 L | 0.71 | 42.0 Hz | −7.0 dB | +0.4 dB |

![The RSS265HF-4: 18 L empty (blue), 18 L stuffed and acting as 22.5 L (orange), and the full-size 37.3 L box (green).](img/stuffing-sealed-spl.png)

Stuffing the 18 L box closes only part of the gap to the full-size box: the F3 drops by under 1 Hz once the losses are counted, the response at 30 Hz improves by about 1 dB, and the hump above the passband shrinks from 1.1 dB to 0.7 dB. That matches what people hear: the bass gets a little **smoother and less boomy**, not much **deeper**. (Qtc and resonance are explained in the [Thiele/Small parameters guide](/guides/thiele-small-parameters/).)

So:

- **Use stuffing to tame a box that's slightly small,** or to use a slightly smaller box than the design called for. It's a free 15–25 % of volume.
- **Don't use it to fix a box that's half the size it should be.** If you need deep bass from a small sealed box, that's what a [Linkwitz Transform](/guides/linkwitz-transform/) (EQ) does, at the cost of amplifier power and excursion.
- **In a car,** a slightly small, stuffed sealed box is often ideal: the cabin gain fills in the bottom end. See the [car subwoofer guide](/guides/car-subwoofer/).
- **Still choosing a box type?** See [sealed, ported or passive radiator](/guides/sealed-vs-ported/).

[[Open the sealed example|stuffing-sealed]] [[Open it with the stuffing losses|stuffing-sealed-losses]]

## What stuffing does to a ported box

A ported box works because the air in the box and the air in the port resonate together. Stuffing changes both halves of that:

- **The box acts bigger, so the tuning drops.** Same port, more effective volume, lower Fb [1].
- **The losses damp the resonance,** so the port does less. A ported box relies on that resonance; damping it is the reason behind "never stuff a ported box" [6].

The example: a **Dayton Audio DSA215-8** in its QB3 box, 16.2 L with a 5 cm port tuned to 39.8 Hz, driven at 2.83 V. Filled, it's simulated as 20 % bigger (19.4 L) with a heavy absorption loss (Qa 10).

| Box | Tuning | F3 | At 30 Hz | At 40 Hz | At 60 Hz | Upper impedance peak |
|---|---|---|---|---|---|---|
| Empty | 39.8 Hz | 50.8 Hz | −12.8 dB | −6.4 dB | −1.6 dB | 26.9 Ω |
| Filled | 36.3 Hz | 59.9 Hz | −11.3 dB | −6.3 dB | −3.0 dB | 20.7 Ω |

![The DSA215-8's ported box empty (blue) and filled (orange): the filled box tunes lower and gains a little at the very bottom, but loses the port's lift above the tuning, and its upper impedance peak drops.](img/stuffing-ported-spl.png)

Filling the box doesn't kill the bass, but it **reshapes** it: the tuning drops 3.5 Hz and the very bottom gains 1.5 dB, while 50–60 Hz loses 1–1.5 dB. The −3 dB point actually *rises* by 9 Hz because the response becomes a long, soft slope instead of a shelf. Some people like that (it's a classic fix for a boomy box tuned too high); it's not what the box was designed to do.

In practice:

- **Line the walls, don't fill the box.** Most commercial ported speakers use only a lining, because absorption losses grow with the amount of material [6]. A lining changes the tuning and output very little.
- **Lining is for the midrange, not the bass.** Sound bouncing between the walls forms standing waves where an inside dimension is half a wavelength, and they leak out through the port. Audiojudgement measured a 220 Hz peak from the port of a box 750 mm tall inside, as loud as the port's own bass output; 5 cm mineral wool on the top and bottom cut it by about 10 dB, and lining the sides as well removed it [7]. For a subwoofer low-passed at 80 Hz, those modes are above its range, which is why sub boxes often need little or no damping [8].
- **Keep fill away from the port.** Loose fill near the port can be blown out, and fill across the port's path adds port losses (Qp) and lowers the tuning unpredictably. Fix lining to the walls.
- **If you fill it, measure the new tuning,** and recut the port if needed. See [why a port tunes away from its design](/guides/port-tuning/). Stuffing doesn't reduce port noise; for that, see the [port chuffing guide](/guides/port-chuffing/).

[[Open the empty ported box|stuffing-ported-empty]] [[Open it filled|stuffing-ported-filled]]

## Passive radiator boxes and transmission lines

- **Passive radiator boxes** behave like ported boxes: the fill acts on the box's air spring, so it lowers the tuning a little and damps the resonance [6]. Line the walls, and if you fill the box, check the tuning and the passive radiator's excursion again. See the [passive radiator guide](/guides/passive-radiator-box/).
- **Transmission lines** are the exception: there the stuffing is part of the design. It lowers the line's tuning and soaks up the upper harmonics of the pipe [4][5]. The app models a stuffed line directly; see the [transmission line guide](/guides/transmission-line/).

## How much to use

| Box | Amount | How |
|---|---|---|
| Sealed, up to about 85 L (3 ft³) | 16–24 g/L (1–1.5 lb/ft³) | Loose and fluffed, filling the box |
| Sealed, bigger | 8–16 g/L (0.5–1 lb/ft³) | Loose and fluffed, filling the box |
| Ported or passive radiator | A 1–2.5 cm lining | Glued or stapled to the walls, port and its path kept clear |
| Transmission line | Set by the design | See the [transmission line guide](/guides/transmission-line/) |

The sealed figures follow Nousaine's rules of thumb: about 1.5 lb/ft³ for boxes up to about 3 ft³ (for about 30 %), and 1 lb/ft³ for bigger boxes (for about 25 %) [1]. Some tips:

- **Weigh it.** "Fill the box" means nothing; grams per litre does. A 28 L box at 16 g/L takes about 450 g. For a pair of speakers, put the same weight in each.
- **Fluff it, don't pack it.** If you have to force it in, it's too much. Pulling fibrefill apart into loose tufts helps it work.
- **Keep it off the cone** and clear of the back of the driver, and in a car, fix it in place so it can't shift.
- **Start low and measure.** More fill lowers the impedance peak's frequency and its height; when the response starts to drop overall, you've overdone it [9].

## Which material?

- **Polyester fibrefill** (Dacron, Poly-fil, pillow stuffing) is the usual choice. Nousaine found it worked about as well as fibreglass or long-fibre wool, and it's cheap, clean and doesn't attract moths [1].
- **Fibreglass and mineral wool** work well and come as boards that are easy to fix to walls, but they irritate skin and lungs. Wear a mask and gloves, and wrap them if they're near the port [7].
- **Long-fibre wool** is the traditional transmission line filling.
- **Thin foam sheets** (egg-crate and similar) mostly absorb higher frequencies; they won't cure a low standing wave [7].

## Modelling stuffing in the app

Each sealed, ported and passive radiator design has a **Stuffing** setting under its box fields. The **Vb** you enter stays the real net volume; the app simulates the volume the stuffing makes the box act as, with the absorption loss (Qa) it adds:

| Stuffing | What the app uses | When |
|---|---|---|
| **None** | The net volume and the Qa in **Settings** | An empty box |
| **Lined walls** | The net volume, Qa 50 | Ported and PR boxes (the usual choice), or a lightly damped sealed box |
| **Filled with fibre** | A typical gain and Qa for the amount you enter in g/L (lb/ft³ in imperial units): about +20 % and Qa 20–30 for a sealed box at 16–24 g/L; less gain and much more loss (Qa 10–20) for a filled ported or PR box. Past about 28 g/L the gain falls, and packed fill makes the box act smaller | Sealed boxes |
| **Custom (measured)** | Your own gain (%) and Qa, typed in or fitted to a measured impedance sweep | When you've measured your box (below) |

The filled values are typical, read from the measurements above, not a prediction for your fibre: no formula predicts a given material and amount well [1][2]. That's why **Custom** is there.

With **Filled**, the card also shows how much fibre to weigh out for the box's net volume, and the build sheet repeats it. For a ported or PR box it shows how far the fill lowers the tuning. The presets (Qtc 0.707, QB3 and the others) size a stuffed box so that it *acts* as the alignment's volume, so you build a smaller box.

Because each design has its own stuffing, you can compare an empty box with a stuffed one on the same charts: duplicate the design and set **Stuffing** on the copy. Settings' **Absorb Qa** still applies to every design without stuffing. Don't subtract the fill in the **Volume** calculator; it takes up only 1–2 % of the box.

## How to measure what your stuffing did

The surest way to know how big your stuffed box acts is to measure it, the way Nousaine did. The app can do the arithmetic for you:

1. Measure the driver's own **Fs** and **Vas** first (see the [Thiele/Small parameters guide](/guides/thiele-small-parameters/); the app can fit them from a free-air impedance sweep). The result below is only as good as these.
2. Measure the box's impedance with the stuffing in place (DATS, REW, ARTA or similar) and save it as a `.zma` file.
3. On the design's card, open **Fit to a measured impedance sweep** under **Stuffing**, load the sweep and press **Fit**. The app compares its simulation of your driver in the box with the measurement around the resonance peaks and finds the volume the box acts as and its **Qa**. **Match** says how close the fitted simulation gets; more than about 10 % off means something besides the stuffing differs (the driver's parameters, a leak, the port), and the app says what to check.
4. **Use these values** sets the design's stuffing to **Custom** with them and shows the impedance chart, with your sweep drawn over the simulation.

To check by hand, the box resonance **fc** is the impedance peak, and the box volume the driver sees is:

```
Vb(effective) = Vas / ((fc / Fs)² − 1)
```

For the RSS265HF-4 (Fs 25.6 Hz, Vas 54 L), the empty 18 L box peaks at 51.2 Hz. If the stuffed box peaks at 47.4 Hz, it's acting like 54 / ((47.4 / 25.6)² − 1) = **22.2 L**, about 23 % bigger. That formula ignores the voice coil's inductance and the box's losses; the app's fit uses the whole curve and includes both. Either way, treat the result as within about 10 %. For a ported box, the fit works on both impedance peaks; [why a measurement doesn't match the simulation](/guides/simulation-vs-measurement/) covers the other usual causes of a mismatch, and the [box losses guide](/guides/box-losses/) explains the loss Qs.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Polyfill makes the box 40–50 % bigger" | No. 40 % is the physical limit; expect 15–25 %, perhaps 30 % at best [1][2][5]. |
| "It doesn't do anything" | Wrong for a sealed box with enough fill: the resonance drops measurably. Right for a few grams: 4 g/L did nothing measurable in the big box [1]. |
| "It slows the sound down" | Partly true: the speed of sound drops in fill, but in a sub box what matters is the softer air spring [5]. |
| "The fill takes up space, so the box gets smaller" | About 1 % of the volume. Packed fill does make a box act smaller, but because the fibres stop working [1]. |
| "Never put polyfill in a ported box" | Lining is normal and helps the midrange. Filling it works too, but retunes it lower and softens the port [1][6]. |
| "Polyfill gives you more bass" | No. It trades a bit of output near resonance for a lower, smoother roll-off; it doesn't add efficiency [9]. |
| "Use 1 lb per cubic foot" | A good start for a mid-sized sealed box. Small boxes can take more, big ones less, and past about 1.5–1.75 lb/ft³ it goes backwards [1]. |

## Sources

1. Tom Nousaine, "Make a small box act like a larger one with polyester fiberfill", *Car Stereo Review*, March/April 1995: impedance measurements of 40 L and 144 L sealed and 40 L ported boxes at different fill densities. [Copy of the article](https://glasswolf.net/papers/polyfill).
2. Gavin R. Putland, "Thermal Time Constants and Dynamic Compressibility of Air in Fiber-Filled Loudspeaker Enclosures", *J. Audio Eng. Soc.* 46 (3), 139–151, March 1998: air is at most 40 % more compliant isothermally than adiabatically; the transition frequency for a typical filling. [AES E-Library (open access)](https://aes2.org/publications/elibrary-page/?id=12161).
3. W. Marshall Leach, Jr., "Electroacoustic-Analogous Circuit Models for Filled Enclosures", *J. Audio Eng. Soc.* 37 (7/8), 586–592, July 1989: the thermal and mechanical effects of filling in a closed box. [AES E-Library](https://aes.org/publications/elibrary-page/?id=6076).
4. L. J. S. Bradbury, "The Use of Fibrous Materials in Loudspeaker Enclosures", *J. Audio Eng. Soc.* 24 (3), 162–170, April 1976: how fibres slow and attenuate sound waves, applied to lines and labyrinths. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2632).
5. Andrea Rubino, [The Speed of Sound in the Transmission Line, part 2](https://transmissionlinespeakers.com/en/articles/the-speed-of-sound-in-the-transmission-line-pt-2/): the effective γ of a fibre-filled box (about 1.2, a 15–20 % bigger box), and measured speeds of sound in fibre and foam.
6. A. R. Taddeo, [US patent 4,837,837, "Loudspeaker"](https://uspto.report/patent/grant/4837837), 1989: damping material increases box compliance through its isothermal behaviour; its absorption losses grow with the amount used, which is why most vented boxes use only a minimal amount.
7. Audiojudgement, [Internal standing waves: how to eliminate them from speaker boxes](https://audiojudgement.com/internal-standing-waves/): a measured 220 Hz standing wave in a ported box's port output, and how mineral wool removed it.
8. Wayne Parham, [Cabinet design, port placement and internal standing waves](https://audioroundtable.com/forum/pdf.php?msg=73713), AudioRoundTable, 2012: standing waves don't form at subwoofer wavelengths in normal boxes.
9. diyAudio, [Speaker polyfill stuffing not working](https://www.diyaudio.com/community/threads/speaker-polyfill-stuffing-not-working.343810/): using the impedance peak to judge the amount of stuffing, and the drop in output when there's too much.
