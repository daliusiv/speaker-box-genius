---
title: "Car subwoofer box design: sealed or ported?"
description: One 10-inch sub at its full 350 W in a 28 L sealed box and two 45 L ported boxes, in the car and out of it. What cabin gain does to each, which one runs out of cone first, and what the forum rules of thumb get wrong.
path: guides/car-subwoofer
image: car-spl.png
order: 8
group: start
---

# Car subwoofer box design: sealed or ported?

A sub that sounds thin in a living room can shake a car, because the cabin itself boosts the deep bass. That boost changes which box you should build, but not in the way most forum threads say. This guide puts one popular 10″ sub at its full rated power in a small sealed box and two ported boxes, then runs them in a car and out of it, so you can see what the cabin does and what it doesn't.

[[Open the worked example (in the car)|car-example]] [[The same boxes out of the car|car-nocabin]]

## The short answer

| If you want… | Build | Why (from the numbers below) |
|---|---|---|
| Flat, deep bass from the smallest box | **Sealed**, Qtc 0.7–0.8 | The cabin fills in its roll-off: in-car F3 22.4 Hz from a 28 L box, within 3.2 dB from 30 to 80 Hz |
| The most output for the watts | **Ported**, tuned 28–33 Hz | 5–7 dB louder at 30–40 Hz, and 6–9 dB more maximum output there |
| Loud *and* deep | **Ported, tuned low** (high 20s) | Most output at 25 Hz, the smallest hump, the least group delay at 40 Hz |
| Your sub to survive full power | Either, **with a subsonic filter** | The small sealed box is the one past Xmax here, not the ported ones |

## What cabin gain is

Below the frequency whose half wavelength fits the cabin's longest inside dimension, a car stops acting like a room and starts acting like a pressure chamber: the sub pressurises the whole cabin, and the lower the note, the bigger the boost. In a well-sealed car it rises at up to **12 dB per octave**. That frequency is c / (2 × length): about **69 Hz** for a cabin 2.5 m long, 95 Hz for a 1.8 m hatchback, 38 Hz for a 4.5 m van. JBL's and Infinity's sub manuals describe the same thing, a boost of nearly 12 dB/octave below about 80 Hz [1], and John L. Murphy's speaker software used 87, 66 and 48 Hz for compact cars, midsize cars and vans [2].

Twelve dB per octave is also how fast a sealed box rolls off below its resonance. So in a car, a sealed box's falling bass and the cabin's rising boost cancel, and a box with an F3 of 43 Hz on paper plays flat into the low 20s [2][3].

![Box + cabin = what you hear: on the left, the sealed box on its own (grey) falls away below 50 Hz, the cabin gain (dashed) rises below 69 Hz, and the sum (blue) stays within a few dB down to about 25 Hz. On the right, the ported box on its own is already flat lower down, so the same cabin gain stacks on top of it into a 9 dB hump at 37 Hz.](img/car-cabin-sum.png)

The left panel is the whole reason small sealed boxes are popular in cars: the grey curve (the box alone) is 9 dB down at 30 Hz, the dashed cabin gain is 13 dB up there, and the blue sum lands a few dB above flat. On the right, the ported box doesn't need the help. Its own response (grey) holds up to 33 Hz, so adding the cabin gain lifts 30–50 Hz well above the rest.

> **Common trap: "cabin gain is 12 dB/octave from 80 Hz."** That's a ceiling for a sealed, small cabin, not a constant. Builders who measure their own cars often find 8–9 dB/octave [4], and it falls apart with the windows down or a convertible top open [2][3]. The bigger the cabin, the lower it starts, and the less it gives you at 30 Hz.

