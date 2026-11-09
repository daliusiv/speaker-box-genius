---
title: "Power compression: why doubling your amplifier's watts doesn't give you +3 dB"
description: What a hot voice coil does to a subwoofer, how much output it costs at 120 °C and 180 °C, why the bass shape changes, what it does (and doesn't do) to cone excursion, and how much a bigger amplifier really gains.
path: guides/power-compression
image: power-compression.png
order: 21
group: measuring
---

# Power compression: why doubling your amplifier's watts doesn't give you +3 dB

Should you upgrade from a 500 W amplifier to a 1,000 or 1,500 W one? On paper, twice the power is +3 dB. In practice, a subwoofer played hard for a few minutes gets a lot less, because its voice coil heats up. Hot copper has a higher resistance, so the same amplifier voltage pushes less current and the cone less hard. This is **power compression**, and it changes more than the level: it reshapes the bass. Here's how much it costs, what manufacturers measure, and what a bigger amplifier really buys you.

[[Cold coil (20 °C)|coil-20]] [[Hot coil (120 °C)|coil-120]] [[Very hot coil (180 °C)|coil-180]]

## The short answer

- **A coil at 120 °C costs about 1–3 dB, and at 180 °C about 1–4 dB,** depending on frequency, for the same amplifier voltage.
- **The loss isn't even.** It's smallest near the box's impedance peaks and largest at the port tuning and above 80 Hz, so the bass gets a **relative hump of 1.3 dB at 120 °C and 2.3 dB at 180 °C** around 40–45 Hz. Nothing actually gets louder: everything else just drops more.
- **A hot coil doesn't make the cone move more.** At the same voltage it moves less; at the same loudness it moves exactly the same. It won't make you hit Xmax sooner.
- **Doubling the amplifier's power gives about +1.7 to +2.7 dB** of sustained output once the coil heats, not +3 dB. Short peaks, too brief to heat the coil, still get the full +3 dB.

## Why a hot coil loses output

A voice coil's copper resistance rises by about 0.393 % per °C [2]:

```
Re(hot) = Re(cold) × (1 + 0.00393 × (T − 20 °C))
```

| Coil temperature | Re rises by | Loss where Re dominates the impedance |
|---|---|---|
| 20 °C (datasheet) | — | — |
| 120 °C | 39 % | 2.9 dB |
| 180 °C | 63 % | 4.2 dB |
| 200 °C | 71 % | 4.7 dB |

An amplifier puts out a voltage, so a higher resistance means less current, and the cone's force is current × Bl. Where the impedance is mostly Re (above the bass, and at a ported box's tuning), the output falls by 20 × log of the resistance ratio [2][3]. Almost all the power a woofer takes becomes heat: drivers are typically under 5 % efficient [1].

Two things set how hot the coil gets: how much power it takes and how quickly it can lose heat. The coil heats up in seconds; the magnet and frame, which carry the heat away, take tens of seconds to minutes [4][5]. So the coil temperature follows the **average** power over the last little while, not each peak.

Above 200 °C the coil itself starts to fail [3].

## What manufacturers measure

Eighteen Sound lists power compression on its pro subwoofer datasheets: the loss of sensitivity from 50 to 500 Hz after 5 minutes of pink noise at a given power [6]:

| Driver | At −10 dB (10 % power) | At −3 dB (half power) | At full rated power |
|---|---|---|---|
| 18NLW9600, 18″, 1800 W AES | 0.7 dB | 1.3 dB | 2.2 dB [6] |
| 12″ driver from their bandpass kit, 900 W AES | 0.5 dB | 2.2 dB | 3.0 dB [7] |
| 18″ driver from their dual-sub kit, 1800 W AES | 0.6 dB | 2.0 dB | 3.4 dB [8] |

Reading those as coil temperatures with the formula above gives roughly **95–140 °C at full rated power**, for pro drivers with 4–5-inch coils and ventilated motors. (It's rough: the measurement averages over a band where the impedance isn't only Re.) So 120 °C is a realistic temperature for a subwoofer played hard at its rating, and 180 °C is a smaller coil, or a driver pushed past its rating.

The same table answers the amplifier question directly: going from half power to full power (twice the watts) gained **2.1, 2.2 and 1.6 dB**, not 3 dB. Ten times the power gained 7.2–8.5 dB, not 10.

## What a hot coil does to a ported subwoofer

