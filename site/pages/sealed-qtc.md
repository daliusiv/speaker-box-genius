---
title: "Sealed box Qtc: 0.5, 0.707 or 1.1, and what you'll hear"
description: What a sealed box's Qtc does to its size, bass extension, maximum output, group delay and in-room sound, with one 10-inch driver in five boxes you can open and change.
path: guides/sealed-qtc
order: 17
group: sealed
---

# Sealed box Qtc: 0.5, 0.707 or 1.1, and what you'll hear

Every sealed box design starts with one choice: the **Qtc**. It decides the box size, and people credit it with everything from "tight" to "boomy" bass. This guide puts one driver in five sealed boxes, from Qtc 0.5 to 1.1, and shows what really changes: the size, the deep bass, the power it takes, the timing, and how the box gets on with your room.

[[Open the worked example|qtc-example]]

## What Qtc is

A driver on its own resonates at Fs with a total Q of Qts. Put it in a sealed box and the air inside adds a second spring, so both rise by the same factor: the system resonates at **fc** with a total Q of **Qtc** [1]:

- Qtc = Qts × √(1 + Vas ÷ Vb), and fc = Fs × √(1 + Vas ÷ Vb).

The app sizes its presets the way WinISD does, which counts two small things the textbook formula leaves out: the resistance of the amplifier and cable in front of the coil (0.1 Ω by default, in **Settings**), which raises the driver's Q a little, and the damping of the box itself. So its Qtc 0.707 box comes out a few per cent bigger than the formula gives, and reads 0.707 once it's built.

A smaller box means a stiffer air spring, so a higher fc and a higher Qtc. The Qtc sets the shape of the roll-off; the textbook values have names [2][3]:

| Qtc | Name | Shape |
|---|---|---|
| 0.5 | Critically damped | No overshoot after a step; the earliest, gentlest roll-off |
| 0.577 | Bessel | The flattest group delay |
| 0.707 | Butterworth | The flattest response, no peak |
| above 0.707 | | A peak before the roll-off: about 1.25 dB at Qtc 1.0, growing quickly above that |

You can only go up from the driver's own Qts: a driver with Qts 0.45 can't make a Qtc 0.5 box, however big.

## The worked example

A **Dayton Audio RSS265HO-4**, a 10″ subwoofer with Fs 26.9 Hz, Qts 0.36, Vas 29.4 L, Xmax 12.3 mm and a 600 W rating, at **100 W**. Voice-coil inductance is off in Settings, so each box's own shape shows:

| Qtc | 0.5 | 0.577 | 0.707 | 0.9 | 1.1 |
|---|---|---|---|---|---|
| Box (net) | **32.9 L** | 19.3 L | **10.6 L** | 5.7 L | **3.6 L** |
| fc | 37.0 Hz | 42.7 Hz | 52.3 Hz | 66.8 Hz | 81.4 Hz |
| F3 | 58.9 Hz | 56.5 Hz | **55.5 Hz** | 59.1 Hz | 65.7 Hz |
| Peak above the passband | none | none | none | 0.5 dB | 1.4 dB |
| Level at 40 Hz | −5.6 dB | −5.8 dB | −6.6 dB | −9.1 dB | −12.1 dB |
| Level at 25 Hz | **−10.5 dB** | −11.6 dB | **−13.9 dB** | −17.5 dB | **−20.8 dB** |
| Group delay at 40 Hz | 4.2 ms | 4.8 ms | 5.0 ms | 4.0 ms | 2.8 ms |
| Max SPL at 30 Hz | 100.2 dB | 100.2 dB | 100.2 dB | 97.0 dB | 93.8 dB |
| …limited by | Xmax, at 327 W | Xmax, at 384 W | Xmax, at 577 W | the 600 W rating | the 600 W rating |

Three things stand out.

**F3 hardly moves.** From Qtc 0.5 to 0.9 the box shrinks from 33 L to 5.7 L, yet the F3 stays between 56 and 59 Hz. The F3 alone hides the difference: the low-Q boxes start rolling off earlier but fall more gently, so an octave further down they're far louder. At 25 Hz the Qtc 0.5 box is 3.4 dB ahead of the Qtc 0.707 box and 10.3 dB ahead of the Qtc 1.1 box.

**Maximum output is set by the cone, not the box.** At 30 Hz the three bigger boxes all reach the same 100.2 dB, where the cone hits its Xmax. The smaller of them needs almost twice the power to get there (577 W against 327 W). The two smallest boxes run out of the driver's 600 W rating first, a few dB short. A small box doesn't lower the ceiling; it makes the amplifier and the voice coil work harder to reach it. The same holds for EQ: see the [Linkwitz Transform guide](/guides/linkwitz-transform/).

