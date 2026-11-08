---
title: "Linkwitz Transform: deep bass from a small sealed box, and what it really costs"
description: How the Linkwitz Transform works, how to choose f0, Q0, fp and Qp, how much boost, excursion and amplifier power it needs, and why it doesn't raise maximum output, with a worked 10-inch example.
path: guides/linkwitz-transform
image: lt-spl.png
order: 14
---

# Linkwitz Transform: deep bass from a small sealed box, and what it really costs

The Linkwitz Transform (LT) is an equaliser that makes a small sealed box behave like a bigger one, or like a box with a lower resonance than any box could give the driver. It's one of the most useful tricks in bass design, and one of the most misunderstood: it gives deep, flat bass from a small box, but it doesn't give you more output. Here's how it works, how to set it up, and exactly what it costs.

[[Open the worked example|lt-example]]

## What it does

A sealed box behaves like a second-order high-pass filter: flat above its resonance fc (often written f0) and falling at 12 dB/oct below it, with its Q (Qtc, or Q0) setting the shape of the corner. Siegfried Linkwitz's circuit is a biquad filter whose zeros cancel the box's own poles (f0, Q0) and whose poles put in new ones (fp, Qp) that you choose [1][2][3]. The result is the response of a sealed box with resonance fp and Q Qp, for example 25 Hz at Q 0.707, from a box whose own resonance is 49 Hz.

Because it replaces a second-order response with another second-order response, it's for **sealed boxes** (and open baffles). A ported box rolls off at 24 dB/oct, and an LT won't fit it [4].

## The worked example

A **Dayton Audio RSS265HF-4** 10″ subwoofer in a **20 L** sealed box: about half the size its Qtc 0.707 box would be (37 L). On its own the 20 L box has fc 49.2 Hz and Qtc 0.87, so it rolls off early with a slight hump. An LT takes it to **fp 25 Hz, Qp 0.707**. All three run at **40 W** behind a 24 dB/oct high-pass filter at 18 Hz:

| | 20 L + LT | 20 L, no EQ | 37 L, no EQ |
|---|---|---|---|
| F3 | **29.0 Hz** | 44.6 Hz | 42.0 Hz |
| Output at 25 Hz (40 W) | 96.3 dB | 88.1 dB | 90.7 dB |
| Peak cone excursion (40 W) | 11.7 mm | 4.3 mm | 5.7 mm |
| **Maximum SPL at 25 Hz** | **97.3 dB** | **97.3 dB** | **97.4 dB** |
| Amplifier needed at 25 Hz to reach that maximum | 33 V, 6.8 A | 33 V, 6.8 A | 25 V, 3.8 A |

![Response at 40 W: the 20 L box with the LT (blue) is flat to about 30 Hz; the same box without EQ (orange) and the 37 L box (green) roll off from the mid 40s.](img/lt-spl.png)

The LT box goes **15 Hz deeper** than the box twice its size. But look at the maximum SPL: **all three boxes reach exactly the same level** at 25 Hz before the cone hits its Xmax (12.3 mm). The LT doesn't make the sub louder, and the small box needs more amplifier power at the bottom than the big one.

## Why it doesn't raise the maximum output

In a sealed box, the bottom-octave output is limited by how much air the cone can move: its area times its Xmax. That's set by the driver, not the box or the EQ. A bigger box, a smaller box, or an EQ all reach the same SPL at the frequency where the cone reaches Xmax. What changes is **how much amplifier power it takes to get there**, and **what the response looks like below that point** [5].

So the LT trades amplifier power for box size. To drive the cone to its Xmax at 25 Hz, the amplifier has to deliver:

- for the 37 L box, **25 V and 3.8 A** (about 73 W into the speaker);
- for the 20 L box, **33 V and 6.8 A** (about 196 W), **with or without the LT**. The same box needs the same voltage to move the cone the same distance.

In the "watts" that amplifiers and simulators usually quote (V² ÷ Re), that's 335 W for the small box against 187 W for the big one: close to the driver's 350 W rating.

What the LT changes is that the extra voltage arrives automatically: its boost is in the signal. In the example, a 40 W setting is 11.8 V, but after the LT (and the high-pass filter) the amplifier is putting out **29 V** at 25 Hz, about 8 dB more, and the cone is at 11.7 mm. So the amplifier must be sized for the boosted bass, not for the passband. The app shows exactly what it needs: switch the **Max SPL** chart to **Volts** or **Amps**.

## How much boost, and how much power

The LT's boost at very low frequencies is **(f0 / fp)²**, or **40 × log10(f0 / fp)** in dB [2]:

| f0 → fp | Boost |
|---|---|
| 49.2 → 30 Hz | 8.6 dB |
| 49.2 → 25 Hz | **11.8 dB** |
| 49.2 → 20 Hz | 15.7 dB |

Every 6 dB of boost needs **four times** the amplifier power and **twice** the cone excursion at those frequencies. An 11.8 dB boost needs about 15 times the power at the bottom of the range. A common limit is to keep the boost under about **12 dB** [6]: beyond that, the amplifier power and the excursion grow faster than the bass you gain.

