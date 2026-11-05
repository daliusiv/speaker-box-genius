---
title: Why your measurement doesn't match the simulation
description: The real reasons a built speaker measures differently from its simulation (driver tolerances, losses, inductance, baffle step, the room and the measurement itself) and how to close the gap.
path: guides/simulation-vs-measurement
image: mismatch-spl.png
order: 11
---

# Why your measurement doesn't match the simulation

You simulated the box, built it carefully, measured it, and the curves don't match: the bass is lower than predicted, the tuning is off, or there's a hump that the simulator never showed. This happens to everyone. A box simulator is accurate (this one agrees with WinISD to within 0.01 dB, and with Hornresp for lines), but it simulates the inputs you gave it, under the conditions it assumes. Here are the gaps between those and your real speaker, roughly in order of how much they matter, and how to close each one.

[[Open the example: one box, two drivers from the same batch|mismatch-example]]

## The short answer

| Cause | Typical effect | How to check |
|---|---|---|
| Your driver isn't the datasheet driver | F3 off by 5–15 Hz, Qtc off by 0.1 | Measure the driver's T/S parameters |
| Baffle step (simulation in half space) | Bass 4–6 dB lower than predicted | Turn on **Baffle step** |
| Your room | Peaks and dips of 10–20 dB below about 300 Hz | Measure in the near field |
| How you measured | Near field reads up to 6 dB high in the bass | Know which space your measurement represents |
| The box isn't the box you simulated | Fb 2–3 Hz high, response slightly off | Work out the net volume |
| Box losses | 1–2 dB less around the tuning, F3 a few Hz higher | Fit Ql to the measured impedance |
| Voice-coil heating | 1–3 dB less at high power | Simulate a hot coil |
| Voice-coil inductance model | Upper bass and midrange off by a dB or so | Use L2R2 values, or measure |

## 1. Your driver isn't the datasheet driver

Datasheet values describe an average sample, measured one way. Production tolerances are wide: a typical factory tolerance for Fs is ±15 %, and Vas is commonly quoted to ±20–30 % [1]. Q values vary by up to ±20 % [2]. The suspension also softens as the driver breaks in, so Fs and Qts fall and Vas rises over the first hours of use [3].

How much does that matter? Take the worked example: a **Dayton Audio DSA215-8** in its QB3 ported box (16.2 L tuned to 39.8 Hz). Change one datasheet value at a time by a realistic amount, and the F3 moves like this:

| Driver | F3 | Response at 40 Hz |
|---|---|---|
| As the datasheet | 50.8 Hz | −6.4 dB |
| Fs 15 % higher | 64.9 Hz | −8.6 dB |
| Fs 15 % lower | 41.6 Hz | −3.8 dB |
| Vas 25 % lower | 43.5 Hz | −4.3 dB |
| Vas 25 % higher | 56.6 Hz | −8.0 dB |
| Qes 15 % higher | 49.1 Hz | −6.2 dB |
| Qes 15 % lower | 55.5 Hz | −6.6 dB |

![The same box with the datasheet driver (solid) and a sample with Fs 15 % higher (dashed): within tolerance, but with an F3 14 Hz higher.](img/mismatch-spl.png)

A driver that's within its tolerance can move the F3 of a ported box by more than 10 Hz. Small, tuned boxes like this QB3 alignment are the most sensitive; a big sealed box barely notices.

**How to close it:** measure your own driver. Under **Driver tools**, **Measure from an impedance sweep…** fits the T/S parameters from a free-air sweep made with DATS, REW, ARTA or similar, and a second sweep with a known added mass gives Vas. Measure after a few hours of use, at a low level, with the driver held firmly and well away from walls. To see how sensitive your design is, add your measured (or a ±15 %) driver with **Compare** and look at both curves at once.

## 2. Baffle step: the simulation is in half space

