---
title: "Sealed, ported or passive radiator: which box for your driver?"
description: One 10-inch sub at its full 350 W rating in all three boxes, side by side. Size, depth, output, cone travel with and without a subsonic filter, and what the Qts and EBP rules of thumb get right and wrong.
path: guides/sealed-vs-ported
image: box-types-spl.png
order: 6
group: start
---

# Sealed, ported or passive radiator: which box for your driver?

The same woofer can go in a small sealed box, a big ported box or a passive radiator box. Each one trades size, depth and output differently, and each one fails differently when you push it. This guide puts one popular 10″ sub in all three at its full rated power, on the same charts, so you can see the trade-offs instead of arguing about them.

[[Open all three boxes (with a subsonic filter)|box-types-example]] [[The same three, no filter|box-types-nofilter]]

## The short answer

- **Sealed is the smallest box, ported plays loudest near its tuning.** Here sealed is 37.3 L with F3 42.0 Hz; ported is 82.8 L with F3 21.3 Hz, and 11.6 dB more output at 25 Hz.
- **The passive radiator box lands in between.** Same box as ported, F3 24.2 Hz, 2 dB behind it at 25 Hz, and no port to fit. Below its tuning it falls away much faster.
- **Above about 30 Hz the box type barely matters for output.** All three run out of cone travel at about the same level at 40 Hz (within 3.1 dB), because the port only helps near the tuning.
- **Every box needs a subsonic filter at full power.** Without one the ported cone swings 44.4 mm at 10 Hz, more than three times its 12.3 mm Xmax. Even the sealed cone reaches 19.8 mm.
- **Qts and EBP are a starting point, not a verdict.** By EBP this driver "leans sealed", yet it's 11.6 dB louder at 25 Hz ported. Simulate both.

## The setup

The driver is the **Dayton Audio RSS265HF-4**, a 10″ subwoofer [1]:
- Fs 25.6 Hz, Qts 0.45, Vas 54 L
- Xmax 12.3 mm, rated 350 W

It's driven at **its full 350 W**, behind a 24 dB/oct high-pass at 18 Hz. The boxes are the ones the app's presets give for this driver:

| | Sealed | Ported | Passive radiators |
|---|---|---|---|
| Preset | Qtc 0.707 | Keele's flat alignment | the same box |
| Box | 37.3 L | 82.8 L, tuned to 22.0 Hz | 82.8 L, tuned to 23.1 Hz |
| Also needs | nothing | a 10 cm flared tube, 54.4 cm long | two RSS265-PR, two 75 g disks each |

Some practical notes:
- **The sealed box** is the textbook formula: Vb = Vas ÷ ((0.707/Qts)² − 1) = 37.3 L [2].
- **The ported box** is D. B. Keele's curve fit for the flattest response from a given Qts: Vb = 15 × Qts^2.87 × Vas, Fb = 0.42 × Fs × Qts^−0.9 [3].
- **The port** keeps its air at 14.6 m/s at 350 W, under the 17 m/s chuffing line. But at 54.4 cm it won't fit straight in a cube-shaped 82.8 L box: use a taller box or one bend. **Size all boxes** picks a straight 7.5 cm tube that does fit, and tells you it chuffs at the driver's rating ([port chuffing](/guides/port-chuffing/) covers the trade).
- **The passive radiators** come with five 75 g disks each [4]. The PR preset asks for 186 g each, which is two and a half disks. Two disks (150 g) tune the box to 23.1 Hz, three (225 g) to 21.0 Hz.

## Depth: an octave between them

![From the app: relative response of the three boxes at 350 W with the 18 Hz filter. Ported (orange) is 3 dB down at 21.3 Hz, passive radiators (green) at 24.2 Hz, sealed (blue) at 42.0 Hz.](img/box-types-spl.png)

**Look at where each curve crosses the −3 dB line.** The ported box (orange) holds flat to 21.3 Hz, a full octave below the sealed box's 42.0 Hz (blue). The PR box (green) gets most of the way, to 24.2 Hz, then drops off a cliff: by 15 Hz it's far below the other two.