## You need a subsonic filter

An LT boosts everything below fp, all the way down, so without a filter, rumble and subsonic content drive the cone far past its Xmax. Always put a **high-pass filter** below fp. In the example, the 24 dB/oct filter at 18 Hz keeps the cone at 11.7 mm at 40 W. See [the subsonic filter guide](/guides/subsonic-filter/).

## Choosing f0, Q0, fp and Qp

**f0 and Q0** must describe the box as built, not the datasheet driver. Linkwitz's own method was to measure the impedance of the driver in its box and calculate f0 and Q0 from it [7]; the designer of a widely used LT spreadsheet found that getting f0 and Q0 right was the largest source of error in the whole process [8]. In the app, the EQ takes f0 and Q0 from the simulated box; once the box is built, measure it and enter the measured values.

**fp** is the new resonance. Lower goes deeper, and costs more boost (see the table above). A good target is where the boost stays around 12 dB, or a little above the lowest note you care about.

**Qp** shapes the corner:

- **0.707** gives the flattest response (Butterworth).
- **0.5** gives a gentler, more gradual roll-off with the least overshoot.
- **Higher than 0.707** gives a lift above fp, which some people use deliberately to offset a room. Rooms already add gain at the bottom, so in a room a slightly higher fp or a lower Qp often sounds right [9].

## Group delay

The LT changes the timing of the bass. In the example, group delay at 20 Hz rises from about 5 ms to 11 ms, while at 40 Hz it falls from 6 ms to 4 ms. The peak delay is higher, but over the range that matters for music it's often improved, because the response is flatter there [2]. Either way, a few milliseconds at these frequencies is far below the delays shown to be audible in listening tests [10]. The [group delay guide](/guides/group-delay/) puts these numbers next to sealed and ported boxes.

## How to build one

- **DSP:** most DSPs (miniDSP and others) can make an LT directly from f0, Q0, fp and Qp, or with a single biquad. On the app's **Signal** tab, **Export to DSP** writes that biquad (with the rest of the design's EQ and high-pass) for Equalizer APO, CamillaDSP or miniDSP, at your DSP's sample rate.
- **Analogue:** Linkwitz's original circuit uses one op-amp stage; Elliott Sound Products has a full project with a design spreadsheet [3][11].
- **In the app:** on the **Signal** tab, add a **Linkwitz Transform** under **EQ**, choose which design it **Applies to**, and set **fp** and **Qp**. f0 and Q0 are filled in from the design.

## When not to use it

- **When you have the room for a bigger box.** It reaches the same output with less amplifier power, and needs no EQ.
- **When you need more output.** An LT can't give it; a bigger driver, more drivers or a ported box can.
- **When your amplifier is already near its limit.** The boost needs headroom you don't have.

[[Open the worked example|lt-example]]

## Sources

1. S. H. Linkwitz, "Loudspeaker system design", *Wireless World*, December 1978, p. 80 (the original description).
2. Leo Sahlsten, ["Linkwitz Circuit" Equalizes a Closed Box](https://www.analog.com/en/resources/design-notes/linkwitz-circuit-equalizes-a-closed-box.html), Maxim/Analog Devices Application Note 4525, 2010: Linkwitz's design procedure, the (f0/fp)² low-frequency gain, and its effect on group delay.
3. Jeremy Wolf and Rod Elliott, [Linkwitz Transform Circuit](https://sound-au.com/linkwitz-transform.htm), Elliott Sound Products.
4. [miniDSP forum: applying a Linkwitz transform](https://www.minidsp.com/community/threads/minidsp-shd-applying-linkwitz-transform.20715/latest): the LT is for sealed boxes, not ported ones.
5. Siegfried Linkwitz, [Electrical, mechanical and acoustic filters](https://www.LinkwitzLab.com/AES-Chile'09/Chile-el-mech-acoust%20filters.pdf) (AES Chile 2009 slides): maximum SPL estimates for a sealed woofer and the LT.
6. David McBean, [Hornresp's Linkwitz Transform](https://www.diyaudio.com/community/threads/hornresp.119854/page-729), diyAudio: "the Linkwitz Transform gain should not exceed 12 dB".
7. Siegfried Linkwitz, [Thor equalisation notes](https://linkwitzlab.com/Removed%20pages/x-thor-eq.htm): finding f0 and Q0 from the impedance of the built box.
8. John Murphy, [Designing a Linkwitz Transform Circuit](https://trueaudio.com/st_lkxfm.htm), True Audio.
9. [diyAudio: Starting Qtc for a Linkwitz Transform](https://www.diyaudio.com/community/goto/post?id=5217153): choosing fp and Qp with the room in mind.
10. J. Blauert and P. Laws, "Group delay distortions in electroacoustical systems", *J. Acoust. Soc. Am.* 63 (5), 1478–1483, 1978. [doi:10.1121/1.381841](https://doi.org/10.1121/1.381841).
11. Rod Elliott, [Project 71: Subwoofer Equaliser using the Linkwitz Transform](https://sound-au.com/project71.htm), Elliott Sound Products.
