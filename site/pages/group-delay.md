---
title: "Are ported boxes slow or boomy? Group delay explained"
description: Why "sealed is fast, ported is slow" keeps coming up, what group delay really is, how a sealed box, a ported box tuned high and one tuned low compare in group delay, step response and ringing, and what listening tests say you can hear.
path: guides/group-delay
image: group-delay.png
order: 19
group: ported
---

# Are ported boxes slow or boomy? Group delay explained

Every week someone on r/BudgetAudiophile, r/hometheater or r/CarAV says they only build sealed boxes, because ported boxes are "slow and muddy" for music and sealed boxes have "fast transient response". Someone else replies that cone mass doesn't make a woofer slow, and that what people hear is group delay and the room. Both have a point, and the numbers settle most of it. Here's one 12-inch subwoofer in three boxes, with the group delay, the step response and how long each box keeps sounding after a note stops, and what listening tests say about hearing it.

[[Open the three boxes|group-delay]]

## The short answer

- **A woofer isn't slow because its cone is heavy.** How quickly a speaker responds is set by its frequency response: its bandwidth and the shape of its roll-off [4].
- **Ported boxes do have more group delay than sealed ones,** but it's concentrated around the port tuning. Where that lands decides everything.
- **A ported box tuned low** (here 23.8 Hz) has its delay peak at about 22 Hz, below most music. From 40 Hz up it's within about 1.6 ms of the sealed box.
- **A ported box tuned high** (here 42 Hz) puts a 15–18 ms delay peak, a +5 dB response peak and about 20 ms of extra ringing right where kick drums and bass lines live. That's the "boomy" ported box people remember.
- **Whether box-sized delays are audible is uncertain.** The one listening study aimed at ported-box bass put the average threshold at about 7 ms [9]; the room usually rings for far longer than any box [13].

## "Fast" isn't about cone mass

The idea that a heavy cone makes "slow bass" has been tested directly. Paul Spencer stuck magnets onto a 12-inch woofer's cone: the sensitivity dropped by about 3 dB, but the rise of the impulse response was essentially unchanged. What did slow it down was narrowing the bandwidth: a series inductor, or a low-pass filter that matched it, delayed the rise in the same way. A steep 40 Hz low-pass pushed the impulse peak to about 5.7 ms, about as much as moving the woofer two metres further away [4].

A woofer in its working range is a minimum-phase system: its timing follows from its frequency response. In the same test, an inductor and a low-pass filter with the same frequency response gave nearly identical impulse responses [4]. So "fast" and "slow" are really about the **response**: how far up the sub plays before its low-pass, how it rolls off at the bottom, and whether it has peaks.

## What group delay is

**Group delay** is how much later each frequency arrives than it would through a perfectly flat system, worked out from how quickly the phase turns with frequency [5]. It isn't a delay of the whole sound, and it doesn't mean the note starts late: it says how much the envelope of a narrow band of frequencies around that point is shifted [5].

Every speaker has some, because every speaker rolls off at the bottom:

- **A sealed box** rolls off as a 2nd-order high-pass, 12 dB/octave [2]. Its group delay rises gently and smoothly as the frequency falls.
- **A ported box** rolls off as a 4th-order high-pass, 24 dB/octave, because the port is a second resonance [1]. The phase turns twice as far, and the group delay has a **peak** slightly below the port tuning [3].

Milliseconds alone are misleading in the bass: one cycle at 40 Hz lasts 25 ms. So group delay is often quoted in **cycles** as well: milliseconds × frequency ÷ 1000 [10].

## The three boxes

A **Dayton Audio RSS315HF-4** 12-inch subwoofer (Fs 24.2 Hz, Qts 0.39, Vas 84 L) in:

1. **Sealed, Qtc 0.707:** 36.3 L.
2. **Ported, tuned high:** 50 L at 42 Hz, the kind of small, punchy box often built for cars.
3. **Ported, tuned low:** Keele's flat alignment for this driver, 83.5 L at 23.8 Hz.

