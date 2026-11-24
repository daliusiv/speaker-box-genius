---
title: "Infinite baffle subwoofer: drivers in the wall, the attic as the box"
description: How an infinite baffle (IB) subwoofer works, how big the space behind it must be, what EQ and a subsonic filter cost, and which forum rules hold up, with numbers from four 18-inch drivers in a ceiling at 2000 W.
path: guides/infinite-baffle
image: chart:ib-example/response
art: Two drivers mounted in a wall, with the big space behind it marked out as their box.
order: 28
group: sealed
---

# Infinite baffle subwoofer: drivers in the wall, the attic as the box

An infinite baffle (IB) subwoofer has no box you can see. The drivers sit in a wall, floor or ceiling, and their backs face an attic, a garage or the room next door. That space takes the place of the box. Home-theatre builders like IB because it lets them use many large drivers, each moving a little, with no cabinet in the room [1].

This guide works through one realistic build and checks the usual forum rules against it. Every number below comes from the linked example, worked out by the same engine the app runs.

[[Open the example|ib-example]]

## The worked example: four 18-inch drivers in a ceiling

- **Drivers:** four Dayton Audio UMII18-22 (Fs 22 Hz, Qts 0.53, Vas 248 L, Sd 1184 cm², Xmax 28 mm, 1200 W each). Each has two 2 Ω coils.
- **Wiring:** each driver's coils in parallel (1 Ω), the four drivers in series: a 4 Ω load (Re 4.2 Ω), which one amplifier channel can drive.
- **Drive:** 2000 W, the rating of a large pro amplifier channel into 4 Ω (91.7 V).
- **Subsonic filter:** 24 dB/oct Linkwitz–Riley at 15 Hz.

Three designs share the chart: the drivers with an **open attic** behind them ({{color:ib-example/1}}), the same with a **Linkwitz Transform** EQ to 18 Hz at Q 0.707 ({{color:ib-example/2}}), and the drivers backed by a **2000 L closed space** ({{color:ib-example/3}}), such as a small room or a large cupboard.

| Design | Fc | Qtc | F3 | Peak cone excursion at 2000 W | Left before Xmax |
|---|---|---|---|---|---|
| Open attic | {{num:ib-example/1/fc}} Hz | {{num:ib-example/1/qtc}} | {{num:ib-example/1/f3}} Hz | {{num:ib-example/1/x}} mm at {{num:ib-example/1/xf}} Hz | {{num:ib-example/1/xin}} mm |
| Open attic + Linkwitz Transform | {{num:ib-example/2/fc}} Hz | {{num:ib-example/2/qtc}} | **{{num:ib-example/2/f3}} Hz** | {{num:ib-example/2/x}} mm at {{num:ib-example/2/xf}} Hz | {{num:ib-example/2/xin}} mm |
| Closed space, 2000 L | {{num:ib-example/3/fc}} Hz | {{num:ib-example/3/qtc}} | {{num:ib-example/3/f3}} Hz | {{num:ib-example/3/x}} mm at {{num:ib-example/3/xf}} Hz | {{num:ib-example/3/xin}} mm |

![The open attic ({{color:ib-example/1}}) rolls off gently from well above Fs: F3 {{num:ib-example/1/f3}} Hz. The Linkwitz Transform ({{color:ib-example/2}}) takes F3 to {{num:ib-example/2/f3}} Hz. The 2000 L closed space ({{color:ib-example/3}}) has a slightly fuller corner and less deep bass.](chart:ib-example/response)

With the open attic the system resonates at the driver's own Fs, with Qtc {{num:ib-example/1/qtc}}: the driver's Qts plus a little from the amplifier and cable resistance (**Settings → Simulation → Amplifier & cable → Amp + cable**, 0.1 Ω). A Qtc that low starts rolling off well above Fs, which is why IB builds are nearly always equalised.

## What "infinite" means