The example: a **Dayton Audio RSS315HF-4** 12″ in a flat ported box (Keele's alignment, 83.5 L tuned to 23.8 Hz, 12.5 cm port), driven at the same **25 V** with the coil at 20, 120 and 180 °C. Turn on the temperature in **Settings → Voice coil °C**; the app's model matches Hornresp's Power Compression tool at 120 °C (see the [validation page](/validation/)).

![The RSS315HF-4 ported box at the same 25 V with the coil at 20 °C (blue), 120 °C (orange) and 180 °C (red): the level drops, and the shape gains a hump around 40–45 Hz.](img/power-compression.png)

**Loss at the same 25 V**

| Frequency | 20 °C | 120 °C | 180 °C |
|---|---|---|---|
| 20 Hz | 102.6 dB | −1.8 dB | −2.7 dB |
| 25 Hz (near the tuning) | 107.4 dB | **−2.3 dB** | **−3.4 dB** |
| 30 Hz | 108.5 dB | −1.4 dB | −2.1 dB |
| 40 Hz (upper impedance peak) | 108.9 dB | **−0.6 dB** | **−0.9 dB** |
| 50 Hz | 109.1 dB | −0.9 dB | −1.4 dB |
| 60 Hz | 109.4 dB | −1.4 dB | −2.2 dB |
| 80 Hz | 109.6 dB | −2.1 dB | −3.2 dB |
| 100 Hz | 109.8 dB | −2.5 dB | −3.7 dB |
| 150 Hz | 109.8 dB | **−2.8 dB** | **−4.1 dB** |

What it shows:

- **The loss follows the impedance.** Where the impedance is high (the peaks at 15 and 40 Hz), the coil's extra resistance is a small part of it, and little is lost. Where the impedance is low (the port tuning, where it falls to 3.9 Ω, and above 80 Hz), the extra resistance is most of it, and the loss approaches the full 2.9 or 4.2 dB.
- **So the shape changes.** Relative to 150 Hz, the cold box is flat; at 120 °C it has a **+1.3 dB** hump at 43 Hz, and at 180 °C **+2.3 dB** at 42 Hz. That's the "hot sub gets boomy" effect people hear in long sessions.
- **The hump is the driver's Q rising.** Bl doesn't change, so Qes rises with Re: for this driver from 0.45 to 0.63 at 120 °C and 0.73 at 180 °C, taking Qts from 0.39 to 0.51 and 0.58. A box designed for the cold Qts is now mistuned for the hot one. In a sealed box the same thing raises Qtc: for this driver in its 36 L Qtc 0.707 box, the small response peak grows from 0.3 dB cold to 0.7 dB at 120 °C and 1.2 dB at 180 °C (see the [Qtc guide](/guides/sealed-qtc/)).

## Does a hot coil make the cone hit Xmax sooner?

No, and this one is often said. At the same voltage, a hot coil drives the cone **less**: the peak above the tuning falls from 8.8 mm (cold) to 8.1 mm (120 °C) and 7.7 mm (180 °C) at 35 Hz, and it's lower at every frequency. Hornresp's Power Compression tool shows the same: displacement falls as the coil heats [9].

At the same **loudness**, the cone moves exactly as much as it did cold: the box turns cone movement into sound the same way whatever the coil temperature. So if you turn the amplifier up to win back the lost level, the excursion comes back with it, but never more than it would take cold for that level. The Xmax limit on the **Max SPL** chart doesn't move.

What does change is the **amplifier** side: getting the same output from a hot coil takes more voltage, and you may run out of amplifier before you run out of cone.

## So what does a bigger amplifier buy?

How much amplifier a sub needs in the first place, in volts and amps rather than watts, is in [matching an amplifier to your subwoofer](/guides/amp-matching/).

Here's a simple steady-state picture. The coil's temperature rise is proportional to the power it actually takes, and a hotter coil takes less power from the same voltage [1][2]. If 500 W of sustained drive (watts at the cold Re, as amplifier ratings count them) heats the coil to 120 °C, then 1,000 W heats it to about 185–190 °C, not 220 °C, because the hotter coil draws less. Using the 120 °C and 180 °C results above (180 °C slightly understates the loss):

| Frequency | Gain from 500 W to 1,000 W, sustained |
|---|---|
| 25 Hz | +1.9 dB |
| 40 Hz | +2.7 dB |
| 60 Hz | +2.2 dB |
| 100 Hz | +1.8 dB |
| 150 Hz | +1.7 dB |

That agrees with the Eighteen Sound measurements (+1.6 to +2.2 dB for twice the power near full rating) [6][7][8]. It's still a gain, and the bigger amplifier also gives:

- **Headroom on peaks.** Music and film have peaks far above the average. A kick drum or an explosion lasts a fraction of a second, too short to heat the coil [4], so peaks still get the full +3 dB, as long as the cone has excursion to spare, where the smaller amplifier would clip.
- **Less compression at the same level.** A bigger amplifier playing at the same volume as the small one isn't hotter; the gain is only in what you can add on top.
- **Not by rewiring.** Wiring a dual voice coil sub to 1 Ω only helps if the amplifier makes more power into the lower load, and the same coil heats the same way per watt (see [DVC wiring](/guides/dvc-wiring/)).

But past a point, more watts mostly make heat. For sustained output, these help more:

- **More cone and more coil.** Two drivers split the heat: each takes half the power and runs cooler (see [one 15″ or two 10″](/guides/one-15-vs-two-10s/)).
- **A more efficient alignment.** Every 3 dB of sensitivity halves the power, and the heat, for the same level. Big EQ boosts, such as a [Linkwitz Transform](/guides/linkwitz-transform/), cost a lot of power.
- **A subsonic filter.** Power below a ported box's tuning makes little sound and plenty of heat (see the [subsonic filter guide](/guides/subsonic-filter/)).
- **Drivers built for it.** Large coils, vented pole pieces and aluminium frames carry heat away; makers that publish compression figures let you compare [5][6].
- **DSP that compensates.** Some powered speakers model the coil's temperature and correct the level and EQ as it heats [2].

## Modelling it in the app

1. Design your box as usual (the app's default, 20 °C, is the datasheet's cold values, as WinISD uses).
2. In **Settings → Voice coil °C**, enter 100–130 °C for a subwoofer played hard at its rating, more for a driver pushed past it.
3. Look at the response (the shape, not just the level), and at the **Impedance** chart to see where the loss will be largest: where the impedance is lowest.
4. For a box that will be played hard for long periods, check it at both temperatures. A slightly lower-Q box when cold can sound right when hot.
5. A measurement that doesn't match after loud playing may simply be a warm coil; see [why a measurement doesn't match the simulation](/guides/simulation-vs-measurement/).

