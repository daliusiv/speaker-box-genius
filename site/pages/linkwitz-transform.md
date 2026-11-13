---
title: "Linkwitz Transform: deep bass from a small sealed box, and what it really costs"
description: How the Linkwitz Transform works, how to choose f0, Q0, fp and Qp, how much boost, excursion and amplifier power it needs, and why it doesn't raise maximum output, with a worked 10-inch example.
path: guides/linkwitz-transform
image: chart:lt-example/response
order: 14
group: sealed
---

# Linkwitz Transform: deep bass from a small sealed box, and what it really costs

The Linkwitz Transform (LT) is an equaliser that makes a small sealed box behave like a bigger one, or like a box with a lower resonance than any box could give the driver. It's one of the most useful tricks in bass design, and one of the most misunderstood: it gives deep, flat bass from a small box, but it doesn't give you more output. Here's how it works, how to set it up, and exactly what it costs.

[[Open the worked example|lt-example]]

## What it does

A sealed box behaves like a second-order high-pass filter: flat above its resonance fc (often written f0) and falling at 12 dB/oct below it, with its Q (Qtc, or Q0) setting the shape of the corner. Siegfried Linkwitz's circuit is a biquad filter whose zeros cancel the box's own poles (f0, Q0) and whose poles put in new ones (fp, Qp) that you choose [1][2][3]. The result is the response of a sealed box with resonance fp and Q Qp, for example 25 Hz at Q 0.707, from a box whose own resonance is {{num:lt-example/2/fc:0}} Hz.

Because it replaces a second-order response with another second-order response, it's for **sealed boxes** (and open baffles). A ported box rolls off at 24 dB/oct, and an LT won't fit it [4].

## The worked example

A **Dayton Audio RSS265HF-4** 10″ subwoofer in a **20 L** sealed box: about half the size of its textbook Qtc 0.707 box (37 L). On its own the 20 L box has fc {{num:lt-example/2/fc}} Hz and Qtc {{num:lt-example/2/qtc}}, so it rolls off early with a slight hump. An LT takes it to **fp 25 Hz, Qp 0.707**. All three run at **40 W** behind a 24 dB/oct high-pass filter at 18 Hz:

| | 20 L + LT | 20 L, no EQ | 37 L, no EQ |
|---|---|---|---|
| F3 | **{{num:lt-example/1/f3}} Hz** | {{num:lt-example/2/f3}} Hz | {{num:lt-example/3/f3}} Hz |
| Output at 25 Hz (40 W) | {{num:lt-example/1/spl@25}} dB | {{num:lt-example/2/spl@25}} dB | {{num:lt-example/3/spl@25}} dB |
| Peak cone excursion (40 W) | {{num:lt-example/1/x}} mm | {{num:lt-example/2/x}} mm | {{num:lt-example/3/x}} mm |
| **Maximum SPL at 25 Hz** | **{{num:lt-example/1/max@25}} dB** | **{{num:lt-example/2/max@25}} dB** | **{{num:lt-example/3/max@25}} dB** |
| Amplifier needed at 25 Hz to reach that maximum | {{num:lt-example/1/volts@25:0}} V, {{num:lt-example/1/amps@25}} A | {{num:lt-example/2/volts@25:0}} V, {{num:lt-example/2/amps@25}} A | {{num:lt-example/3/volts@25:0}} V, {{num:lt-example/3/amps@25}} A |

![Response at 40 W: the 20 L box with the LT ({{color:lt-example/1}}) is flat to about 30 Hz; the same box without EQ ({{color:lt-example/2}}) and the 37 L box ({{color:lt-example/3}}) roll off from the mid 40s.](chart:lt-example/response)