**Above 0.707 a peak appears.** Small at 0.9 (0.5 dB), clearer at 1.1 (1.4 dB in this simulation, with the default box losses taking a little off the textbook value), and the deep bass falls away fast.

## What you'll hear

**Timing.** A low Qtc has the best-behaved step response, and the gap is often blamed for "slow" or "boomy" bass. But look at the group delay: at 40 Hz every box is within about 2 ms of the others, and one cycle at 40 Hz lasts 25 ms. The best-known listening tests on group delay found thresholds of 1–3 ms, but only from 500 Hz up [4]; in the bass, thresholds are usually taken to be around a cycle or more [5]. The ringing of a Qtc 1.0 box lasts a cycle or so of a note that goes on for many [3]. These boxes don't differ audibly in their timing; they differ in their **frequency response**: how much deep bass, and whether there's a peak. The [group delay guide](/guides/group-delay/) compares sealed and ported boxes the same way.

**Free-standing (anechoic)**, then:

- **Qtc 0.5–0.6:** the most deep bass for the driver, in the biggest box; the upper bass starts falling early, so on its own it can sound a little lean.
- **Qtc 0.707:** flat, in a box a third the size. The usual default, and the app's **Size all boxes** choice.
- **Qtc 0.8–1.0:** a small box with a slight lift in the upper bass and less below it.
- **Above about 1.1:** a clear peak and little deep bass: the "boomy" sealed box.

**In a room**, the room adds bass below its lowest mode: in theory up to 12 dB per octave, less in real rooms with real walls [6]. A sealed box that falls gently gets that back, which is why low-Q sealed subwoofers have a reputation for sounding even and "tight" in rooms, and why a box with a peak plus room gain can sound boomy. With the app's **Room** gain preset (a 5 m room, 6 dB per octave), the boxes are at **−6.7 dB** (Qtc 0.5), **−10.1 dB** (0.707) and **−17.0 dB** (1.1) at 25 Hz. In a car the cabin gain is larger still, which is one reason small, high-Q sealed boxes work there.

## Choosing

- **For a subwoofer in a room, with space to spare:** Qtc 0.5–0.6. You get the deepest output for the power, and the room fills in the slope.
- **For a woofer that has to be flat on its own** (a bookshelf or a tower that won't sit near a wall): Qtc 0.707.
- **When space is tight:** go down to 0.8–0.9 and accept a little less deep bass, or keep the small box and add a [Linkwitz Transform](/guides/linkwitz-transform/) to get the deep bass back with amplifier power.
- **Above about 1.1:** only when there's no room for anything bigger, and plan to EQ the peak.

Stuffing makes a box act a little bigger, which lowers its Qtc a little; the [box stuffing guide](/guides/box-stuffing/) has the numbers.

## Doing it in the app

1. Load your driver, and open the sealed design on the **Boxes** tab.
2. Press a preset (**Qtc 0.5**, **0.577** or **0.707**) to size the box, or type any volume: the summary above the charts shows the Qtc and fc it gives.
3. Duplicate the design to compare two boxes on the same charts, and set **Space** to **Room** (or **Car cabin**) on the **Signal** tab to see them in a room.
4. Check the **Max SPL** chart at the power you'll use, and its **Volts** view for what the amplifier must deliver.

[[Open the worked example|qtc-example]]

## Sources

1. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 798–808, December 1972: the closed box as a second-order high-pass set by its resonance and total Q. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2022).
2. True Audio, [WinSpeakerz tutorial](https://www.trueaudio.com/about_2.htm): Qtc 0.5 critically damped (no overshoot), 0.577 Bessel, 0.707 Butterworth, 1.0 slightly peaked.
3. [Box Q](https://www.geocities.ws/kreskovs/Box-Q.html): step and frequency responses for Qtc 0.5, 0.707 and 1.0, the 1.25 dB peak at Qtc 1.0, and why the extra cycle of ringing matters little for a sustained bass note.
4. J. Blauert and P. Laws, "Group delay distortions in electroacoustical systems", *J. Acoust. Soc. Am.* 63 (5), 1478–1483, May 1978. [doi:10.1121/1.381841](https://doi.org/10.1121/1.381841).
5. True Audio, [Group delay](https://trueaudio.com/post_010.htm): extending Blauert and Laws's thresholds to low frequencies as about one to two cycles.
6. Audioholics, [Sealed vs ported subwoofers](https://www.audioholics.com/loudspeaker-articles/sealed-vs-ported-subwoofers): room gain below the lowest room mode (12 dB per octave in theory, less with real walls), and the excursion a low-Qtc box needs for its deep bass.
