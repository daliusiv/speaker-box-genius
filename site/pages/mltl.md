---
title: "Mass-loaded transmission lines (MLTL): tuning a tall ported tower"
description: Why a tall, slim ported box behaves as a mass-loaded line, and how to set its port, driver position and stuffing, with a worked 8-inch example you can open and change.
path: guides/mltl
order: 18
---

# Mass-loaded transmission lines (MLTL): tuning a tall ported tower

A mass-loaded transmission line (MLTL) is a tall, straight box with the driver near the top and a port near the bottom. It looks like a ported tower, and it's tuned like one, but the air inside doesn't act like a ported box's. This guide shows what changes, and how to set the port, the driver position and the stuffing so the line helps instead of hurting.

[[Open the worked example|mltl-example]]

## A ported box that's long enough to be a line

A ported-box calculator such as WinISD treats the air in the box as one spring and the air in the port as one mass. That holds while the box is small next to the wavelengths involved. Stretch the same volume into a tall, slim column and the air inside starts to behave as a pipe: standing waves form along it, and they shape both the tuning and the response. Martin King's quarter-wave models made this visible, and he describes the MLTL as a line whose quarter-wave standing waves act as the spring for the mass of air in the port [1][5]. George Augspurger reached the same picture with an electrical model of damped pipes, and the two agree closely [3][4].

So "MLTL" isn't an exotic box. Any ported tower whose height is several times its width is one, whether you call it that or not, and a ported-box calculator will get parts of it wrong.

> Want the basics of lines first? The [transmission line guide](/guides/transmission-line/) covers the main types and compares an MLTL with a classic and an offset line.

## The worked example

The **Dayton Audio DSA215-8** 8″ woofer (Fs 35 Hz, Qts 0.33, Xmax 5.5 mm) at **25 W** behind a **28 Hz high-pass filter**, in the MLTL the app's **Compare types** makes for it: **24.3 L** as a line **86 cm** long and **16.8 × 16.8 cm** inside, the driver 22 cm from the closed end, and a **7.3 cm** port at the far end, tuned to **40 Hz**. Next to it, the same volume and port as a plain ported box, and the same line with no stuffing:

| | Ported box (simple model) | MLTL, empty | MLTL, stuffed behind the driver |
|---|---|---|---|
| Port length | 27.1 cm | 21.6 cm | 21.6 cm |
| Tuning | 39.8 Hz | 41.6 Hz | 40.0 Hz |
| F3 | 43.3 Hz | 40.0 Hz | **40.2 Hz** |
| Ripple above F3 | 1.1 dB | **31.7 dB** | **3.7 dB** |
| Peak cone excursion | 4.9 mm | 5.2 mm | 5.1 mm |
| Peak port air speed | 10.7 m/s | 13.8 m/s | 12.8 m/s |

*Ripple is the peak-to-peak variation of the response from 1.5 × F3 to 400 Hz, as the app's **Best line** measures it.*

Two things a ported-box calculator misses:

- **The port is shorter for the same tuning.** In the line, 21.6 cm tunes to 40 Hz; the ported-box formula asks for 27.1 cm. Built with the longer port, this tower tunes to **36.5 Hz** instead of 40.
- **The empty line rings.** Its response has a peak and a deep notch near **210 Hz**, close to where the 86 cm column is half a wavelength long (about 200 Hz). The simple model shows none of it, and in the real box you'd hear it as a coloured upper bass.

Stuffed behind the driver, the line keeps its bass (F3 40.2 Hz, a few hertz lower than the simple model predicts) and the ripple drops to 3.7 dB.

## Step 1: the port sets the tuning

As in a ported box, a wider port needs a longer tube for the same tuning, and moves less air per square centimetre. Retuned to 40 Hz each time:

| Port | Length for 40 Hz | Peak air speed | F3 | Ripple |
|---|---|---|---|---|
| 5 cm | 9.6 cm | 26.9 m/s | 40.4 Hz | 3.2 dB |
| 6 cm | 14.2 cm | 18.8 m/s | 40.4 Hz | 3.3 dB |
| 7.3 cm | 21.6 cm | 12.8 m/s | 40.2 Hz | 3.7 dB |
| 9 cm | 33.2 cm | 8.6 m/s | 39.9 Hz | 5.5 dB |
| 10 cm | 40.9 cm | 7.1 m/s | 39.6 Hz | 8.2 dB |

The narrow ports chuff (the usual limit is about 17 m/s; see the [port guide](/guides/port-chuffing/)). The wide ones are quiet but long, and the ripple grows. In between, 7.3 cm is quiet enough at 25 W and keeps the line smooth. That's the MLTL preset's choice: it widens the port only until the air speed is under 15 m/s at your power.