The temperature applies to every box in the project, so the example uses one link per temperature.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Twice the amplifier power is +3 dB" | For short peaks, yes. For sustained playing, about +1.6 to +2.7 dB once the coil heats [6][7][8]. |
| "A hot coil loses 1.5–3 dB" | At 120 °C: 0.6–2.8 dB depending on frequency. At 180 °C: 0.9–4.1 dB. |
| "A hot coil makes a mid-bass hump" | Yes, relative to the rest: +1.3 dB at 120 °C, +2.3 dB at 180 °C here, from the rising Qts. Absolute output still drops everywhere. |
| "A hot coil makes the cone unload and pass Xmax sooner" | No: at the same voltage the cone moves less; at the same loudness it moves the same [9]. |
| "Simulators can't show power compression" | WinISD uses cold values only; Hornresp has a Power Compression tool [9], and this app has **Voice coil °C**. |

## Sources

1. D. J. Button, "Heat Dissipation and Power Compression in Loudspeakers", *J. Audio Eng. Soc.* 40 (1/2), 32–41, February 1992: drivers are generally under 5 % efficient and turn almost all their input into heat. [AES E-Library](https://www.aes.org/e-lib/browse.cfm?elib=7059).
2. D. J. Button and P. R. Williams, [US patent 7,447,318](https://patents.google.com/patent/US7447318), "System for using digital signal processing to compensate for power compression of loudspeakers", 2008: R(T) = Rcold(1 + 0.00393 ΔT), heat from the coil current, and a thermal model used to correct the level as the coil heats.
3. Wikipedia, [Power compression](https://en.wikipedia.org/wiki/Power_compression): copper's resistance rising 72 % and sensitivity falling 4.7 dB from 20 to 200 °C, and coils failing above about 200 °C.
4. [US patent 10,219,074](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10219074), "Loudspeaker protection systems and methods": a voice coil's thermal time constant of the order of seconds, the magnet's tens of seconds.
5. Klippel, [Thermal analysis and heat transfer](https://www.klippel.de/know-how/measurements/power-handling-heat-dissipation/thermal-analysis-and-heat-transfer.html): thermal resistances and capacities of coil and magnet, and how venting and convection cool the coil.
6. Eighteen Sound, [18NLW9600 datasheet](https://www.loudspeakersplus.com/v/vspfiles/templates/driven/pdfs/18NLW9600.pdf): power compression of 0.7, 1.3 and 2.2 dB at −10 dB, −3 dB and full power, measured from 50 to 500 Hz after 5 minutes of pink noise.
7. Eighteen Sound, [Building an effective 12″ bandpass subwoofer](http://www.mikesound.com/stavba/MB-112BP/18sound_12BANDPASSKIT.pdf) (application note): its 12″ driver's power compression, 0.5, 2.2 and 3.0 dB.
8. Eighteen Sound, [18″ dual subwoofer application note](https://www.topservicepro.it/wp-content/uploads/2024/06/MyPS-18_dual_subwoofer_kit.pdf): its 18″ driver's power compression, 0.6, 2.0 and 3.4 dB.
9. diyAudio, [Hornresp power handling sims, response vs reality](https://www.diyaudio.com/community/threads/hornresp-power-handling-sims-response-vs-reality.275904/): Hornresp's author on its Power Compression tool, in which diaphragm displacement decreases as the coil temperature rises.