That cliff is the passive radiator's own resonance. A PR is a port with a spring attached. With 150 g added it resonates at 19.6 × √(200 ÷ 350) = 14.8 Hz, and at that frequency it cancels the woofer's output, putting a notch in the response [5][6]. A port has no spring, so it has no notch.

A sealed box rolls off at 12 dB per octave, the ported and PR boxes at 24 dB or more [2][5]. That's why the sealed curve, starting an octave higher, is still above the PR's below about 19 Hz.

> **Rule of thumb:** for the same box and tuning, a PR box gives up a few hertz of F3 to a port. Here two disks give F3 24.2 Hz against 21.3 Hz. Three disks tune it lower (21.0 Hz), but the notch moves up too, and F3 gets worse (28.0 Hz).

## Output: where each box runs out

Response curves don't say how loud each box can go. The app's **Max SPL** chart does: at each frequency it finds the first limit hit (cone travel, port speed, or the 350 W rating) and colours the band underneath to say which one.

![From the app: maximum SPL of the three boxes. Ported (orange) is highest from 16 to 45 Hz, the PR box (green) close behind from 23 Hz up, sealed (blue) below both until 45 Hz. The bands show cone Xmax (red) limiting everything below 45 Hz except a short stretch at each tuning, where the 350 W rating (grey) is the limit.](img/box-types-maxspl.png)

| Max SPL | 20 Hz | 25 Hz | 30 Hz | 40 Hz |
|---|---|---|---|---|
| Sealed | 93.2 dB | 97.4 dB | 100.4 dB | 105.4 dB |
| Ported | **105.5 dB** | **109.0 dB** | **107.0 dB** | **108.5 dB** |
| Passive radiators | 95.1 dB | 107.0 dB | 105.5 dB | 107.6 dB |

Three things to notice in that chart:

- **At 25 Hz the ported box is 11.6 dB ahead of sealed.** Near the tuning the port does the work and the cone barely moves (6.2 mm at 22 Hz, against 16.8 mm for the sealed cone at 25 Hz). The ported box takes its full 350 W at 25 Hz; the sealed cone hits Xmax at 187 W.
- **At 40 Hz the gap shrinks to 3.1 dB.** Above the tuning the port stops helping and every cone is back to its own travel. All three hit Xmax at about 275–282 W there. Look at the red bands: from 30 to 45 Hz all three boxes are excursion-limited.
- **Below 15.4 Hz the sealed box out-plays the ported one** (and below 19.5 Hz the PR box). Below tuning a ported or PR box stops loading the cone, which is the next section.

The amplifier each box needs for its 25 Hz maximum is different too:
- **Sealed:** 24.8 V and 3.8 A.
- **Ported:** 34.1 V and 6.5 A.
- **PR:** 32.4 V and 5.4 A.

Switch the chart to **Volts** or **Amps** to see the whole curve; [matching an amplifier](/guides/amp-matching/) explains reading it.

## Cone travel: why every box needs a subsonic filter

![Cone excursion at 350 W. Left, no filter: below 20 Hz the ported cone (orange) climbs to 44.4 mm at 10 Hz and the PR cone (green) to 36.2 mm, while the sealed cone (blue) stays at 19.8 mm. Right, with a 24 dB/oct high-pass at 18 Hz: the peaks drop to 18.0, 20.0 and 16.8 mm.](img/box-types-excursion.png)

Look at the left panel first, below 20 Hz. With no filter:
- **The ported cone (orange) shoots to 44.4 mm** at 10 Hz, more than three times its 12.3 mm Xmax. Below its tuning the port no longer holds the cone back, so it flaps against nothing [7].
- **The PR cone (green) reaches 36.2 mm.** It's a little better controlled, because the radiators' mass and suspension still load it [6].
- **The sealed cone (blue) peaks at 19.8 mm.** The trapped air keeps acting as a spring, so the sealed box is the gentlest, but at 350 W it's still well over Xmax.

