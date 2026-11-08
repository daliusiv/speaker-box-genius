---
title: Thiele/Small parameters explained
description: What Fs, Qts, Vas, Xmax and the other T/S parameters mean in practice, how they fit together, and how to enter them without mistakes.
path: guides/thiele-small-parameters
image: ts-spl.png
order: 10
group: start
---

# Thiele/Small parameters explained

Every woofer datasheet has a block of numbers like "Fs 35 Hz, Qts 0.33, Vas 37.4 L". These are its Thiele/Small (T/S) parameters, and a box simulator needs nothing else to predict how the woofer will sound in any box. Here's what each one means, which ones matter most, and how to enter them without mistakes.

[[Open the example driver in the app|ts-example]]

## The example driver

The **Dayton Audio DSA215-8**, an 8″ woofer:

| Parameter | Value | What it is |
|---|---|---|
| Fs | 35 Hz | Resonance in free air |
| Qts | 0.33 | Total Q at resonance |
| Qes | 0.40 | Electrical Q |
| Qms | 1.87 | Mechanical Q |
| Vas | 37.4 L | Air volume as stiff as the suspension |
| Sd | 211 cm² | Cone area |
| Re | 5.9 Ω | Voice coil resistance (DC) |
| Le | 1.0 mH | Voice coil inductance |
| Bl | 10.6 T·m | Motor strength |
| Mms | 34.6 g | Moving mass, air load included |
| Xmax | 5.5 mm | Cone travel, one way, before distortion rises |
| Pe | 80 W | Power handling (thermal) |

## The ones that decide the box

**Fs, the free-air resonance.** The frequency where the cone, on its suspension, wants to move most easily. A box can't make a woofer play much below its Fs efficiently, so a low Fs is the first sign of a deep-bass driver.

**Qts, the total Q.** How much the driver damps its own resonance. It's the single best guide to the box type:

- Under about 0.4: a ported or passive radiator box (the DSA215-8, at 0.33, is one).
- About 0.4 to 0.6: sealed or ported both work.
- Over about 0.6: a sealed box, or an open baffle.

Qts comes from **Qes** (the damping from the motor: the coil and magnet acting as a brake) and **Qms** (the damping from the suspension). Qes does most of the work, so a strong motor means a low Qts.

**Vas, the equivalent volume.** The volume of air that's as springy as the driver's suspension. It sets the box size: a big Vas means a big box. A sealed box for this driver at Qtc 0.707 is 10.4 L; its flat ported box is 16.2 L.

**EBP**, Fs ÷ Qes, is a quick check on the box type: under about 50 suggests sealed, over about 90 ported. This driver's is 88, so it's a ported driver, and the simulation agrees: in a sealed box its F3 is 80 Hz, in the ported box 53 Hz.

![The example driver in its 10.4 L sealed box (blue) and its 16.2 L ported box (orange): its low Qts makes the sealed box roll off early.](img/ts-spl.png)

## The ones that decide how loud

**Sd, the cone area**, and **Xmax, the cone's travel**, multiplied together, give the volume of air the woofer can move: its **displacement**. That sets how loud it can play in the bottom octave, whatever the box. Xmax is one way, peak (some makers quote peak to peak, or a looser figure, so check). The [one 15″ or two 10″ guide](/guides/one-15-vs-two-10s/) shows displacement and power handling deciding which plays louder.

**Pe, the power handling**, is how much power the voice coil takes before it overheats. Using all of it takes an amplifier that can deliver √(Pe × Re) volts: 22 V for this driver (80 W, 5.9 Ω). The **Max SPL** chart's **Volts** and **Amps** views show what's needed at every frequency. In the bass, Xmax usually runs out first; Pe matters in the midbass and with high-pass filters. The app's **Max SPL** chart shows which one limits each frequency.

## The ones underneath

These describe the driver's moving parts directly; the parameters above come from them:

- **Mms**, the moving mass, and **Cms**, the suspension's compliance, set Fs: Fs = 1 / (2π √(Mms · Cms)).
- **Bl**, the motor strength, with **Re**, the voice coil's resistance, sets Qes: Qes = 2π · Fs · Mms · Re / Bl².
- **Rms**, the suspension's losses, sets Qms.
- **Vas** is Cms seen as air: Vas = ρ · c² · Sd² · Cms.
- **Le**, the voice coil inductance, makes the impedance rise with frequency and rolls off the top end. It matters little for subwoofers, more for midbass.

You can check a datasheet with these: for the DSA215-8, 2π × 35 × 0.0346 × 5.9 / 10.6² gives a Qes of 0.40, as stated.

## Entering them without mistakes

You don't need all of them: any consistent set describes the driver, and the rest follows. **Fs, Qes, Qms, Vas, Re and Sd** are the usual set; add **Xmax**, **Pe** and **Le**.

In Speaker Box Genius:

- **What you type is never changed.** Your values show in bold; the values the app works out show in grey. Type them in any order.
- **Contradictions are flagged.** If you type more values than needed and they don't agree (datasheets often differ by a few percent), the app tells you which ones it's using.
- **Paste from the datasheet.** Under **Driver tools**, choose **Paste from datasheet…** and paste the parameter block: the values are picked out, and units like "1.9 ft³" or "35630 mm²" are converted.
- **Or skip typing:** pick the driver from the database of about 1,530 drivers. Each one also has [its own page](/drivers/) with its parameters and suggested boxes.

## Datasheets aren't exact

Real drivers vary from their datasheet, often by 10–20 % on Fs, Qts and Vas, and they change as the suspension breaks in. For a box that matters, **measure your own driver**: under **Driver tools**, **Measure from an impedance sweep…** fits the T/S parameters from a DATS, REW or ARTA sweep, and a second sweep with added mass gives Vas.

[[Open the example driver in the app|ts-example]]

Next: see what the parameters mean for your box in [Sealed, ported or passive radiator?](/guides/sealed-vs-ported/)
