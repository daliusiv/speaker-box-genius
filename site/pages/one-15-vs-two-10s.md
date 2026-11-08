---
title: "One 15-inch or two 10-inch subwoofers: which plays louder and deeper?"
description: One 15″ against two 10″ from the same series, in the same sealed and ported boxes on the same amplifier, worked out from displacement, power handling and the 2 Ω load, with maximum SPL charts you can open and change.
path: guides/one-15-vs-two-10s
image: subs-maxspl.png
order: 20
group: start
---

# One 15-inch or two 10-inch subwoofers: which plays louder and deeper?

It's one of the oldest subwoofer arguments. One side says two 10s are "faster" and have "more motor". The other says "there's no replacement for displacement": get the 15. Both are partly right, and the answer depends on the frequency. Here's one 15″ and two 10″ from the same Dayton Audio Reference series, in the same boxes, on the same amplifier, with the numbers that decide it: cone displacement, power handling and what a 2 Ω load does to the amplifier.

[[Open the 15″|subs-one-15]] [[Open the two 10″|subs-two-10s]]

## The short answer

- **Below about 40 Hz, the 15 plays louder.** There the cone hits its excursion limit first, and the 15 moves about 32 % more air than the two 10s together: about **2.5 dB** more output.
- **Above about 45 Hz, the two 10s play louder.** There heat and the amplifier set the limit, and two 350 W drivers take more power than one 500 W driver: up to about **1.7 dB** more, growing with frequency.
- **Two 10s have the same motor strength as the 15, not more,** and they aren't "faster" (see below).
- **Wired in parallel, the two 10s are a 2 Ω load.** They pull more power from the same amplifier, but only from one rated for 2 Ω. Wired in series (8 Ω) they lose 4–6 dB on the same amplifier.
- **In a ported box, near the tuning the port sets the limit,** and both choices are the same there.

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
| Sensitivity, 2.83 V | 91.2 dB | 87.8 dB each |
| Cutout / depth | 356 / 178 mm | 235 / 137 mm each |

Figures from Dayton Audio's specifications [1][2][3]. Two identical drivers working together behave like one driver with twice the cone area, moving mass and Vas, and the same Fs and Q [4][5]; wired in parallel, the resistance halves and the power handling doubles [5].

Two things stand out before any simulation:

- **Two 10s have less cone area than one 15,** about as much as a single 14-inch driver (a 30 cm piston, against the 15's 32.5 cm). "Two 10s make 20 inches" is wrong by a long way.
- **The motors are equal.** Bl alone isn't a fair comparison, because a coil with more turns has more Bl and more resistance; Bl²/Re (force for a given power) is the usual figure of merit, and some makers list it, as Bl/√Re, on their datasheets [6]. Here it's 75 for the 15 and 74.6 for the pair.

## The two limits

A subwoofer's maximum output at each frequency is set by whichever limit it reaches first [7]:

- **Displacement.** At low frequencies, output for a given cone movement falls by 12 dB per octave, so the deep bass is limited by how much air the cone can move: Sd × Xmax [7]. With 1.16 L against 0.88 L, the 15 can be **20 × log(1.16 / 0.88) ≈ 2.4 dB** louder where both hit Xmax.
- **Heat.** Higher up, the cone moves less and the coil's power rating takes over. With about the same efficiency per watt (equal motors), 700 W against 500 W is **10 × log(700 / 500) ≈ 1.5 dB** in favour of the pair. (At sustained high power both coils heat and lose some of that; see the [power compression guide](/guides/power-compression/).)

Where the change-over falls depends on the box and the amplifier. That's what the **Max SPL** chart shows.

## The same box, the same amplifier

Both are simulated in a **100 L sealed box** and a **150 L ported box tuned to 22 Hz** (15 cm port), behind an 18 Hz, 24 dB/octave subsonic filter (see the [subsonic filter guide](/guides/subsonic-filter/)). The amplifier is one channel of a **Crown XLS 1002**, rated 350 W into 4 Ω and 550 W into 2 Ω [8]. In the app's **Settings** that's an output limit of **37.4 V** (from 350 W into 4 Ω) and **16.6 A** (from 550 W into 2 Ω).

![Maximum SPL of one 15″ (blue) and two 10″ in parallel (orange) on the same amplifier, in the 100 L sealed box and the 150 L ported box.](img/subs-maxspl.png)

**100 L sealed** (one 15″ Qtc 0.76, F3 34 Hz; two 10″ Qtc 0.65, F3 42 Hz):

| Frequency | One 15″ | Two 10″ | Difference |
|---|---|---|---|
| 20 Hz | 101.8 dB (Xmax) | 99.3 dB (Xmax) | **15″ +2.5 dB** |
| 25 Hz | 105.7 dB (Xmax) | 103.2 dB (Xmax) | 15″ +2.5 dB |
| 30 Hz | 108.9 dB (Xmax) | 106.4 dB (Xmax) | 15″ +2.5 dB |
| 35 Hz | 110.9 dB (amp) | 109.1 dB (Xmax) | 15″ +1.8 dB |
| 40 Hz | 112.1 dB (amp) | 111.4 dB (Xmax) | 15″ +0.7 dB |
| 45 Hz | 112.9 dB (amp) | 113.4 dB (power) | 10s +0.5 dB |
| 50 Hz | 113.4 dB (amp) | 114.1 dB (power) | 10s +0.7 dB |
| 60 Hz | 113.9 dB (amp) | 115.0 dB (power) | 10s +1.1 dB |
| 80 Hz | 114.2 dB (amp) | 115.8 dB (power) | **10s +1.6 dB** |

**150 L ported, 22 Hz** (F3 22 Hz for both):

| Frequency | One 15″ | Two 10″ | Difference |
|---|---|---|---|
| 20 Hz | 106.5 dB (port) | 106.5 dB (port) | same |
| 25 Hz | 112.3 dB (port) | 112.3 dB (port) | same |
| 30 Hz | 114.6 dB (amp) | 113.0 dB (Xmax) | **15″ +1.6 dB** |
| 35 Hz | 115.1 dB (amp) | 113.5 dB (Xmax) | 15″ +1.6 dB |
| 40 Hz | 115.2 dB (amp) | 114.6 dB (Xmax) | 15″ +0.6 dB |
| 45 Hz | 115.1 dB (amp) | 115.8 dB (power) | 10s +0.7 dB |
| 60 Hz | 114.9 dB (amp) | 116.1 dB (power) | 10s +1.2 dB |
| 80 Hz | 114.6 dB (amp) | 116.3 dB (power) | **10s +1.7 dB** |

(1 m, half space. The label is the limit reached first: cone **Xmax**, the coil's **power** rating, the **amp**lifier, or the **port**'s air speed.)

What it shows:

- **Displacement wins the deep bass.** In the sealed box the 15 is 2.5 dB ahead from 20 to 30 Hz, exactly the displacement ratio. The two lines cross at about 43 Hz in both boxes.
- **Power wins the upper bass.** From 45 Hz up, the pair is ahead by up to 1.6–1.7 dB.
- **Near the tuning of a ported box, the port is the limit.** At 20–25 Hz both are limited by the port's air speed, and since they share the port, they're identical. A bigger port helps both equally (see the [port chuffing guide](/guides/port-chuffing/)).
- **The ported box narrows the 15's lead** (1.6 dB at 30 Hz instead of 2.5 dB), because the port takes over the deepest bass and the cone moves least near the tuning.
- **In the same box, the 15 plays deeper but the 10s are better damped.** The 15's Vas is twice the pair's, so in 100 L sealed it sits at Qtc 0.76 and F3 34 Hz, the pair at Qtc 0.65 and F3 42 Hz. For Qtc 0.707 the 15 wants about 124 L and the pair about 75 L (see the [Qtc guide](/guides/sealed-qtc/)).

![The app's Max SPL chart for the two 10″ in both boxes, with the limit bands: cone Xmax (red), port speed (orange), the drivers' power rating (grey) and the amplifier (teal).](img/subs-two-10s-maxspl.png)

## What the 2 Ω load does to the amplifier

"Same amplifier power" hides the most important difference. An amplifier puts out a voltage; the load decides how much current, and so power, it draws [9].

- **Same voltage, more power.** Two 4 Ω drivers in parallel have half the resistance of one, so at the same voltage they draw about twice the current. At 2.83 V the pair plays about 2 dB louder than the 15 in the same box (93.9 against 91.8 dB at 80 Hz), not because it's more efficient (per watt they're within 0.2 dB) but because it takes more watts.
- **Real amplifiers don't double.** An ideal amplifier would give twice the power into half the impedance. The Crown gives 350 W into 4 Ω and 550 W into 2 Ω, not 700 W [8]: its voltage sags and its current is limited [9].
- **On this amplifier, the 15 can't use its rating.** 500 W into the 15's 3 Ω coil needs 38.7 V; the amplifier stops at 37.4 V, so from 35 Hz up the 15 is limited by the amplifier's voltage, short of its rating (about 375 W real power at 80 Hz). The pair reaches its own 700 W rating first, drawing up to about 16 A and 500 W at 80 Hz, and becomes current-limited only above about 85 Hz. That's where the pair's 1.6 dB lead in the upper bass comes from.
- **Only if the amplifier is rated for 2 Ω.** Many plate amplifiers and home-theatre receivers aren't. Wired in **series** (8 Ω) instead, the same pair on the same amplifier is amplifier-limited everywhere above the port's range: 110.3 dB at 80 Hz in the sealed box, **3.9 dB below the 15** and 5.5 dB below the parallel pair.

