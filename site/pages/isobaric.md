---
title: "Isobaric subwoofers: half the box, but what does it cost?"
description: What an isobaric pair really does (and doesn't do) to box size, sensitivity, output, impedance and power handling, with numbers from a worked 10-inch example checked against WinISD.
path: guides/isobaric
image: chart:iso-pair/response
order: 15
group: sealed
---

# Isobaric subwoofers: half the box, but what does it cost?

"Isobaric" sounds like a free lunch: put two woofers together and get the same bass from half the box. Forum threads on it go in circles about sensitivity ("you lose 3 dB", "you lose 6 dB", "you lose nothing") because the answer depends on how you wire the pair and what you compare it with. Here's what an isobaric pair really does, with numbers, and when it's worth the second driver.

[[One driver in its box|iso-single]] [[Isobaric pair in half the box|iso-pair]]

## What an isobaric pair is

Two identical woofers are mounted so that they share a small, sealed pocket of air between them, and they're driven together, so they move as one [1]. Only one cone faces the room; the other faces the box. Common arrangements:

- **Cone to magnet** (in line, "tunnel"): one driver behind the other, both facing the same way.
- **Face to face** ("clamshell"): cone to cone. One driver must be wired in reverse so they move together.
- **Magnet to magnet**: back to back, also with one wired in reverse.

The arrangement changes the build, not the bass: the simulation is the same for all three.

## What happens to the parameters

The pair behaves like one driver with:

- **twice the moving mass** and **half the suspension compliance**, so the **same Fs** [1][2];
- **the same Qts**;
- **half the Vas**, so it needs **half the box** for the same alignment [1][2];
- the same cone area (only one cone radiates) and the same Xmax.

The impedance and sensitivity depend on how the two voice coils are wired, which is where the arguments come from.

## The worked example

A **Dayton Audio RSS265HF-4** 10″ subwoofer (4 Ω, 350 W) in its textbook Qtc 0.707 sealed box: **37.3 L** for one driver, **18.7 L** for an isobaric pair. (The app's Qtc 0.707 preset, sized like WinISD's, makes them a little bigger: 39.8 L and 19.9 L.) Behind a 24 dB/oct high-pass at 18 Hz:

| | Single, 37.3 L | Pair (coils parallel), 18.7 L | Pair (coils series), 18.7 L |
|---|---|---|---|
| F3 / Qtc | {{num:iso-single/1/f3}} Hz / {{num:iso-single/1/qtc}} | {{num:iso-pair/1/f3}} Hz / {{num:iso-pair/1/qtc}} | {{num:iso-series/1/f3}} Hz / {{num:iso-series/1/qtc}} |
| Impedance (lowest above 60 Hz) | {{num:iso-single/1/zmin}} Ω | **{{num:iso-pair/1/zmin}} Ω** | {{num:iso-series/1/zmin}} Ω |
| Output at 60 Hz, **10 V** | {{num:iso-single/1/v10@60}} dB | {{num:iso-pair/1/v10@60}} dB | **{{num:iso-series/1/v10@60}} dB** |
| Output at 60 Hz, **100 W** | {{num:iso-single/1/spl@60}} dB | **{{num:iso-pair/1/spl@60}} dB** | **{{num:iso-series/1/spl@60}} dB** |
| Cone excursion at 100 W | {{num:iso-single/1/x}} mm | {{num:iso-pair/1/x}} mm | {{num:iso-series/1/x}} mm |
| **Maximum SPL at 25 / 30 / 40 Hz** | {{num:iso-single/1/max@25}} / {{num:iso-single/1/max@30}} / {{num:iso-single/1/max@40}} dB | **the same** | **the same** |
| Amplifier needed at 30 Hz to reach it | {{num:iso-single/1/volts@30:0}} V, {{num:iso-single/1/amps@30}} A | {{num:iso-pair/1/volts@30:0}} V, **{{num:iso-pair/1/amps@30}} A** | **{{num:iso-series/1/volts@30:0}} V**, {{num:iso-series/1/amps@30}} A |

![The isobaric pair in 18.7 L ({{color:iso-pair/1}}, F3 {{num:iso-pair/1/f3}} Hz) has almost exactly the single driver's response in 37.3 L (F3 {{num:iso-pair/1/f3}} Hz and Qtc {{num:iso-pair/1/qtc}}, against {{num:iso-single/1/f3}} Hz and {{num:iso-single/1/qtc}}). In the full 37.3 L box ({{color:iso-pair/2}}, F3 {{num:iso-pair/2/f3}} Hz) the pair is over-damped (Qtc {{num:iso-pair/2/qtc}}): a softer, more gradual corner.](chart:iso-pair/response)

## What the numbers say

**The box really is half the size,** for almost exactly the same response: F3 {{num:iso-single/1/f3}} Hz and Qtc {{num:iso-single/1/qtc}} for one driver, {{num:iso-pair/1/f3}} Hz and {{num:iso-pair/1/qtc}} for the pair in parallel, {{num:iso-series/1/f3}} Hz and {{num:iso-series/1/qtc}} in series. The small differences come from the 0.1 Ω of amplifier and cable resistance, which weighs more against the parallel pair's halved impedance than against the series pair's doubled one.

**The output per watt is 3 dB lower,** however you wire the coils. You're powering two motors to move one cone's worth of air [1]. At 100 W, the pair plays {{diff:iso-single/1/iso-pair/1/spl@60}} dB quieter than the single driver at 60 Hz.

**The output per volt depends on the wiring:**

- **Coils in parallel:** about the same output per volt as one driver, but the impedance **halves** (here to {{num:iso-pair/1/zmin}} Ω), so the amplifier delivers twice the current and twice the power for the same voltage [3]. Check your amplifier is stable into that load.
- **Coils in series:** the impedance **doubles** ({{num:iso-series/1/zmin}} Ω), and the output per volt is **6 dB lower** [4]. You need twice the voltage for the same output; into twice the impedance, that's twice the power, the same 3 dB-per-watt penalty.

**The maximum output is the same as one driver** in its full-size box. Only one cone radiates, with the same area and the same Xmax, so it hits the same excursion limit at the same SPL [5]. The pair needs twice the power to get there: at 30 Hz, about the same voltage ({{num:iso-pair/1/volts@30:0}} V) but twice the current ({{num:iso-pair/1/amps@30}} A) with the coils in parallel, or twice the voltage ({{num:iso-series/1/volts@30:0}} V) with them in series. It can also **handle** twice the power, so thermally it has more headroom. Switch the app's **Max SPL** chart to **Volts** or **Amps** to see what your amplifier has to deliver at each frequency.

**The cone moves less at the same power** ({{num:iso-pair/1/x}}–{{num:iso-series/1/x}} mm instead of {{num:iso-single/1/x}} mm at 100 W), because the power is shared between two motors.

So, compared with one driver in its full box, an isobaric pair gives you: **half the box**, the **same response**, the **same maximum output**, **3 dB less per watt**, **double the power handling**, and a **lower or higher impedance**, for the price of a second driver.

## Compared with two drivers side by side

If you have room for two drivers, compare the pair with two drivers in a normal box twice the single box's size: those have twice the cone area, so they're **6 dB louder at the same voltage** (in parallel) and **6 dB higher in maximum output**, for four times the isobaric pair's box volume [3][5]. Isobaric is the answer only when box size is the limit.

## Don't put the pair in the old box

A common mistake is to add a second driver isobarically to an existing box. The pair needs half the volume; in the original box it's like a single driver in a box twice its correct size. In the example, the pair in the full 37.3 L has a **Qtc of {{num:iso-pair/2/qtc}}**: an over-damped, gently drooping response instead of the flat one (Qtc about 0.7) it was designed for.

## Building one

- **The pocket between the drivers** isn't part of the box volume. Keep it small and sealed; a large or leaky pocket stops the drivers acting as one [1].
- **Polarity:** in the face-to-face and magnet-to-magnet arrangements one driver is reversed, both mechanically and electrically. Check that the cones move the same way with a battery before you seal the box.
- **Distortion:** with the face-to-face or magnet-to-magnet arrangement, the two motors work in opposite directions, so some of their even-order distortion cancels, a small bonus [3].
- **Ported and bandpass boxes** work the same way: design them for the pair's parameters (half the Vas), and the box is half the size.

In the app: on the **Driver** tab, set **Loading** to **Isobaric pairs** and choose how the **Pair coils** are wired. The number of drivers then counts pairs. The app's isobaric model is checked against WinISD for sealed and ported boxes [6].

[[Open one driver in its box|iso-single]] [[Open the isobaric pair|iso-pair]]

## Sources

1. [Isobaric loudspeaker](https://en.wikipedia.org/wiki/Isobaric_loudspeaker), Wikipedia: the arrangements, the halved compliance and doubled mass (unchanged resonance), and the 3 dB lower efficiency.
2. [Isobaric subwoofer box design: advantages and disadvantages](https://audiojudgement.com/isobaric-subwoofer-box-design/), Audio Judgement: how Vas halves while Fs stays the same.
3. [diyAudio: push-pull coupled basses](https://www.diyaudio.com/community/threads/push-pull-coupled-basses.165084/page-2): isobaric pairs in parallel keep the voltage sensitivity and lose 3 dB of efficiency; push-pull arrangements and even-order distortion.
4. [diyAudio: isobaric series and parallel](https://www.diyaudio.com/community/goto/post?id=7975086): with the coils in series, the response is 6 dB lower for the same input voltage.
5. [CarAudio.com: isobaric help](https://www.caraudio.com/threads/gt-gt-gt-need-isobaric-help-lt-lt-lt.460083/): maximum SPL of an isobaric pair equals a single driver in twice the box, with twice the power.
6. Speaker Box Genius [validation against WinISD](https://speakerboxgenius.com/validation/#winisd-iso-sealed): isobaric pairs in sealed and ported boxes (tests 9 and 10).
