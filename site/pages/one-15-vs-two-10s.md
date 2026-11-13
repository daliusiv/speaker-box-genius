---
title: "One 15-inch or two 10-inch subwoofers: which plays louder and deeper?"
description: One 15″ against two 10″ from the same series, in the same sealed and ported boxes on the same amplifier, in one project. Displacement against power handling against a 2 Ω load, with the maximum SPL chart that settles each forum claim.
path: guides/one-15-vs-two-10s
image: chart:subs-example/maxspl
order: 20
group: start
---

# One 15-inch or two 10-inch subwoofers: which plays louder and deeper?

It's one of the oldest subwoofer arguments. One side says two 10s are "faster" and have "more motor". The other says "there's no replacement for displacement": get the 15. Both are partly right, and which one wins depends on the frequency.

This guide puts one 15″ and two 10″ from the same Dayton Audio Reference series in the same boxes, on the same amplifier, in **one project**. The answer comes down to three numbers: cone displacement, power handling, and what a 2 Ω load asks of the amplifier.

[[Open the worked example|subs-example]] [[The two 10s wired in series|subs-series]]

## The short answer

| | One 15″ | Two 10″ (parallel, 2 Ω) |
|---|---|---|
| Below about 40 Hz | **+2.5 dB** (sealed): more displacement | |
| Above about {{fig:subs-difference/crossSealed:0}} Hz | | **up to +1.6 dB**: more power handling, more current |
| Near a ported box's tuning | same: the port is the limit | same |
| Sealed box for Qtc 0.707 | 133.3 L | **79.6 L** |
| On an amplifier not rated for 2 Ω (pair in series, sealed) | **+3.1 to +5.2 dB** | |

## The drivers

| | One RSS390HF-4 15″ | Two RSS265HF-4 10″, parallel |
|---|---|---|
| Cone area (Sd) | 829.6 cm² | 712.6 cm² (2 × 356.3) |
| Xmax (one way) | 14.0 mm | 12.3 mm |
| **Displacement (Sd × Xmax)** | **1.16 L** | **0.88 L** (2 × 0.44) |
| **Power handling (RMS)** | **500 W** | **700 W** (2 × 350) |
| Re / nominal impedance | 3.0 Ω / 4 Ω | 1.75 Ω / 2 Ω |
| Bl | 15 T·m | 11.43 T·m each |
| Motor strength (Bl²/Re) | 75 | 74.6 (2 × 37.3) |
| Moving mass (Mms) | 306 g | 240 g (2 × 120) |
| Fs / Qts | 19.5 Hz / 0.43 | 25.6 Hz / 0.45 |
| Vas | 212 L | 108 L (2 × 54) |
| Sensitivity, 2.83 V (Dayton) | 91.2 dB | 87.8 dB each |
| Cutout / depth | 356 / 178 mm | 235 / 137 mm each |

Figures from Dayton Audio [1][2][3]. Two identical drivers working together act like one driver with twice the cone area, moving mass and Vas, and the same Fs and Q [4][5]. Wired in parallel, the resistance halves and the power handling doubles [5].

Two things stand out before any simulation:

- **Two 10s have less cone area than one 15,** about as much as a single 14-inch driver. "Two 10s make 20 inches" is wrong by a long way.
- **The motors are equal.** Bl on its own isn't a fair comparison, because a coil with more turns has more Bl and more resistance. Bl²/Re (force for a given power) is the usual figure of merit; some makers list it as Bl/√Re [6]. It's 75 for the 15 and 74.6 for the pair.

## The two limits

A sub's maximum output at each frequency is set by whichever limit it hits first [7]:

- **Displacement.** For a given cone movement, output falls 12 dB per octave going down, so the deep bass is limited by Sd × Xmax. With 1.16 L against 0.88 L, the 15 can be **20 × log(1.16 / 0.88) ≈ 2.4 dB** louder where both reach Xmax.
- **Heat, and the amplifier.** Higher up, the cone moves less and the coil's power rating takes over: 700 W against 500 W is **10 × log(700 / 500) ≈ 1.5 dB** for the pair. Then the amplifier has its say, below.

## The worked example: one project