![Smaller cabin, more lift: the app's cabin gain for cabins 1.8, 2.5, 3.5 and 4.5 m long. At 30 Hz the lift is 15.9, 12.9, 8.6 and 5.3 dB.](img/car-cabin-length.png)

The chart above is the app's model for four cabin lengths. Going from a 1.8 m hatchback to a 4.5 m van costs you about **10 dB at 30 Hz**, which is why the same sub can sound huge in a small car and polite in an SUV.

## The worked example

A **Dayton Audio RSS265HF-4** 10″ sub (Fs 25.6 Hz, Qts 0.45, Vas 54 L, Xmax 12.3 mm, 350 W) [5] at its **full rated 350 W**, behind a **24 dB/octave subsonic filter at 26 Hz**, in a car with a 2.5 m cabin. Three boxes:

- **Sealed 28 L:** Qtc 0.77, a typical "small car box" for a 10″.
- **Ported 45 L, 33 Hz:** a common car tuning: loud, compact for a ported box.
- **Ported 45 L, 28 Hz:** the same box tuned lower.

Both ported boxes use the same 5 × 30 cm slot (150 cm²), so the only difference between them is the tuning.

![In the car: the sealed box ({{color:car-example/1}}) is the flattest; the ported boxes ({{color:car-example/2}} at 33 Hz, {{color:car-example/3}} at 28 Hz) sit 5–7 dB higher at 30–40 Hz with a hump. The dots mark each box's F3 in the car: {{num:car-example/1/f3car}}, {{num:car-example/2/f3car}} and {{num:car-example/3/f3car}} Hz.](chart:car-example/response)

This is the app's response chart with cabin gain on. The dots on the −3 dB line are the F3 *in the car*: all three boxes reach the low 20s. What separates them is the shape above that. The {{color:car-example/1}} sealed curve peaks only about 5 dB above 0 dB. The two orange curves peak 11–12 dB above it, around 34–37 Hz.

| In the car, 350 W | Sealed 28 L | Ported 45 L, 33 Hz | Ported 45 L, 28 Hz |
|---|---|---|---|
| F3 of the box (as WinISD gives it) | {{num:car-example/1/f3}} Hz | {{num:car-example/2/f3}} Hz | {{num:car-example/3/f3}} Hz |
| F3 in the car | **{{num:car-example/1/f3car}} Hz** | {{num:car-example/2/f3car}} Hz | {{num:car-example/3/f3car}} Hz |
| 25 Hz | {{num:car-example/1/spl@25}} dB | {{num:car-example/2/spl@25}} dB | **{{num:car-example/3/spl@25}} dB** |
| 30 Hz | {{num:car-example/1/spl@30}} dB | {{num:car-example/2/spl@30}} dB | **{{num:car-example/3/spl@30}} dB** |
| 40 Hz | {{num:car-example/1/spl@40}} dB | **{{num:car-example/2/spl@40}} dB** | {{num:car-example/3/spl@40}} dB |
| 60 Hz | {{num:car-example/1/spl@60}} dB | {{num:car-example/2/spl@60}} dB | {{num:car-example/3/spl@60}} dB |
| 80 Hz | {{num:car-example/1/spl@80}} dB | {{num:car-example/2/spl@80}} dB | {{num:car-example/3/spl@80}} dB |
| Peak above the 80 Hz level | **+{{num:car-example/1/hump}} dB** | +{{num:car-example/2/hump}} dB (at {{num:car-example/2/humpf}} Hz) | +{{num:car-example/3/hump}} dB (at {{num:car-example/3/humpf}} Hz) |
| Peak cone travel (Xmax 12.3 mm) | **{{num:car-example/1/x}} mm** at {{num:car-example/1/xf}} Hz | {{num:car-example/2/x}} mm at {{num:car-example/2/xf}} Hz | {{num:car-example/3/x}} mm at {{num:car-example/3/xf}} Hz |
| Peak port air speed | — | {{num:car-example/2/port}} m/s | {{num:car-example/3/port}} m/s |
| Port length (5 × 30 cm slot) | — | {{num:car-example/2/len}} cm | {{num:car-example/3/len}} cm |

Now take the cabin away. Same boxes, same 350 W, same filter, out of the car:

![Out of the car: the sealed box's F3 is {{num:car-nocabin/1/f3}} Hz and it is 14 dB down at 25 Hz; the ported boxes reach {{num:car-nocabin/2/f3}} and {{num:car-nocabin/3/f3}} Hz and are nearly flat above that.](chart:car-nocabin/response)

| Out of the car, 350 W | Sealed 28 L | Ported 45 L, 33 Hz | Ported 45 L, 28 Hz |
|---|---|---|---|
| 25 Hz | {{num:car-nocabin/1/spl@25}} dB | {{num:car-nocabin/2/spl@25}} dB | {{num:car-nocabin/3/spl@25}} dB |
| 30 Hz | {{num:car-nocabin/1/spl@30}} dB | {{num:car-nocabin/2/spl@30}} dB | {{num:car-nocabin/3/spl@30}} dB |
| 40 Hz | {{num:car-nocabin/1/spl@40}} dB | {{num:car-nocabin/2/spl@40}} dB | {{num:car-nocabin/3/spl@40}} dB |
| 80 Hz | {{num:car-nocabin/1/spl@80}} dB | {{num:car-nocabin/2/spl@80}} dB | {{num:car-nocabin/3/spl@80}} dB |
| Peak above the 80 Hz level | +{{num:car-nocabin/1/hump}} dB | +{{num:car-nocabin/2/hump}} dB | +{{num:car-nocabin/3/hump}} dB |

Out of the car the ported boxes are the flat ones and the sealed box is the thin one. In the car it flips. The boxes didn't change; the room did. That's the most useful thing to take from this guide: **always design a car sub with cabin gain switched on**, or you'll pick the box that looks best in a living room.

> **Rule of thumb:** a 5–7 dB difference is a lot. It's what you'd get from three to five times the amplifier power, if the cone could take it.

## Which one runs out first

Cabin gain changes what you *hear*. It doesn't change what the cone *does*: the excursion and port speed are exactly the same in the car and out of it (the app's test suite checks this). So the cabin can't save a box that's past its limits.

![Cone excursion at 350 W: the sealed box ({{color:car-example/1}}) rises above the 12.3 mm Xmax line between about 28 and 45 Hz, peaking at {{num:car-example/1/x}} mm at {{num:car-example/1/xf}} Hz. The 33 Hz ported box ({{color:car-example/2}}) stays under, with its dip at the tuning; the 28 Hz box ({{color:car-example/3}}) just touches Xmax at {{num:car-example/3/xf}} Hz.](chart:car-example/excursion)

On the excursion chart the {{color:car-example/1}} sealed curve is the only one that crosses the red Xmax line, peaking at **{{num:car-example/1/x}} mm** at {{num:car-example/1/xf}} Hz, right where the cabin gain makes it sound strongest. It reaches Xmax at about **{{num:car-example/1/xmaxW}} W**. The ported boxes have their dips at the tuning frequency (the port is doing the work there) and stay under, with the 28 Hz box just under at {{num:car-example/3/x}} mm at {{num:car-example/3/xf}} Hz.

![Maximum SPL in the car, first limit reached: the sealed box ({{color:car-example/1}}) is capped by Xmax (red bar) from 10 to 45 Hz at 112–115 dB; the ported boxes reach 120–122 dB between 28 and 45 Hz, limited by power (grey) there.](chart:car-example/maxspl)

The **Max SPL** chart shows the ceiling, cabin gain included. The bars under it say which limit hits first. The sealed box is cone-limited (red) all the way up to 45 Hz and tops out at **{{num:car-example/1/max@25}} dB at 25 Hz, {{num:car-example/1/max@30}} at 30, {{num:car-example/1/max@40}} at 40**. More amplifier won't raise that; only more cone area or a bigger box will. The 28 Hz ported box reaches **{{num:car-example/3/max@25}} dB at 25 Hz and {{num:car-example/3/max@30}} at 30**, limited by {{num:car-example/3/limit@30}}, not by the cone.

| Most output in the car (first limit) | Sealed 28 L | Ported 45 L, 33 Hz | Ported 45 L, 28 Hz |
|---|---|---|---|
| 25 Hz | {{num:car-example/1/max@25}} dB ({{num:car-example/1/limit@25}}) | {{num:car-example/2/max@25}} dB ({{num:car-example/2/limit@25}}) | **{{num:car-example/3/max@25}} dB** ({{num:car-example/3/limit@25}}) |
| 30 Hz | {{num:car-example/1/max@30}} dB ({{num:car-example/1/limit@30}}) | {{num:car-example/2/max@30}} dB ({{num:car-example/2/limit@30}}) | **{{num:car-example/3/max@30}} dB** ({{num:car-example/3/limit@30}}) |
| 40 Hz | {{num:car-example/1/max@40}} dB ({{num:car-example/1/limit@40}}) | **{{num:car-example/2/max@40}} dB** ({{num:car-example/2/limit@40}}) | {{num:car-example/3/max@40}} dB ({{num:car-example/3/limit@40}}) |

## Forum myths, checked

**"Sealed for sound quality, ported for SPL."** Half true. The ported boxes are louder: 5–7 dB at 30–40 Hz, and 6–9 dB more maximum output. But the sound-quality gap is mostly the 8–9 dB hump, and out of the car the ported boxes are actually the flatter ones (+{{num:car-nocabin/2/hump}} and +{{num:car-nocabin/3/hump}} dB against the sealed box's 14 dB drop at 25 Hz). The hump comes from stacking cabin gain on a box that's already flat lower down. As one caraudio.com regular put it, a response that's peaky before the transfer function stays peaky after it [6]. You can EQ a hump down; you can't EQ more cone travel into a sealed box that's at Xmax. *Proof: the response chart with Room / cabin gain on and off.*

**"Ported boxes are boomy."** It's the tuning and the cabin, not the port. Tuning lower, from 33 to 28 Hz, moves the hump down ({{num:car-example/2/humpf}} → {{num:car-example/3/humpf}} Hz), makes it smaller (+{{num:car-example/2/hump}} → +{{num:car-example/3/hump}} dB) and *cuts* the group delay at 40 Hz from 24.3 to 19.6 ms (sealed: 14.8 ms; all three include the subsonic filter's own delay). A small box tuned high is what gives ported boxes their reputation. Builders who measure their cars have tuned ported boxes as low as 26 Hz to get a nearly flat in-car response [7]. *Proof: the response chart, and the Group delay tab.* More in the [group delay guide](/guides/group-delay/).

> **Common trap: "sealed subs handle more power."** The trapped air protects a sealed cone below its resonance, but in its passband the cone moves more than a ported cone near tuning. Here the sealed box is the only one past Xmax at 350 W, at 34 Hz. The trap the other way is real too: below tuning a ported cone is barely held at all. With no subsonic filter at 350 W, both ported boxes reach about **36 mm** at 15 Hz, three times Xmax; the sealed box reaches 16 mm. JBL's manuals list "reduced mechanical power handling below the enclosure's resonance" as a ported trade-off for the same reason [1]. *Proof: the Excursion chart, with the High-pass filter on and off.* See the [subsonic filter guide](/guides/subsonic-filter/).

**"Cabin gain means you don't need to go low."** Cabin gain lifts SPL, not cone travel or port speed, so a sub tuned high still unloads below tuning, and a sealed box still needs the same excursion for the same note. It also doesn't add output that isn't there: the sealed box's 25 Hz *ceiling* is {{num:car-example/1/max@25}} dB in the car whatever the amp. *Proof: the Excursion and Port speed charts don't move when you switch the cabin on.*

**"Size a car sealed box for a Qtc of 0.707, like at home."** You can go smaller. Dickason's *Loudspeaker Design Cookbook* suggests a sealed box with Q 0.71 and a resonance around 55 Hz for a typical car's transfer function [3]; this 28 L box has Qtc 0.79 and Fc 43.8 Hz and is still flat in a 2.5 m cabin. Go much higher than Qtc 0.9 and you trade the flat response for a peak around Fc, and the box still needs the same cone travel.

## Things the simulation doesn't know

- **Your car.** The app's cabin gain is a simple model: it starts at c / (2 × length), rises at the slope you pick (12 dB/oct by default), and levels off at a maximum. Real cabins leak, have seats and boot partitions, and ring at their own modes. If you can measure yours (or load someone's measurement of the same car), load it as **Your own curve** in the Room / cabin gain card.
- **Where the box sits.** Boot, firing forward or back, through a ski hatch: one diyAudio builder found that moving a box a few inches in a large vehicle cost as much as 10 dB [8]. Use the simulation to choose the box, then tune by ear or with a measurement.
- **The port has to fit.** At 28 Hz the slot is {{num:car-example/3/len}} cm long and takes up 17.5 L on top of the 45 L of air (12.2 L at 33 Hz). The app marks both "Port too long to fit": fold the slot along the walls, and use the **Build** tab's volume calculator to get the outside size with the port, driver and bracing deducted.
- **Polyfill** makes a sealed box act 15–25 % bigger, which helps when the box has to be small; see the [box stuffing guide](/guides/box-stuffing/).

## Doing it in the app

1. **Pick your sub** on the **Driver** tab and set the power to what your amp gives it (here 350 W). Check the **Box type** line under the T/S parameters: this sub's EBP of 48 leans sealed, but both boxes work.
2. On the **Signal** tab, under **Room / cabin gain**, set **Space** to **Car cabin** and set **Longest inside** to your cabin, windscreen to the back of the boot. **Lift starts** shows where it begins.
3. Still on **Signal**, turn on the **High-pass filter**: 24 dB/oct, a few hertz below your lowest tuning (here 26 Hz).
4. On **Boxes**, add a sealed and a ported design. The summary table gives each box's own F3 and, next to it, the **F3 in the car**; the response chart's dots mark the in-car F3.
5. Check the **Excursion** chart against the red Xmax line, then the **Max SPL** tab: its bars tell you whether the cone, the port or the power runs out first. On ported boxes, check **Port speed** too: a chuffing port is easy to hear in a quiet cabin. If you accept some port noise at full power (common in SPL builds), raise the **Chuffing line** in **Settings → Ports**.

Not sure which sub to buy? The [design assistant](/guides/design-assistant/) tries every suitable one in the database in sealed, ported and bandpass boxes, at your power, in your cabin from the Signal tab (or a typical 2.5 m one if you haven't set it). Tick **Bandpass** for 4th- and 6th-order boxes, which are popular in cars for very high output in a narrow band; on a bandpass design, **Size for a flat band** sizes both chambers and their ports for your driver in the same total volume.

[[Open the worked example (in the car)|car-example]] [[The same boxes out of the car|car-nocabin]]

## More on car subs

- **One big sub or two smaller ones?** See [one 15″ or two 10″](/guides/one-15-vs-two-10s/): displacement wins the deep bass, power handling and a 2 Ω load the upper bass.
- **Series or parallel voice coils?** See [DVC wiring](/guides/dvc-wiring/): the wiring doesn't change the sub, only the load, so wire for the amplifier. At 1 Ω, keep the speaker wire short and heavy.
- **Matching the amp?** See [amplifier matching](/guides/amp-matching/): the voltage and current limits, and why the impedance dip matters.

## Sources

1. JBL, [Series III subwoofers owner's manual](https://kh.jbl.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dwb9ef7aa6/pdfs/SERIESIII_OM_EN.pdf) (Harman; Infinity's Kappa and Reference manuals say the same): below 80 Hz bass is boosted by nearly 12 dB per octave by the vehicle's transfer function; vented trade-offs include reduced mechanical power handling below the box's resonance.
2. J. L. Murphy, True Audio, [Vehicle cabin effect (windows up/down)](https://trueaudio.com/post_001.htm), Bass List, 1999: a 12 dB/octave rise below a corner set by the cabin's major dimension, 48, 66 and 87 Hz for vans, midsize and compact cars; depends strongly on whether the cabin is sealed; a closed box with its corner at the cavity frequency can in theory be flat to DC.
3. diysubwoofers.org, [Car transfer function measurements](http://diysubwoofers.org/projects/other/cartf/): a Miata's measured transfer function with the top up and down, and V. Dickason's *Loudspeaker Design Cookbook* suggestion of a sealed box with Q 0.71 and a 55 Hz resonance for a typical car.
4. diyAudio, [Cabin gain in a Ford Explorer](https://www.diyaudio.com/community/threads/cabin-gain-in-a-ford-explorer.56719/): cabin gain starts where the longest dimension is half a wavelength (around 80 Hz in small cars, 70 Hz in medium ones); 12 dB/octave in a perfectly sealed cabin, 8–9 dB in measured cars.
5. Dayton Audio, [RSS265HF-4 10″ Reference HF Subwoofer](https://www.daytonaudio.com/product/118/rss265hf-4-10-reference-hf-subwoofer-4-ohm): Fs 25.6 Hz, Qes 0.53, Qms 3.06, Vas 54 L, Xmax 12.3 mm, 350 W (used with Dayton Audio's permission).
6. caraudio.com, [Local car shop guy told me…](https://www.caraudio.com/threads/local-car-shop-guy-told-me-i-should-sell-get-rid-of-my-xxx-18.258630/post-3370898): sealed isn't always flatter nor ported always peaky; the transfer function is applied to whatever the box does.
7. diyAudio, [Is this true about ported subs in a car?](https://www.diyaudio.com/community/threads/is-this-true-about-ported-subs-in-a-car.79702): measured cabin gain of 8–9 dB/octave from 60–90 Hz; a vented box tuned to about 26 Hz designed for a nearly flat in-car response.
8. diyAudio, [The effect on bass response of the loading caused by the vehicle](https://www.diyaudio.com/community/goto/post?id=3853964): box position in a large vehicle changed the bass by as much as 10 dB.
