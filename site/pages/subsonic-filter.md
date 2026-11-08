---
title: "Subsonic filter: what frequency and slope?"
description: Why ported and passive radiator boxes need a high-pass filter below their tuning, and how to choose its frequency and slope, with a worked 12-inch subwoofer example.
path: guides/subsonic-filter
image: subsonic-on.png
order: 7
group: ported
---

# Subsonic filter: what frequency and slope?

A ported subwoofer can play loud at 30 Hz and still tear itself apart at 15 Hz. A subsonic filter (a high-pass filter set below the bass you want) stops that. Here's why a ported box needs one, and how to pick its frequency and slope.

[[Open the example without the filter|subsonic-off]]

## Why a ported box needs one

Around its tuning frequency, a ported box's port does most of the work and holds the cone almost still. Below the tuning, the port stops helping: the air simply rushes in and out of it, and nothing holds the cone back. It moves further and further as the frequency drops, while making hardly any sound.

That's where trouble comes from: rumble, record warps, wind noise on a recording, bass-heavy film effects. The cone flaps past its Xmax, the sound distorts, and the voice coil can hit the back plate.

A **sealed box** is much less exposed, because the air in the box keeps holding the cone back below its resonance. Passive radiator boxes behave like ported ones, only more so.

## The worked example

The 12″ **Dayton Audio RSS315HF-4** from the [port guide](/guides/port-chuffing/), in its flat alignment (83.5 L, tuned to 23.8 Hz, with a 5 × 30 cm slot port), at **300 W**. Its Xmax is **14.3 mm**.

| High-pass filter | Peak cone excursion | F3 | Output at 20 Hz |
|---|---|---|---|
| None | **35.4 mm** at 10 Hz: 2.5 × Xmax | 23.3 Hz | −6.8 dB |
| 12 dB/oct at 20 Hz | 13.0 mm at 16 Hz | 25.8 Hz | −9.8 dB |
| 24 dB/oct at 15 Hz | 19.1 mm at 16 Hz: over Xmax | 23.5 Hz | −7.2 dB |
| 24 dB/oct at 18 Hz | 13.6 mm at 18 Hz | 23.9 Hz | −8.3 dB |
| **24 dB/oct at 20 Hz** | **10.7 mm** at 34 Hz | 24.5 Hz | −9.8 dB |

![Cone excursion with no filter: under Xmax across the useful range, then far past it below 20 Hz.](img/subsonic-off.png)

![The same sub with a 24 dB/oct filter at 20 Hz: the cone stays inside its Xmax at every frequency.](img/subsonic-on.png)

With no filter, the cone is fine down to about 20 Hz and then shoots past its Xmax. A 24 dB/oct filter at 20 Hz keeps it within 10.7 mm, and costs just over a hertz of F3.

[[Open the example with the filter|subsonic-on]]

## No filter? How the app grades deep bass

Speakers on an ordinary stereo amplifier or AV receiver usually have no subsonic filter, and most ported speakers go past Xmax somewhere below their tuning at full power. Music has little energy down there, so without a high-pass filter the app grades a ported, passive radiator or line box's **deep bass** instead of failing it:

- Above **0.7 × the tuning**, the cone must stay within Xmax at your power.
- Below it, down to 20 Hz, it may reach **2 × Xmax** (the usual margin before damage). Past Xmax there shows in **amber**, with the power that keeps it within, not as a red ⚠.
- Below 20 Hz there's no music to check.

![A ported 8″ woofer at 50 W with no filter: Xmax is reached only in the shaded deep-bass zone, well under its 2 × Xmax line.](img/deep-bass-zone.png)

That's fine for most listening. For bass-heavy music or films at full power, and for subwoofers, fit a filter: with one switched on, the app checks everything from 10 Hz. (The 12″ sub above is tuned so low that its deep-bass zone would start below 20 Hz, so it has none.)

## Choosing the frequency

Start **a little below the box's tuning**, about 0.8 times Fb (19 Hz for this sub), then check the cone excursion chart at your real power and move it until the cone stays under Xmax everywhere. Too low, and it doesn't protect (24 dB/oct at 15 Hz still lets the cone reach 19 mm). Too high, and you lose the bass you built the box for.

## Choosing the slope

- **24 dB/oct (4th order)** is the usual choice for ported and passive radiator boxes: it cuts hard below the frequency, so it can sit close to the tuning.
- **12 dB/oct (2nd order)** is gentler: it has to sit higher for the same protection, and it cuts more of the wanted bass.
- **Sealed boxes** often need only a gentle 12 dB/oct filter, or none.

Butterworth filters are flat to the corner; Linkwitz–Riley filters start rolling off earlier (−6 dB at the corner frequency) and protect a little more for the same setting.

A steep filter adds some **group delay** (in the example, from 25 ms to 43 ms at 25 Hz with the 24 dB/oct filter). That's well below what people notice at those frequencies.

## Where the filter lives

Most subwoofer plate amplifiers, car amplifiers and DSPs have a "subsonic" or "high-pass" setting; some have a fixed one. If yours has a fixed filter, enter its frequency and slope in the app to see whether it protects the driver.

On a PC (Equalizer APO), a Raspberry Pi (CamillaDSP) or a miniDSP, the app can write the filter for you: **Export to DSP** at the bottom of the **Signal** tab saves it as biquads at your sample rate, with any EQ.

## Doing it in the app

1. Set the power you'll use on the Power bar above the charts.
2. On the **Signal** tab, under **High-pass filter**, pick a filter type, then its slope and frequency.
3. Check the **Cone excursion** chart (and the **PR excursion** chart for a PR box): every curve should stay under its red Xmax line.
4. Check the response: the filter's cost in bass shows straight away.

> The filter applies to every design on the charts, so you can see at once which boxes it protects.