A sealed box's air acts as a spring on the cone: the smaller the box, the stiffer the spring, and the higher the system's resonance (Fc) and Q (Qtc) rise above the driver's own Fs and Qts. Both go up by √(1 + Vas ÷ Vb) [2], where Vas is the total of every driver sharing the space:

| Space behind the drivers | Fc and Qtc above the driver's |
|---|---|
| 1 × Vas | +41 % |
| 2 × Vas | +22 % |
| 4 × Vas | +12 % |
| 10 × Vas | +5 % |
| 25 × Vas | +2 % |

So "infinite" in practice means about ten times the total Vas or more. For the four UMII18-22 that's about 10 m³ (four drivers × 248 L × 10): a typical loft, but not a cupboard.

## Myth: "Less than 10 × Vas behind it and it isn't an IB, so it won't work"

The 2000 L closed space is only about twice the four drivers' 993 L of Vas. It doesn't break anything: it turns the IB into a very large sealed box. Fc rises from {{num:ib-example/1/fc}} to {{num:ib-example/3/fc}} Hz and Qtc from {{num:ib-example/1/qtc}} to {{num:ib-example/3/qtc}}, F3 moves from {{num:ib-example/1/f3}} to {{num:ib-example/3/f3}} Hz, and at 20 Hz it plays {{diff:ib-example/1/ib-example/3/rel@20}} dB less than the open attic ({{num:ib-example/3/rel@20}} dB against {{num:ib-example/1/rel@20}} dB, relative to each design's passband).

What a small space does change is what EQ costs. A Linkwitz Transform down to 18 Hz needs {{num:ib-example/1/boost@18}} dB of deep-bass boost from the open attic's {{num:ib-example/1/fc}} Hz, and {{num:ib-example/3/boost@18}} dB from the closed space's {{num:ib-example/3/fc}} Hz: about {{num:ib-example/3/boostx@18}} times the amplifier power at the bottom instead of {{num:ib-example/1/boostx@18}} times.

The rear space must still be sealed off from the room you listen in. Sound from the backs of the cones that comes back through a loft hatch, a door or a vent cancels the bass from the front. The app assumes the rear space is isolated: its leak never reaches the room.

## Myth: "Nothing holds the cone back, so an IB plays louder than a box"

![Maximum SPL: the three designs share nearly the same line, set by the drivers' Xmax in the deep bass and by their 1200 W rating from about 24 Hz up.](chart:ib-example/maxspl)

The **Max SPL** chart shows the opposite of "louder": where the cones are at Xmax, the level depends only on how much air they move, not on what's behind them or on EQ. Four 1184 cm² cones moving 28 mm displace 13.3 L, and at 20 Hz that is {{num:ib-example/1/max@20}} dB at 1 m for the open attic, the Linkwitz Transform and the closed space alike. From about 24 Hz up the drivers' 1200 W rating sets the limit instead ({{num:ib-example/1/max@30}} dB at 30 Hz).

The box and the EQ only decide how hard the amplifier has to work to reach that line. To get to Xmax at 20 Hz the drivers need {{num:ib-example/1/volts@20}} V across them and {{num:ib-example/1/amps@20}} A, yet take only {{num:ib-example/1/pw@20}} W of real power, because their impedance peaks near Fs (**Max SPL** chart, switch to **Volts** or **Amps**). At 2000 W into this 4.2 Ω load an amplifier gives 91.7 V, so this build runs out of amplifier before it runs out of cone at 20 Hz.

## Myth: "An IB doesn't need a subsonic filter"

Half true. Below Fs an IB driver is held back only by its own suspension, so its excursion levels off where the suspension alone holds it, instead of running away as a ported box's does below tuning (see [Subsonic filter: what frequency and slope?](/guides/subsonic-filter/)). For the plain open attic at 2000 W, that level is {{num:ib-nofilter/1/x}} mm at {{num:ib-nofilter/1/xf}} Hz: just past the 28 mm Xmax. Once EQ adds boost, the filter stops being optional:

| High-pass filter | Open attic: peak excursion | + Linkwitz Transform: peak excursion | + Linkwitz Transform: F3 |
|---|---|---|---|
| None | {{num:ib-nofilter/1/x}} mm at {{num:ib-nofilter/1/xf}} Hz ({{num:ib-nofilter/1/xr}} × Xmax) | **{{num:ib-nofilter/2/x}} mm** at {{num:ib-nofilter/2/xf}} Hz ({{num:ib-nofilter/2/xr}} × Xmax) | {{num:ib-nofilter/2/f3}} Hz |
| 24 dB/oct Butterworth at 15 Hz | {{num:ib-bw15/1/x}} mm at {{num:ib-bw15/1/xf}} Hz | {{num:ib-bw15/2/x}} mm at {{num:ib-bw15/2/xf}} Hz ({{num:ib-bw15/2/xr}} × Xmax) | {{num:ib-bw15/2/f3}} Hz |
| **24 dB/oct Linkwitz–Riley at 15 Hz** | {{num:ib-example/1/x}} mm at {{num:ib-example/1/xf}} Hz | **{{num:ib-example/2/x}} mm** at {{num:ib-example/2/xf}} Hz | {{num:ib-example/2/f3}} Hz |

![Cone excursion at 2000 W. With no filter the Linkwitz Transform ({{color:ib-nofilter/2}}) drives the cones to {{num:ib-nofilter/2/x}} mm at {{num:ib-nofilter/2/xf}} Hz; a 24 dB/oct Linkwitz–Riley filter at 15 Hz keeps every design under the 28 mm Xmax line.](chart:ib-nofilter/excursion|ib-example/excursion "No subsonic filter|Linkwitz–Riley 24 dB/oct at 15 Hz")

The Butterworth filter at the same 15 Hz isn't enough: it is flat right down to its corner, so the EQ's boost at 18 Hz gets through almost untouched. A Linkwitz–Riley filter is already 6 dB down at its corner frequency, which costs a little more F3 ({{num:ib-example/2/f3}} Hz against {{num:ib-bw15/2/f3}} Hz) and keeps the cones inside Xmax.

Without a filter the app checks the cone from 20 Hz (or from the design's F3, when that's lower), since there is little music below it; that's why the plain open attic shows no warning even though its curve crosses Xmax at 10 Hz. With a filter switched on, everything from 10 Hz is checked.

## Myth: "IB bass is faster than a sealed box"

![Group delay. Without a filter, the open attic ({{color:ib-nofilter/1}}) and the 2000 L closed space ({{color:ib-nofilter/3}}) are within a fraction of a millisecond of each other at 20 Hz; the subsonic filter adds {{diff:ib-example/1/ib-nofilter/1/gd@20:0}} ms there.](chart:ib-nofilter:1,3/delay|ib-example:1,3/delay "No subsonic filter|Linkwitz–Riley 24 dB/oct at 15 Hz")

"Fast" or "tight" bass usually means low group delay. The 2000 L closed space is a sealed box in all but name, so compare it with the open attic: at 20 Hz the open attic has {{num:ib-nofilter/1/gd@20}} ms and the 2000 L closed space {{num:ib-nofilter/3/gd@20}} ms: the rear space makes almost no difference. The subsonic filter the build needs adds far more, taking the open attic to {{num:ib-example/1/gd@20}} ms at 20 Hz. Whether either is audible is covered in the [group delay guide](/guides/group-delay/); the point here is that the box type isn't what sets it.

## What the Linkwitz Transform costs

The Linkwitz Transform moves the open attic's {{num:ib-example/1/fc}} Hz, Q {{num:ib-example/1/qtc}} response to 18 Hz at Q 0.707 (see [Linkwitz Transform: deep bass from a small sealed box, and what it really costs](/guides/linkwitz-transform/)). With the subsonic filter on, F3 drops from {{num:ib-example/1/f3}} Hz to {{num:ib-example/2/f3}} Hz. The bill:

- **Excursion:** {{num:ib-example/1/x}} mm becomes {{num:ib-example/2/x}} mm at 2000 W, and the drive that takes the cones to Xmax falls from {{num:ib-example/1/xmaxW}} W (more than the four drivers' 4800 W rating) to {{num:ib-example/2/xmaxW}} W.
- **Amplifier voltage:** at 18 Hz the amplifier has to put out {{num:ib-example/2/vout@18}} V instead of {{num:ib-example/1/vout@18}} V. 2000 W into 4.2 Ω is 91.7 V, so at full drive the amplifier clips on deep notes. Turn the drive down, or pick an amplifier with headroom over what the Power bar says.

## Choosing drivers

Without a box to raise its Q, the driver's own Qts and Fs set the shape of the bass:

- **Qts about 0.5 or more** gives a usable response on its own. At Fs the response is down by 20·log(Qts): −6 dB at Qts 0.5, −5.4 dB for this example's {{num:ib-example/1/qtc}}. Lower-Qts drivers work too, but need more EQ boost, and so more excursion and amplifier voltage.
- **EBP (Fs ÷ Qes) under about 50** points the same way. The UMII18-22's is 33.
- **Low Fs** (20–30 Hz) and **lots of displacement** (Sd × Xmax): an IB gets its output from many cones each moving a little, and its maximum SPL in the deep bass depends on nothing else.

The driver database has a filter for this: **Driver → Browse drivers → Filters → Suits → Infinite baffle** lists drivers with Fs up to 30 Hz and either Qts 0.5 or more or EBP under 50. The **Vd** column on wide screens shows each driver's displacement (3315 cm³ for the UMII18-22).

## Doing it in the app

1. **Driver tab:** pick the driver, set **Number of drivers**, and for a dual-coil driver set **Voice coils → Dual**, then **Coils wired** and **Drivers wired**. **Amp load** shows what the amplifier sees (here 4 Ω, Re 4.20 Ω).
2. **Boxes → + Box → Infinite baffle**, then **Rear space**: **Open** for an attic, garage or outdoors, or **Closed space** with its **Volume** for a room, a cupboard or a car boot. The card shows Fc, Qtc and Rear ÷ Vas.
3. Set the power on the **Power bar** (above the charts; on a phone, under the response chart).
4. **Signal → High-pass:** Filter **Linkwitz-Riley**, Slope 24 dB/oct, and a frequency below the lowest note you want.
5. **Signal → EQ → + Filter → Linkwitz Transform**, set **Applies to** the IB design, then **fp** and **Qp**. f0 and Q0 come from the design (**Match the box** fills them again after a change).
6. Check the **Cone excursion** chart (the **Excursion** tab on a phone) and **Max SPL** with **Volts** for what the amplifier must deliver.

## Building it

- **No wall to build into?** A driver on a free-standing board with its back open to the room is an open baffle, a different animal: its bass falls 6 dB/octave below the dipole peak. See [Open baffle speakers](/guides/open-baffle/).
- **The baffle must be stiff.** It carries the drivers' reaction force, which can make a ceiling or a timber wall buzz. Builders often mount drivers in opposed pairs so their forces cancel [1].
- **A manifold** (a short chamber in front of the drivers that opens into the room through one slot) is common. Keep its opening at least as big as the drivers' total cone area so it doesn't add a resonance of its own.
- **Hornresp** opens the design: **Save & Export → Hornresp record** writes an open rear as a box record with no rear chamber, with Eg set to the amplifier voltage across all the drivers so Hornresp's levels match the app's. WinISD has no infinite baffle, so its export leaves these designs out.

## References

1. HTGuide forum, [Cult of the Infinitely Baffled: IB FAQ](https://www.htguide.com/forum/articles/do-it-yourself-diy/956310-cult-of-the-infinitely-baffled).
2. R. H. Small, "Closed-Box Loudspeaker Systems Part I: Analysis", JAES 20 (10), 1972: Qtc = Qts·√(1 + α), α = Vas ÷ Vb.