The 15″ is the main driver. The two 10″ are the **comparison driver** with their own count: **Driver → Compare: drivers 2**, **Compare: wiring In parallel**. They sit in the same two boxes:

- a **100 L sealed box**;
- a **150 L ported box tuned to 22 Hz**, with a 15 cm port 61.6 cm long. That's too long to fit straight in 150 L (the app flags it), so it needs an elbow or a run along the long wall.

A **24 dB/octave subsonic filter at 18 Hz** protects both. The amplifier is one channel of a **Crown XLS 1002**, rated 350 W into 4 Ω and 550 W into 2 Ω [8]. In **Settings → Work these out from the amp's ratings** that's **37.4 V** and **16.6 A**. The charts run at **28.3 V** (2.83 V + 20 dB), enough to show the limits without going past the amplifier.

![Both at 28.3 V in dB SPL: the 15″ solid, the two 10″ dashed; blue the 100 L sealed box, orange the 150 L ported box. The pair is about 2 dB louder at 80 Hz in either box.](chart:subs-example/spl)

**At the same voltage, the pair is louder: {{num:subs-example/3/spl@80}} against {{num:subs-example/1/spl@80}} dB at 80 Hz** in the sealed box. That's mostly not efficiency. Per watt they're within 0.2 dB (86.7 and 86.9 dB/W into Re, after the 0.1 Ω of amplifier and cable). The 2 Ω pair takes about 458 W from the same 28.3 V, the 15 about 267 W: 2.3 dB more power. In the same box the 15 goes deeper: F3 33.6 Hz (Qtc 0.77) against 40.0 Hz (Qtc 0.68), because its Vas is twice the pair's.

![Cone excursion at 28.3 V: the 15″ (solid) stays under its 14 mm Xmax in both boxes; the two 10″ (dashed) pass their 12.3 mm, {{num:subs-example/3/x}} mm at {{num:subs-example/3/xf}} Hz sealed and {{num:subs-example/4/x}} mm at {{num:subs-example/4/xf}} Hz ported.](chart:subs-example/excursion)

**At the same 28.3 V, the 10s run out of cone first.** On the **Excursion** chart each driver has its own Xmax line ("Xmax 14 · vs 12.3 mm"). The pair reaches {{num:subs-example/3/x}} mm at {{num:subs-example/3/xf}} Hz in the sealed box. The 15 reaches {{num:subs-example/1/x}} mm and has {{num:subs-example/1/xin}} mm in hand. The pair's extra current also pushes the shared port harder: {{num:subs-example/4/port}} m/s against {{num:subs-example/2/port}} m/s.

## Maximum output, and what stops each one

![Maximum SPL with each box's limit bars: filled markers for the 15″, outlined for the two 10″. Cone Xmax is red, port speed amber, the drivers' power rating grey, the amplifier teal.](chart:subs-example/maxspl)

The **Max SPL** chart lets each go to its first limit, and the four bars under it name the limit. Rows 1 and 2 are the 15 (sealed, ported); rows 3 and 4 are the pair.

**100 L sealed:**