The LT box goes **{{diff:lt-example/3/1/f3:0}} Hz deeper** than the box twice its size. But look at the maximum SPL: **all three boxes reach the same level** (within 0.1 dB) at 25 Hz before the cone hits its Xmax (12.3 mm). The LT doesn't make the sub louder, and the small box needs more amplifier power at the bottom than the big one. That's [Hofmann's Iron Law](/guides/hofmann-iron-law/) at work: depth from a small box is paid for in efficiency.

## Why it doesn't raise the maximum output

In a sealed box, the bottom-octave output is limited by how much air the cone can move: its area times its Xmax. That's set by the driver, not the box or the EQ. A bigger box, a smaller box, or an EQ all reach the same SPL at the frequency where the cone reaches Xmax. What changes is **how much amplifier power it takes to get there**, and **what the response looks like below that point** [5].

So the LT trades amplifier power for box size. To drive the cone to its Xmax at 25 Hz, the amplifier has to deliver:

- for the 37 L box, **{{num:lt-example/3/volts@25:0}} V and {{num:lt-example/3/amps@25}} A** (about {{num:lt-example/3/pw@25}} W into the speaker);
- for the 20 L box, **{{num:lt-example/2/volts@25:0}} V and {{num:lt-example/2/amps@25}} A** (about {{num:lt-example/2/pw@25}} W), **with or without the LT**. The same box needs the same voltage to move the cone the same distance.

In the "watts" that amplifiers and simulators usually quote (V² ÷ Re), that's {{num:lt-example/2/vw@25}} W for the small box against {{num:lt-example/3/vw@25}} W for the big one: close to the driver's 350 W rating.

What the LT changes is that the extra voltage arrives automatically: its boost is in the signal. In the example, a 40 W setting is {{num:lt-example/1/vset}} V, but after the LT (and the high-pass filter) the amplifier is putting out **{{num:lt-example/1/vout@25}} V** at 25 Hz, and the cone is at {{num:lt-example/1/x}} mm. So the amplifier must be sized for the boosted bass, not for the passband. The app shows exactly what it needs: switch the **Max SPL** chart to **Volts** or **Amps**.

## How much boost, and how much power

The LT's boost at very low frequencies is **(f0 / fp)²**, or **40 × log10(f0 / fp)** in dB [2]:

| f0 → fp | Boost |
|---|---|
| {{num:lt-example/2/fc}} → 30 Hz | {{num:lt-example/2/boost@30}} dB |
| {{num:lt-example/2/fc}} → 25 Hz | **{{num:lt-example/2/boost@25}} dB** |
| {{num:lt-example/2/fc}} → 20 Hz | {{num:lt-example/2/boost@20}} dB |

Every 6 dB of boost needs **four times** the amplifier power and **twice** the cone excursion at those frequencies. A boost of {{num:lt-example/2/boost@25}} dB needs about {{num:lt-example/2/boostx@25}} times the power at the bottom of the range. A common limit is to keep the boost under about **12 dB** [6]: beyond that, the amplifier power and the excursion grow faster than the bass you gain.

## You need a subsonic filter

An LT boosts everything below fp, all the way down, so without a filter, rumble and subsonic content drive the cone far past its Xmax. Always put a **high-pass filter** below fp. In the example, the 24 dB/oct filter at 18 Hz keeps the cone at {{num:lt-example/1/x}} mm at 40 W. See [the subsonic filter guide](/guides/subsonic-filter/).

## Choosing f0, Q0, fp and Qp

**f0 and Q0** must describe the box as built, not the datasheet driver. Linkwitz's own method was to measure the impedance of the driver in its box and calculate f0 and Q0 from it [7]; the designer of a widely used LT spreadsheet found that getting f0 and Q0 right was the largest source of error in the whole process [8]. In the app, the EQ takes f0 and Q0 from the simulated box; once the box is built, measure it and enter the measured values.

**fp** is the new resonance. Lower goes deeper, and costs more boost (see the table above). A good target is where the boost stays around 12 dB, or a little above the lowest note you care about.

**Qp** shapes the corner:

- **0.707** gives the flattest response (Butterworth).
- **0.5** gives a gentler, more gradual roll-off with the least overshoot.
- **Higher than 0.707** gives a lift above fp, which some people use deliberately to offset a room. Rooms already add gain at the bottom, so in a room a slightly higher fp or a lower Qp often sounds right [9].

## Group delay

The LT changes the timing of the bass. In the example, group delay at 20 Hz rises from {{num:lt-example/2/gd@20:0}} ms to {{num:lt-example/1/gd@20:0}} ms, while at 40 Hz it falls from {{num:lt-example/2/gd@40:0}} ms to {{num:lt-example/1/gd@40:0}} ms (both with the 18 Hz high-pass filter, which adds most of the delay at 20 Hz). The peak delay is higher, but over the range that matters for music it's often improved, because the response is flatter there [2]. Either way, the LT's change of a few milliseconds at these frequencies is far below the delays shown to be audible in listening tests [10]. The [group delay guide](/guides/group-delay/) puts these numbers next to sealed and ported boxes.

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