To try it, set **Amp max volts** and **Amp max current** in **Settings** from your amplifier's 4 Ω and 2 Ω ratings (volts = √(watts × 4 Ω) from the 4 Ω rating, amps = √(watts ÷ 2 Ω) from the 2 Ω rating), and open the **Max SPL** chart's **Volts** and **Amps** views.

## "Two 10s are faster"

They aren't, in any way that matters below a subwoofer's crossover:

- **The motors are the same strength** (Bl²/Re 74.6 against 75), and moving mass per cone area is similar (0.34 against 0.37 g/cm²).
- **How "fast" a woofer sounds is set by its frequency response:** its bandwidth and the shape of its roll-off, not cone mass. A sub low-passed at 80 Hz can't be faster than its low-pass filter. The [group delay guide](/guides/group-delay/) covers this in detail.
- **In the same box, the pair has the lower Qtc** (0.65 against 0.76), so it does have a slightly better-damped roll-off, but also less deep bass. Put the 15 in its own 124 L box and the difference goes away.

## Choosing

| If you want… | Choose |
|---|---|
| The most output below 40 Hz (movies, organ, EDM sub-bass) | **The 15** |
| The most output from 45 to 80 Hz (kick drums, car SPL in the upper bass) | **The two 10s,** on an amplifier rated for 2 Ω |
| A smaller sealed box at Qtc 0.707 | **The two 10s** (about 75 L against 124 L) |
| A shallow mounting depth (car doors, under-seat, slim cabinets) | **The two 10s** (137 mm against 178 mm) |
| An amplifier that isn't rated for 2 Ω | **The 15**, or two 8 Ω 10s (such as the RSS265HF-8) in parallel for 4 Ω |

In a car, cabin gain lifts the deep bass, which favours the pair's upper-bass output in many installs; see the [car subwoofer guide](/guides/car-subwoofer/). At home, room modes matter more than either driver; and for the deep bass, more displacement (a bigger driver, or more drivers) is the only real answer [7].

## Doing it in the app

1. Pick the 15″ on the **Driver** tab and size your boxes. Open the **Max SPL** chart: the band underneath shows which limit applies at each frequency.
2. Enter your amplifier's limits in **Settings** (see above).
3. For the pair, pick the 10″ and set **Drivers** to 2 and **Wiring** to parallel. Keep the boxes the same.
4. Compare the two projects' Max SPL charts, or open the two example links above.

The **Compare with…** driver keeps the main driver's count and wiring so the comparison is like for like, so one 15 against two 10s takes two projects (or two links) rather than Compare. To compare two drivers in the same count, see the [compare drivers guide](/guides/compare-drivers/), and for what Sd, Xmax and Vas mean, the [Thiele/Small parameters guide](/guides/thiele-small-parameters/).

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "There's no replacement for displacement" | True where the cone hits Xmax: below about 40 Hz here, the 15 is 2.5 dB ahead [7]. |
| "Two 10s have more cone area than a 15" | No: 713 against 830 cm². Two 10s are about one 14-inch driver. |
| "Two 10s have more motor force" | No: Bl²/Re 74.6 against 75 [6]. Each 10's Bl is lower; there are just two of them sharing the power. |
| "Two 10s are faster" | No: same motor strength; "speed" is frequency response ([group delay guide](/guides/group-delay/)). |
| "Two 10s handle more power" | Yes: 700 W against 500 W, worth up to about 1.5 dB where heat is the limit. |
| "Two subs at 2 Ω get double the power" | Only from an amplifier rated for 2 Ω, and real ones don't double: 350 W → 550 W here [8]. |

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