Now the right panel, with an 18 Hz, 24 dB/oct high-pass:
- **Ported:** 18.0 mm at 17 Hz.
- **PR:** 20.0 mm at 18.5 Hz.
- **Sealed:** 16.8 mm at 25 Hz.

That's a big improvement, but none of them is under Xmax. At 350 W this driver is excursion-limited almost everywhere from 15 to 45 Hz, in every box. The filter stops the ported cone flapping below tuning; it doesn't give the driver more travel. You get the rest back by running less power (the Max SPL chart says how much at each frequency) or a filter set higher ([subsonic filters](/guides/subsonic-filter/) works through that).

The passive radiators move too: 20.5 mm at 22 Hz with the filter, 23.0 mm without, against their 24 mm Xmax. Check **PR excursion** whenever you push a PR box.

> **Common trap: "sealed boxes don't need a subsonic filter."** The trapped air protects a sealed cone from flapping, but not from too much power. This one is past Xmax with or without a filter at 350 W.

## What the driver's parameters suggest

Two numbers from the datasheet point the way before you simulate:

- **Qts**, the driver's total Q. A Qts above about 0.6 has no flat vented alignment, so it suits sealed. Below about 0.4 it suits ported: the sealed box it needs for a flat response is large [2][8].
- **EBP**, the efficiency bandwidth product, Fs ÷ Qes. Under about 50 leans sealed, over about 100 leans ported, and in between it can go either way. That's the rule from Dickason's *Loudspeaker Design Cookbook*, building on Small's work [9].

| Driver | Qts | EBP | What the app says |
|---|---|---|---|
| Dayton Audio RSS210HF-4 (8″) | 0.57 | 43 | leans sealed, ported can work too |
| Dayton Audio RSS265HF-4 (10″) | 0.45 | 48 | leans sealed, ported can work too |
| Dayton Audio DSA215-8 (8″) | 0.33 | 88 | leans ported, sealed can work too |