| Frequency | One 15″ | Two 10″ | Difference |
|---|---|---|---|
| 20 Hz | {{num:subs-example/1/max@20}} dB ({{num:subs-example/1/limit@20}}) | {{num:subs-example/3/max@20}} dB ({{num:subs-example/3/limit@20}}) | **{{lead:subs-example/1/3/max@20|15″|10s| dB}}** |
| 25 Hz | {{num:subs-example/1/max@25}} dB ({{num:subs-example/1/limit@25}}) | {{num:subs-example/3/max@25}} dB ({{num:subs-example/3/limit@25}}) | {{lead:subs-example/1/3/max@25|15″|10s| dB}} |
| 30 Hz | {{num:subs-example/1/max@30}} dB ({{num:subs-example/1/limit@30}}) | {{num:subs-example/3/max@30}} dB ({{num:subs-example/3/limit@30}}) | {{lead:subs-example/1/3/max@30|15″|10s| dB}} |
| 35 Hz | {{num:subs-example/1/max@35}} dB ({{num:subs-example/1/limit@35}}) | {{num:subs-example/3/max@35}} dB ({{num:subs-example/3/limit@35}}) | {{lead:subs-example/1/3/max@35|15″|10s| dB}} |
| 40 Hz | {{num:subs-example/1/max@40}} dB ({{num:subs-example/1/limit@40}}) | {{num:subs-example/3/max@40}} dB ({{num:subs-example/3/limit@40}}) | {{lead:subs-example/1/3/max@40|15″|10s| dB}} |
| 45 Hz | {{num:subs-example/1/max@45}} dB ({{num:subs-example/1/limit@45}}) | {{num:subs-example/3/max@45}} dB ({{num:subs-example/3/limit@45}}) | {{lead:subs-example/1/3/max@45|15″|10s| dB}} |
| 50 Hz | {{num:subs-example/1/max@50}} dB ({{num:subs-example/1/limit@50}}) | {{num:subs-example/3/max@50}} dB ({{num:subs-example/3/limit@50}}) | {{lead:subs-example/1/3/max@50|15″|10s| dB}} |
| 60 Hz | {{num:subs-example/1/max@60}} dB ({{num:subs-example/1/limit@60}}) | {{num:subs-example/3/max@60}} dB ({{num:subs-example/3/limit@60}}) | {{lead:subs-example/1/3/max@60|15″|10s| dB}} |
| 80 Hz | {{num:subs-example/1/max@80}} dB ({{num:subs-example/1/limit@80}}) | {{num:subs-example/3/max@80}} dB ({{num:subs-example/3/limit@80}}) | **{{lead:subs-example/1/3/max@80|15″|10s| dB}}** |

**150 L ported, 22 Hz:**

| Frequency | One 15″ | Two 10″ | Difference |
|---|---|---|---|
| 20 Hz | {{num:subs-example/2/max@20}} dB ({{num:subs-example/2/limit@20}}) | {{num:subs-example/4/max@20}} dB ({{num:subs-example/4/limit@20}}) | {{lead:subs-example/2/4/max@20|15″|10s| dB}} |
| 25 Hz | {{num:subs-example/2/max@25}} dB ({{num:subs-example/2/limit@25}}) | {{num:subs-example/4/max@25}} dB ({{num:subs-example/4/limit@25}}) | {{lead:subs-example/2/4/max@25|15″|10s| dB}} |
| 30 Hz | {{num:subs-example/2/max@30}} dB ({{num:subs-example/2/limit@30}}) | {{num:subs-example/4/max@30}} dB ({{num:subs-example/4/limit@30}}) | **{{lead:subs-example/2/4/max@30|15″|10s| dB}}** |
| 40 Hz | {{num:subs-example/2/max@40}} dB ({{num:subs-example/2/limit@40}}) | {{num:subs-example/4/max@40}} dB ({{num:subs-example/4/limit@40}}) | {{lead:subs-example/2/4/max@40|15″|10s| dB}} |
| 45 Hz | {{num:subs-example/2/max@45}} dB ({{num:subs-example/2/limit@45}}) | {{num:subs-example/4/max@45}} dB ({{num:subs-example/4/limit@45}}) | {{lead:subs-example/2/4/max@45|15″|10s| dB}} |
| 60 Hz | {{num:subs-example/2/max@60}} dB ({{num:subs-example/2/limit@60}}) | {{num:subs-example/4/max@60}} dB ({{num:subs-example/4/limit@60}}) | {{lead:subs-example/2/4/max@60|15″|10s| dB}} |
| 80 Hz | {{num:subs-example/2/max@80}} dB ({{num:subs-example/2/limit@80}}) | {{num:subs-example/4/max@80}} dB ({{num:subs-example/4/limit@80}}) | **{{lead:subs-example/2/4/max@80|15″|10s| dB}}** |

(1 m, half space.)

![Who plays louder, and where: the 15″'s maximum SPL minus the pair's. The sealed ({{fig:subs-difference/sealedColor}}) and ported ({{fig:subs-difference/portedColor}}) curves cross zero at {{fig:subs-difference/crossSealed:0}} Hz; the pair wired in series (dashed) never gets near.](figure:subs-difference)

The difference chart puts the tables in one picture:

- **Displacement wins the deep bass.** Sealed, the 15 is {{fig:subs-difference/sealedLead}} dB ahead from 18 to 31 Hz, the displacement ratio, until the amplifier caps it.
- **The lines cross at {{fig:subs-difference/crossSealed:0}} Hz** in both boxes.
- **The pair's lead peaks at about {{fig:subs-difference/pairLead}} dB around {{fig:subs-difference/pairLeadF:0}} Hz.** That's where it reaches the amplifier's 16.6 A and the lead starts to shrink.
- **Near the tuning the port decides.** From 18 to 26 Hz both are port-limited and identical, because they share the port. A bigger port helps both (see the [port chuffing guide](/guides/port-chuffing/)).

## What the 2 Ω load does to the amplifier

![Amplifier current needed for maximum SPL: the pair (dashed) reaches the amplifier's 16.6 A from about 93 Hz up; the 15″ (solid) peaks near 12 A.](chart:subs-example/maxamps)

An amplifier puts out a voltage; the load decides the current, and so the power [9]. The **Max SPL → Amps** view shows it:

- **The 15 can't use its rating on this amp.** 500 W into its 3 Ω coil needs 38.7 V; the Crown stops at 37.4 V. From 32 Hz up the 15 is amplifier-limited (teal), at about 367 W at 80 Hz, drawing 10.6 A.
- **The pair reaches its own 700 W rating first** (grey), drawing 15.2 A and 471 W at 80 Hz. It only hits the amp's 16.6 A above about 93 Hz.
- **Real amplifiers don't double into half the impedance.** An ideal one would give 700 W into 2 Ω; the Crown gives 550 W [8].
- **Wired in series (8 Ω), the pair loses.** On the same amp it's voltage-limited almost everywhere: 110.2 dB at 80 Hz sealed, **3.7 dB below the 15** and 5.2 dB below the parallel pair. That's the second link above, and the dashed line on the difference chart.

The same goes for the two coils of one dual voice coil sub: see [DVC wiring](/guides/dvc-wiring/), and the [amplifier matching guide](/guides/amp-matching/) for the voltage and current limits in detail.

## Forum myths, checked

**"There's no replacement for displacement."** True where the cone is the limit: below about 40 Hz here, the 15 is 2.5 dB ahead in the sealed box, exactly 20·log(1.16/0.88). Above {{fig:subs-difference/crossSealed:0}} Hz it's power and the amplifier, and displacement doesn't help [7]. *Proof: Max SPL bars, red against grey and teal.*

**"Two 10s have more cone area than a 15."** No: 713 against 830 cm². Two 10s add up to about one 14-inch driver. *Proof: the driver table; Sd on the Driver tab.*

**"Two 10s have more motor."** No: Bl²/Re 74.6 against 75 [6]. Each 10's Bl is lower; there are just two of them sharing the power. Per watt the two are within 0.2 dB. *Proof: in dB SPL at the same voltage the passbands are 2.5 dB apart: 2.3 dB from the extra watts the 2 Ω load draws, 0.2 dB of efficiency.*

**"Two 10s are faster."** Not in any way that matters below a sub's crossover. The motors are equal, and moving mass per cone area is similar (0.34 against 0.37 g/cm²). How "fast" a sub sounds is its frequency response and group delay, set by the box and the filters, not cone mass (see the [group delay guide](/guides/group-delay/)). In the same box the pair has the lower Qtc, 0.68 against 0.77, so a slightly better-damped roll-off but 6.2 Hz less extension. Put the 15 in its own 133.3 L box and that difference goes. *Proof: Group delay tab.*

**"Two subs at 2 Ω get double the power."** Only from an amplifier rated for 2 Ω, and real ones don't double: 350 W into 4 Ω becomes 550 W into 2 Ω on this Crown [8]. Wire the pair in series for an amp that isn't, and in the sealed box the 15 wins everywhere, by 3.1–5.2 dB. *Proof: Max SPL → Amps; the series link.*

## Choosing

| If you want… | Choose |
|---|---|
| The most output below 40 Hz (movies, organ, EDM sub-bass) | **The 15** |
| The most output from 45 to 85 Hz (kick drums, upper-bass SPL) | **The two 10s,** on an amplifier rated for 2 Ω |
| A smaller sealed box at Qtc 0.707 | **The two 10s** (79.6 L against 133.3 L) |
| A shallow mounting depth (car doors, under-seat, slim cabinets) | **The two 10s** (137 mm against 178 mm) |
| An amplifier that isn't rated for 2 Ω | **The 15**, or two 8 Ω 10s (such as the RSS265HF-8) in parallel for 4 Ω |

In a car, cabin gain lifts the deep bass, which can make the pair's upper-bass advantage matter more; see the [car subwoofer guide](/guides/car-subwoofer/). At home, room modes matter more than either driver, and for the deep bass more displacement (a bigger driver, or more drivers) is the only real answer [7].

## Doing it in the app

1. Pick the 15″ on the **Driver** tab and add the boxes you can build on **Boxes**.
2. Next to **Compare**, pick the 10″. Then set **Compare: drivers** to **2** and **Compare: wiring** to **In parallel**. The summary and every chart label say "2 × RSS265HF-4". **Same as main** puts it back to a like-for-like count.
3. In **Settings**, open **Work these out from the amp's ratings** and enter your amplifier's two ratings (here 350 W into 4 Ω, 550 W into 2 Ω). That fills **Amp max volts** and **Amp max current**.
4. Open **Max SPL**. The bars name the first limit for each box and each driver; **Volts** and **Amps** show what the amplifier has to deliver.
5. **Swap** (⇅) makes the pair the main driver, with its count, for example to **Size all** for it.

To compare two drivers in the same count, see the [compare drivers guide](/guides/compare-drivers/). For what Sd, Xmax and Vas mean, see the [Thiele/Small parameters guide](/guides/thiele-small-parameters/).

[[Open the worked example|subs-example]] [[The two 10s wired in series|subs-series]]

## Sources

1. Dayton Audio, [RSS390HF-4 15″ Reference HF Subwoofer 4 Ohm](https://www.daytonaudio.com/product/126/rss390hf-4-15-reference-hf-subwoofer-4-ohm) and its [specification sheet](https://www.daytonaudio.com/images/resources/295-468-dayton-audio-rss390hf-4-specifications-46176.pdf).
2. Dayton Audio, [RSS265HF-4 10″ Reference HF Subwoofer 4 Ohm](https://www.daytonaudio.com/product/118/rss265hf-4-10-reference-hf-subwoofer-4-ohm) and its [specification sheet](https://www.daytonaudio.com/images/resources/295-460-dayton-audio-rss265hf-4-specifications-46172.pdf).
3. Parts Express listings for the [RSS390HF-4](https://www.parts-express.com/Dayton-Audio-RSS390HF-4-15-Reference-Series-HF-Subwoofer-4-Ohm-295-468) and [RSS265HF-4](https://www.parts-express.com/Dayton-Audio-RSS265HF-4-10-Reference-Series-HF-Subwoofer-4-Ohm-295-460): power handling, sensitivity, Xmax and Sd.
4. "Fast Reply", *Speaker Builder* 3/1990, [PDF](https://www.worldradiohistory.com/Archive-All-Audio/Speaker-Buider/Speaker-Builder-1990-03.pdf): two identical drivers in series or parallel act as one driver with the same Fs and Qs and twice the Vas.
5. Audiojudgement, [Isobaric subwoofer box design](https://audiojudgement.com/isobaric-subwoofer-box-design/): what changes when two identical drivers are wired in parallel (Sd, Vas and power handling double, Re halves, Fs and Qts unchanged).
6. Scan-Speak, [26W/8867T00 datasheet](https://www.toutlehautparleur.com/media/catalog/product/datasheet/scanspeak/26W_8867T00-8.pdf): a manufacturer listing Bl/√Re as a motor-strength figure.
7. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 798–808, December 1972: a system's acoustic power capacity depends on its frequency response and the volume of air the cone can displace. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2022).
8. Crown XLS 1002 specifications, [Full Compass](https://www.fullcompass.com/prod/282613-crown-xls1002-xls-1002): 215 W into 8 Ω, 350 W into 4 Ω, 550 W into 2 Ω per channel.
9. Talkbass, [4 ohm louder than 2 ohm?](https://www.talkbass.com/threads/4-ohm-louder-than-2-ohm.1687246/): an amplifier's rated voltage and current at each load, worked out from its ratings, and why power doesn't simply double into half the impedance.