Box simulators, WinISD included, assume the speaker is mounted in an infinite wall ("half space", or 2π). A real free-standing speaker radiates into the whole room ("full space", 4π) at low frequencies, where the sound wraps around the cabinet, and into half space only at higher frequencies, where the baffle is large compared to the wavelength. The change between the two is the **baffle step**: up to 6 dB less bass, centred on a frequency set by the baffle's width [4].

For the example box on a 22 × 32 cm baffle, turning on **Baffle step** (on the Signal tab) lowers the response by **5.7 dB** at 40–60 Hz and 2.4 dB at 300 Hz, relative to the half-space simulation. That's a large part of most "my bass is weaker than predicted" complaints.

**How to close it:** turn on **Baffle step** and enter your baffle's size and the driver's position. Then either accept the step (a speaker near a wall gets much of it back), or compensate for it in the crossover or with EQ [4].

## 3. Your room

Below about 300 Hz, a room's reflections and standing waves dominate what you hear and measure. A measurement taken at the listening position will have peaks and dips of 10–20 dB that depend on where the speaker and microphone are, not on the box. No box simulation can predict them; room gain at the very bottom is the one effect you can model (on the Signal tab), and only roughly.

**How to close it:** don't judge the box from a room measurement. Measure in the near field (below), and use the room measurement for placement and room EQ afterwards.

## 4. How you measured

The standard way to measure the bass of a speaker in an ordinary room is the **near-field** method published by Don Keele: put the microphone almost touching the cone (and separately the port), where the speaker's own sound is far louder than the room's reflections [5]. Two things catch people out:

- **A near-field measurement is a half-space measurement.** It represents the speaker in an infinite baffle, so it doesn't include the baffle step. Compared with a far-field measurement it reads up to about 6 dB high in the bass [6]. So it should match the simulation **without** baffle step, and a far-field or in-room measurement should match the simulation **with** it.
- **The cone and the port must be added together properly.** For a ported box, measure the cone and the port separately in the near field, scale the port's level by the ratio of the areas (the square root of the port area over the cone area, as distance), and sum them with the right phase. Measurement programs such as REW and ARTA have tools for this.

Also measure at a low level (2.83 V or less), so the driver behaves like the small-signal model.

**How to close it:** in the app, load your measurement with the **Measured** card (an `.frd` file for response, `.zma` for impedance) and lay it over the simulation, matching the level in the passband.

## 5. The box isn't the box you simulated

The simulation uses the **net** inside volume: what's left after the driver, the port tube, the bracing and anything else inside. Builders often enter the gross inside volume, or the outside dimensions. For the example box:

| | Volume | Port tuning |
|---|---|---|
| As simulated | 16.2 L | 39.8 Hz |
| Minus the driver (0.87 L) | 15.3 L | 40.9 Hz |
| Minus the port tube (0.51 L) | 14.8 L | 41.6 Hz |
| Minus 5 % bracing | 14.1 L | 42.7 Hz |

Three Hertz of tuning error from volume alone. Stuffing works the other way: fibre in a box makes it act a little larger, by up to about 15–25 % for a sealed box filled with fibre, depending on the material and how densely it's packed (see the [box stuffing guide](/guides/box-stuffing/)).

**How to close it:** use the app's **volume calculator**: enter the inside dimensions and it subtracts the driver's displacement, the port, the bracing and the crossover board, then links the net volume to the design.

## 6. Box losses