(Thiele's textbook QB3 stops at a Qts of about 0.38, and Keele's alignment is the textbook flat box above it. The app's QB3 preset, sized as WinISD sizes it, gives this driver a slightly smaller box, 75.6 L at 24.4 Hz; see the [sealed, ported or passive radiator guide](/guides/sealed-vs-ported/).) Both ports are 10 cm tubes, and the drive is 50 W, so neither port goes over the chuffing line.

| | Sealed | Ported, tuned high | Ported, tuned low |
|---|---|---|---|
| Box | 36.3 L | 50 L, 42 Hz | 83.5 L, 23.8 Hz |
| F3 | 46.4 Hz | 35.2 Hz | 23.3 Hz |
| Response peak | none | **+5.4 dB at 51 Hz** | none |
| Group delay at 25 Hz | 6.0 ms | 9.4 ms | 25.2 ms |
| at 30 Hz | 6.0 ms | 10.0 ms | 15.5 ms |
| at 40 Hz | 5.5 ms (0.22 cycle) | **15.4 ms (0.62 cycle)** | 7.1 ms (0.28 cycle) |
| at 50 Hz | 4.7 ms | **15.1 ms** | 4.5 ms |
| at 60 Hz | 3.8 ms | 7.5 ms | 3.2 ms |
| at 80 Hz | 2.4 ms | 2.9 ms | 2.0 ms |
| Peak group delay | about 6–7 ms, rising slowly below 20 Hz | **17.6 ms at 45 Hz** | **29.0 ms at 21.6 Hz** |

![Group delay of the sealed box (blue), the ported box tuned high (orange) and the ported box tuned low (light orange).](img/group-delay.png)

What it shows:

- **The low-tuned box has the biggest peak of the three,** 29 ms, but at 22 Hz. From 40 Hz up it's within 1.6 ms of the sealed box, and above 45 Hz it's slightly *lower*, because it's flat there while the sealed box is already rolling off.
- **The high-tuned box puts its peak in the middle of the bass:** 15–18 ms from 40 to 50 Hz, where a kick drum's weight sits (roughly 40–100 Hz [14]). It also has a +5.4 dB hump at 51 Hz. That combination is the "one-note" ported box.
- **Sealed is lowest below 40 Hz,** as you'd expect: it rolls off earliest and most gently.

You'll see posts claiming a badly tuned ported box reaches 25 ms or more on the kick drum. For this driver it's 15–18 ms (about two thirds of a cycle); a different driver or a smaller box can reach more, and a subsonic filter adds a few ms more (see below).

## Step response and ringing

![Step response of the three boxes: the sealed box (blue) settles within about 20 ms; the box tuned high (orange) swings back hard and rings at about 45 Hz; the box tuned low (light orange) has a slower, smaller swing at about 22 Hz.](img/group-delay-step.png)

The step response is where sealed boxes look best, and it's often posted as proof that ported boxes are slow. A ported box's step response always rings longer, because the port keeps sounding after the cone settles. But look at *what* rings: the high-tuned box swings back hard at about 45 Hz, while the low-tuned box's tail is smaller and at about 22 Hz, below most music.

A step is an extreme test signal. To see what happens with a note, we fed 4-cycle tone bursts through each box and an 80 Hz Linkwitz-Riley low-pass (a usual sub crossover), using the same simulation, and measured how long each kept sounding after the burst ended:

| Burst | Sealed | Ported, tuned high | Ported, tuned low |
|---|---|---|---|
| 30 Hz: above −20 dB for | 1 ms | 15 ms | 8 ms |
| 40 Hz | 4 ms | **22 ms** | under 1 ms |
| 50 Hz | 6 ms | **27 ms** | 1 ms |
| 60 Hz | 2 ms | **22 ms** | 3 ms |
| 30 Hz: above −30 dB for | 3 ms | 28 ms | 31 ms |
| 40 Hz | 7 ms | **42 ms** | 17 ms |
| 50 Hz | 9 ms | **40 ms** | 13 ms |
| 60 Hz | 11 ms | **34 ms** | 12 ms |

The low-tuned box is as clean as the sealed box from 40 Hz up at −20 dB, and close at −30 dB. Its tail only grows at 30 Hz and below, near its tuning. The high-tuned box hangs on for 20–40 ms across the whole kick drum range.

## Can you hear it?

Research on group delay audibility is mostly at mid and high frequencies, and the results depend heavily on the test signal:

- **Blauert and Laws (1978)** found thresholds of about 1–3 ms between 500 Hz and 8 kHz (3.2 ms at 500 Hz) [6][10].
- **Møller et al. (2007)** heard ringing from all-pass filters with impulses once the peak group delay passed about 1.6 ms (1–12 kHz), but found it was often masked with speech and music [5].
- **Liski, Mäkivirta and Välimäki (2021)** found thresholds as low as about 0.6 ms (500 Hz–4 kHz) with a specially shaped click, and that a synthetic hi-hat sound hid the change [7]. Their 2018 study found group delay below 1 ms inaudible from 300 Hz to 1 kHz, but easier to hear when low frequencies were emphasised [8].
- **For ported-box bass,** an Aalto University master's thesis tested group delay from vented boxes and estimated the average detection threshold at **about 7 ms from 30 to 250 Hz**, strongly dependent on the music, with shorter delays hard to detect even for experienced listeners [9].
- **The "1–1.5 cycles" rule** you'll see on graphs comes from extending the mid-frequency results to the bass in cycles [10]. Subwoofer makers and reviewers use 1.5 cycles as the usual threshold [11]. It's a rule of thumb, not a measured result.

Against those numbers: the sealed box (4–6 ms from 40 to 60 Hz) and the low-tuned box (3–7 ms) sit at or under the 7 ms average. The high-tuned box (15 ms at 40–50 Hz) is about twice it. None of the three comes near 1.5 cycles in the music range. So if group delay is audible anywhere here, it's in the box tuned high, and in that box the +5.4 dB peak, which is certainly audible, is the bigger problem. The peak and the delay are the same thing seen two ways: a minimum-phase peak in the response always comes with a group delay peak and ringing [4].

## The room is a bigger factor than the box

In a room, bass doesn't stop when the speaker does. Room modes keep ringing, often for hundreds of milliseconds. In listening tests, people didn't notice changes in modal decay time until it was about 0.3–0.4 s at 100–200 Hz, and at 50 Hz they heard no difference with decay times up to 2 s [13]. Next to that, the 5–30 ms differences between these boxes are small. Placement, room modes, the crossover to the main speakers and the sub's phase setting all change how "tight" bass sounds more than the box type does [4][12].

That's also why the same sub can sound "fast" in one room and "boomy" in another: a peak from a room mode at 50–60 Hz sounds exactly like the high-tuned box's hump.

## Filters and EQ add delay too

Real systems rarely use a bare box:

- **A low-tuned ported box needs a subsonic filter** to keep the cone from flapping below tuning (see the [subsonic filter guide](/guides/subsonic-filter/)). With an 18 Hz, 24 dB/octave filter, the low-tuned box's delay is 12.3 ms at 40 Hz and 7.7 ms at 50 Hz, and its peak moves to 57.8 ms at 17.8 Hz.
- **A sealed sub often gets a filter or EQ too.** With the same filter, the sealed box is at 10.7 ms at 40 Hz. A sealed box equalised for deeper bass gets some of a ported box's group delay back [12]; see the [Linkwitz Transform guide](/guides/linkwitz-transform/).
- **The high-tuned box with the filter** is at 20.5 ms at 40 Hz.

[[Open the three boxes with an 18 Hz subsonic filter|group-delay-subsonic]]

## What the low-tuned box costs

The low-tuned box isn't free:

- **Size.** It's 83.5 L, 2.3 times the sealed box, with a 42 cm port.
- **Excursion below tuning.** Without a subsonic filter, the cone unloads below 24 Hz.
- **Port noise.** A low tuning needs a big port to stay quiet; see the [port chuffing guide](/guides/port-chuffing/).

In return it plays about an octave deeper than the sealed box (F3 23 Hz against 46 Hz) at the same power. A sealed box gets some of that back from room or cabin gain (see the [Qtc guide](/guides/sealed-qtc/) and the [car subwoofer guide](/guides/car-subwoofer/)) or from EQ, at the cost of excursion and amplifier power.

The box tuned high is the one to avoid if you want tight bass: if you need a small ported box, a lower tuning with a smaller peak, or a sealed box, will sound tighter. The same reasoning applies to [passive radiator boxes](/guides/passive-radiator-box/), which behave like ported boxes here. Stuffing a ported box also damps its tuning peak a little; see the [box stuffing guide](/guides/box-stuffing/).

## Checking your own design in the app

1. Put your boxes side by side on the **Boxes** tab.
2. Open the **Group delay** chart under the response. Hover to read the delay at 40, 50 and 60 Hz, and multiply by the frequency ÷ 1000 to get cycles.
3. Look at the **Relative response** chart for a peak above the tuning: that's the boom.
4. Open **Impulse / step** and choose **Step** to see how long each box rings.
5. Turn on the **high-pass filter** in **Signal** if you'll use one, and check again: it adds delay.
6. A box tuned away from its design changes all of this; see [why a port tunes higher or lower](/guides/port-tuning/).

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Ported boxes are slow and muddy" | Only when tuned high with a peak. A low-tuned box is within about 1.6 ms of sealed from 40 Hz up. |
| "Sealed boxes have faster transients" | Sealed has the lowest group delay and the cleanest step response, but from 40 Hz up the difference from a low-tuned ported box is small, and below the thresholds listening tests have found [9]. |
| "Heavy cones are slow" | No: added mass lowered sensitivity but didn't slow the impulse; bandwidth did [4]. |
| "Group delay is inaudible in the bass" | Probably for well-designed boxes; the one bass study found an average threshold of about 7 ms [9]. A box tuned high can exceed it. |
| "It's the room, not the box" | Mostly. Room modes ring for hundreds of milliseconds, and people tolerate long decays at 50 Hz [13]. But a box with a +5 dB peak sounds boomy in any room. |
| "A badly tuned box hits 25+ ms on the kick drum" | Possible with some drivers and filters; this one reaches 15–18 ms in the box alone, about 21 ms with a subsonic filter. |

## Sources

1. R. H. Small, "Vented-Box Loudspeaker Systems, Part I: Small-Signal Analysis", *J. Audio Eng. Soc.* 21 (5), 363–372, June 1973: the vented box as a 4th-order high-pass. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=1967).
2. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 798–808, December 1972: the closed box as a 2nd-order high-pass. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2022).
3. Stephan Herzog and Marcel Hilsamer, "Low Frequency Group Delay Equalization of Vented Boxes Using Digital Correction Filters", DAFx-14, Erlangen, 2014: the vented box's group delay and its peak just below the port tuning. [PDF](https://www.dafx14.fau.de/papers/dafx14_stephan_herzog_low_frequency_group_delay.pdf).
4. Paul Spencer, [The fast bass experiment: are heavy woofers slow?](https://www.stereonet.com/features/the-fast-bass-experiment-are-heavy-woofers-slow), StereoNET, May 2014: added cone mass vs inductance and low-pass filters, measured.
5. H. Møller, P. Minnaar, S. K. Olesen, F. Christensen and J. Plogsties, "On the Audibility of All-Pass Phase in Electroacoustical Transfer Functions", *J. Audio Eng. Soc.* 55 (3), 115–134, March 2007. [PDF (Aalborg University)](https://vbn.aau.dk/files/227876517/2007_M_ller_et_al_AES_Journal.pdf).
6. J. Blauert and P. Laws, "Group delay distortions in electroacoustical systems", *J. Acoust. Soc. Am.* 63 (5), 1478–1483, May 1978. [doi:10.1121/1.381841](https://doi.org/10.1121/1.381841).
7. J. Liski, A. Mäkivirta and V. Välimäki, "Audibility of Group-Delay Equalization", *IEEE/ACM Trans. Audio, Speech, Lang. Process.* 29, 2189–2201, 2021. [doi:10.1109/TASLP.2021.3087969](https://doi.org/10.1109/TASLP.2021.3087969) (open access).
8. J. Liski, A. Mäkivirta and V. Välimäki, "Audibility of Loudspeaker Group-Delay Characteristics", AES 144th Convention, paper 10008, 2018. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=19404).
9. Aalto University, School of Electrical Engineering, [Low-frequency group delay in a vented-box loudspeaker](https://aaltodoc.aalto.fi/items/eba93ead-d456-4af9-be65-c598592ee393), master's thesis supervised by Vesa Välimäki: an average detection threshold of about 7 ms from 30 to 250 Hz.
10. John L. Murphy, True Audio, [Group delay](https://trueaudio.com/post_010.htm): Blauert and Laws's thresholds, and expressing group delay in cycles to extend them to the bass.
11. SVS, [Sealed vs. ported subwoofers](https://svsound.com/blogs/subwoofer-setup-and-tuning/75367747-sealed-vs-ported): group delay of one subwoofer in sealed and 16 and 20 Hz ported modes, with 1 and 1.5 cycle reference lines.
12. Audioholics, [Top 10 subwoofer and bass myths](https://audioholics.com/loudspeaker-design/10-nonsense-myths): "sealed subs are faster" (EQ adds group delay back; in-room response matters more).
13. B. M. Fazenda, M. Stephenson and A. Goldberg, "Perceptual thresholds for the effects of room modes as a function of modal decay", *J. Acoust. Soc. Am.* 137 (3), 1088–1098, 2015, including Karjalainen et al.'s decay-time thresholds. [doi:10.1121/1.4908217](https://doi.org/10.1121/1.4908217).
14. Native Instruments, [How to EQ a kick drum](https://blog.native-instruments.com/kick-drum-eq/): a kick's weight in roughly 40–100 Hz.