In the app, type the tuning you want and press **Set port length**: the app finds the length from the line model, not the ported-box formula.

## Step 2: where the driver goes

The driver's position along the line decides which standing waves it drives. Moving it along this line, with everything else the same:

| Driver from the closed end | F3 | Ripple | Peak cone excursion |
|---|---|---|---|
| 0 (at the end) | 40.6 Hz | 7.9 dB | 4.7 mm |
| 10 % (9 cm) | 40.5 Hz | 6.4 dB | 4.8 mm |
| 20 % (17 cm) | 40.3 Hz | 3.9 dB | 5.0 mm |
| 25 % (22 cm) | 40.2 Hz | 3.7 dB | 5.1 mm |
| 33 % (28 cm) | 40.1 Hz | 3.5 dB | 5.1 mm |
| 50 % (43 cm) | 39.7 Hz | 2.7 dB | 5.2 mm |

At the closed end the driver excites the line's resonances fully; a fifth of the way along or more, the ripple halves. Further down helps a little more, but in a tower the driver usually sits near ear height with the tweeter above it, so 20–35 % from the top is where most MLTLs end up. **Best line** in the line's card tries the positions and the stuffing together.

## Step 3: stuff behind the driver, not the whole line

Stuffing (polyester fibre, wool) soaks up the standing waves, but it also damps the port's air, which is what makes the bass. Where it goes matters more than how much:

| Stuffing | Behind the driver only (22 cm): F3 | Ripple | The whole line: F3 | Ripple |
|---|---|---|---|---|
| None | 40.0 Hz | 31.7 dB | 40.0 Hz | 31.7 dB |
| 4 kg/m³ | 40.3 Hz | 5.7 dB | 44.8 Hz | 1.4 dB |
| 8 kg/m³ | 40.2 Hz | 3.7 dB | 49.3 Hz | 0.9 dB |
| 12 kg/m³ | 40.1 Hz | 2.8 dB | 53.1 Hz | 1.1 dB |

Stuffing behind the driver tames the ripple at no cost in bass. Filling the whole line smooths it a little more, but the F3 climbs by 5 to 13 Hz: the port can no longer do its job, and the box turns into a leaky, heavily damped one. Start with **8 kg/m³ behind the driver** (light polyester fibre is about 4–8 kg/m³) and leave the rest of the line open. Why fibre slows sound and makes air act springier is in the [box stuffing guide](/guides/box-stuffing/).

## Step 4: check the excursion and the port

Below its tuning an MLTL lets go of the cone like any ported box, so check the **Cone excursion** chart at your real power with a high-pass filter in place: here 5.1 mm against the 5.5 mm Xmax at 25 W behind 28 Hz. Then check the **Port speed** chart against the chuffing line, and open **Pressure and air speed inside** in the line's card to see the standing waves along the line at any frequency.

## Checklist

1. Add a **Transmission line** design, press **Compare types**, and pick the **MLTL** (or press its preset).
2. Set the tuning with **Set port length**, and widen the port if the air speed is over the chuffing line.
3. Put the driver 20–35 % of the way along the line, or let **Best line** choose.
4. Stuff the section behind the driver; leave the rest open.
5. Check the excursion and the port speed at your real power, with a high-pass filter.
6. Fold it if you need to (an MLTL is usually built straight), and print the cut list from the **Build** tab.

[[Open the worked example|mltl-example]]

## Sources

1. Martin J. King, [Quarter Wavelength Loudspeaker Design](http://www.quarter-wave.com/): models, alignment tables and test-line measurements for transmission lines, TQWTs and mass-loaded lines.
2. Bjørn Johannesen, [Pearls from Martin J. King quarter wave design](https://t-linespeakers.org/design/MJK-for-dummies/index.html), t-linespeakers.org, 2005 (reviewed by King): tuning by length and geometry, driver Qts, and mass-loading a line with a port.
3. G. L. Augspurger, "Loudspeakers on Damped Pipes", 2000. [AES E-Library](https://aes.org/publications/elibrary-page/?id=12064); expanded in his three-part "Transmission Lines Updated", *Speaker Builder*, 2000.
4. [Read Me First](https://t-linespeakers.org/readme1st.html), t-linespeakers.org: Augspurger's electrical model and King's model of quarter-wave lines in close agreement, and most projects designed with King's software being mass-loaded.
5. Martin J. King, [forum post on the Salk SongTower review](https://forums.audioholics.com/forums/goto/post?id=455258), Audioholics: an ML TL uses quarter-wave standing waves as the spring for the mass of air in the port.