Every box leaks a little air (through the driver's dust cap and surround, gaskets and terminal cups), absorbs some energy in its walls and stuffing, and loses some in the port. Small described these as three Q values: leakage QL, absorption QA and port loss QP [7]. A simulation needs a guess for them, and the usual guess (QL = 7 in the classic texts [8], 10 in WinISD and in this app) may not be your box.

For the example box, changing QL from 10 to 5 raises the F3 from 50.8 Hz to 55.3 Hz and costs about 1 dB around the tuning. See [the box losses guide](/guides/box-losses/) for the whole story, including how to measure your box's QL.

## 7. Voice-coil heating

At high power the voice coil heats up, its resistance rises, and the driver plays quieter and with a higher Q. A coil at 100 °C has about 30 % more resistance than at 20 °C. In the example, that's **1–2 dB less** output across the bass. It's called power compression, and it's why a speaker driven hard never quite reaches its simulated SPL.

**How to close it:** in **Settings**, set **Voice coil** to the temperature you expect (around 100–150 °C at sustained high power), and compare.

## 8. The voice-coil inductance model

A real voice coil isn't a simple inductor: eddy currents in the magnet's pole piece make its inductance fall and its losses rise with frequency [9]. The simple Le model in most simulators therefore gets the impedance and the response above a few hundred hertz somewhat wrong. Better models, such as L2R2 (an extra inductor and resistor) or Leach's (K, n) model [9], fit measurements far more closely. In the app, checked against measured Dayton drivers, the L2R2 model cut the impedance error between 1 and 5 kHz from 10–84 % down to 3–8 %.

For a subwoofer this barely matters. For a woofer crossed over at a few hundred hertz, it can matter by a dB or two.

**How to close it:** enter **L2** and **R2** if the datasheet gives them, or fit them from an impedance sweep; turn **Coil inductance** on in Settings.

## A checklist for matching

1. Measure your driver's T/S parameters, and use them.
2. Enter the **net** volume, from the volume calculator.
3. Measure the box's impedance and check that the tuning (the dip between the two peaks) matches the simulation; see [the port tuning guide](/guides/port-tuning/).
4. Fit the losses: adjust **Leak Ql** until the simulated impedance peaks match the measured ones.
5. Measure the response in the near field at 2.83 V, and compare it with the simulation **without** baffle step.
6. Then turn on baffle step (and room gain) to predict what you'll hear in the room.

[[Open the example|mismatch-example]]

## Sources

1. [Thiele/Small parameters](https://en.wikipedia.org/wiki/Thiele/Small_parameters), Wikipedia: typical factory tolerances (Fs ±15 %, Vas ±20–30 %).
2. Discussion of production tolerances by a driver designer (Fs about ±15 %, Q values up to ±20 %), [Midwest Audio Club forum](https://discourse.midwestaudio.club/t/mtmww-taoiseach/433?page=2).
3. GR Research, [Burn-in measurements](https://gr-research.com/228899-2/): Fs and Qts fall and Vas rises as drivers break in.
4. Rod Elliott, [Baffle Step Compensation](https://sound-au.com/bafflestep.htm), Elliott Sound Products.
5. D. B. Keele Jr., "Low-Frequency Loudspeaker Assessment by Nearfield Sound-Pressure Measurement", *J. Audio Eng. Soc.* 22 (3), 154–162, April 1974. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2774).
6. John Atkinson, [Harbeth M40.1 measurements](https://stereophile.com/content/harbeth-m401-loudspeaker-ja-november-2008), Stereophile: near-field measurements assume an infinite baffle and read up to about 6 dB high in the bass.
7. R. H. Small, "Vented-Box Loudspeaker Systems, Part I: Small-Signal Analysis", *J. Audio Eng. Soc.* 21 (5), 363–372, June 1973. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=1967).
8. Claus Futtrup, [Designing Loudspeaker Boxes](https://www.cfuttrup.com/blogspot/Book_05_Futtrup.pdf): the history of QL = 7 as a starting value.
9. W. M. Leach Jr., "Loudspeaker Voice-Coil Inductance Losses: Circuit Models, Parameter Estimation, and Effect on Frequency Response", *J. Audio Eng. Soc.* 50 (6), 442–450, 2002. [Author's page](https://leachlegacy.ece.gatech.edu/papers/vcinduc.html).
10. Speaker Box Genius [validation against WinISD and Hornresp](https://speakerboxgenius.com/validation/), and [the L2R2 comparison with measured drivers](https://github.com/daliusiv/speaker-box-genius/blob/main/docs/validation.md#l2r2-voice-coil-model-against-measured-drivers).