Our 10″ is the interesting one. EBP 48 says sealed, but Qts 0.45 is comfortable in a ported box, and the ported box is 11.6 dB louder at 25 Hz. The rules are a filter for a shortlist, not a decision. Neither knows how much room you have or how deep you want to go. (Efficiency, depth and size trade against each other whatever the box: see [Hofmann's Iron Law](/guides/hofmann-iron-law/).)

## How to choose

- **Short of space?** Sealed: 37.3 L instead of 82.8. It also suits a [car](/guides/car-subwoofer/), where cabin gain lifts the bottom end, and EQ like a [Linkwitz Transform](/guides/linkwitz-transform/), because there's no tuning below which it unloads.
- **Want the most output for your watts below 30 Hz?** Ported, if the box and the port fit. Size the port for your power, and use a subsonic filter.
- **Ported is right, but the port won't fit or would chuff?** Passive radiators. You pay for them in money (two radiators) and a few hertz of extension, and get no port noise and no long tube.
- **Want tight, well-damped bass?** Sealed at a Qtc of 0.5–0.7 ([sealed Qtc](/guides/sealed-qtc/)), or ported tuned low.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Ported is louder" | **Near the tuning, by a lot:** 11.6 dB at 25 Hz here. At 40 Hz only 3.1 dB, and below 15.4 Hz sealed wins. |
| "Sealed is tighter / ported is slow" | **Mostly a myth.** At 40 Hz the group delay is 10.9 ms sealed and 11.6 ms ported with the filter: 0.7 ms apart. At 25 Hz ported is 15 ms behind, which the [group delay guide](/guides/group-delay/) shows is below what listening tests find audible. |
| "A PR is just a port without the noise" | **In the passband, yes.** Below tuning it has a notch at its own resonance (14.8 Hz) and falls away faster: 10.4 dB less maximum output than the port at 20 Hz [5][6]. |
| "PRs protect the woofer better than a port" | **A little:** 36.2 mm against 44.4 mm with no filter. Still three times Xmax, so it still needs a filter [6]. |
| "Sealed subs don't need a subsonic filter" | **They do at full power:** 19.8 mm without, 16.8 mm with, against 12.3 mm Xmax. |
| "EBP tells you which box to build" | **It narrows it down.** This driver's EBP 48 says sealed; it works very well ported. |

## Doing it in the app

1. **Driver:** pick yours from the database or type in its parameters. Under the parameters, **Box type** shows its EBP, its Qts and which box they point to.
2. **Boxes:** add a sealed, a ported and a passive radiator design, or press **Size all boxes for this driver**. Each card's preset buttons resize it: **Qtc 0.707** on sealed; **Keele**, **QB3** or **B4** on ported and PR, whichever suits the driver. The other families that suit it (**C4**, **BB4**, **SQB3** for this one) are there too: hover one to see its box and tuning.
3. **Power slider:** set it to what you'll use (**Rated** jumps to the driver's rating), and turn on **Signal → High-pass filter**.
4. **Charts:**
   - **Response:** depth (F3).
   - **Cone excursion:** against the red Xmax line.
   - **Max SPL:** the colour bands show what limits each frequency. Switch to **Volts** or **Amps** for the amplifier each box needs.
   - **PR excursion** and **Port speed:** the radiators and the port.

For more on each box type, see [the passive radiator guide](/guides/passive-radiator-box/) and [the port guide](/guides/port-chuffing/).

## Sources

1. Dayton Audio, [RSS265HF-4 10″ Reference HF Subwoofer](https://www.daytonaudio.com/product/118/rss265hf-4-10-reference-hf-subwoofer-4-ohm): Fs 25.6 Hz, Qes 0.53, Qms 3.06, Vas 54 L, Xmax 12.3 mm, 350 W (used with Dayton Audio's permission).
2. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 1972: Qtc = Qts·√(1 + Vas/Vb) and the sealed box's 12 dB/octave roll-off.
3. diyAudio, [the Keele vented-box formulas](https://www.diyaudio.com/community/threads/hornresp.119854/post-7468324): Vb = 15·Qts^2.87·Vas, Fb = 0.42·Fs·Qts^−0.9, a curve fit for the flattest response with the smallest box and lowest F3.
4. Dayton Audio, [RSS265-PR 10″ passive radiator](https://daytonaudio.com/product/1425/rss265-pr-10-aluminum-cone-passive-radiator): Mms 200 g, Xmax 24 mm; supplied with five 75 g disk weights for tuning.
5. R. H. Small, "Passive-Radiator Loudspeaker Systems, Part 1: Analysis", *J. Audio Eng. Soc.* 22 (8), 592–601, 1974, and "Part 2: Synthesis", 22 (9), 683–689, 1974; summarised in [Passive radiator (speaker)](https://en.wikipedia.org/wiki/Passive_radiator_(speaker)): the notch at the PR's resonance and the steeper roll-off.
6. Parts Express, [What is a passive radiator?](https://www.parts-express.com/what-is-a-passive-radiator): steeper roll-off below F3; PR systems unload below tuning like ports but control excursion a little better.
7. A. N. Thiele, "Loudspeakers in Vented Boxes", *J. Audio Eng. Soc.* 19 (5/6), 1971: the vented-box alignments (QB3, B4, C4) and the cone's unloading below the box's tuning.
8. diyAudio, [Bass reflex alignments](https://www.diyaudio.com/community/threads/bass-reflex-alignments.424903/): Thiele's QB3 alignments for Qts under 0.383, B4 at 0.383, C4 above.
9. diyAudio, [EBP and Dickason's *Loudspeaker Design Cookbook*](https://diyaudio.com/community/goto/post?id=2436410): EBP = Fs/Qes, under 50 sealed, over 100 vented, 50–100 either (LDC section 1.40, after R. Small).
