---
title: "Hofmann's Iron Law: PA subwoofer vs home subwoofer"
description: Efficiency, bass extension and box size, pick two. A B&C PA 18″ against a Dayton home 18″, in each other's boxes, at 1 W and at full power, worked out from Thiele/Small parameters with charts you can open and change.
path: guides/hofmann-iron-law
image: iron-law.png
order: 24
group: start
---

# Hofmann's Iron Law: PA subwoofer vs home subwoofer

Every bass thread gets to it sooner or later: you can have **deep bass, a small box, or high efficiency, pick two**. That's Hofmann's Iron Law. A PA subwoofer driver picks efficiency; a home subwoofer driver picks depth. Here's the law, where it comes from, and what it does and doesn't say, shown with a B&C 18″ PA driver and a Dayton Audio 18″ home driver from the database, first in each other's boxes, then at full power.

[[Open both drivers in both ported boxes|iron-law]] [[Open both in a sealed box|iron-law-sealed]]

## The short answer

- **The law:** a woofer system's efficiency is proportional to its box volume times the cube of its cut-off frequency. Go an octave deeper in the same box and you lose 9 dB of efficiency. Halve the box at the same cut-off and you lose 3 dB.
- **It holds.** The two drivers here differ by 5.9 dB in efficiency, and each in its own flattest ported box (QB3) lands on the same law within 0.3 dB: the PA driver gets 94.9 dB per watt down to 49 Hz from 70 L, the home driver 89.0 dB down to 23 Hz from 168 L.
- **The surprise: in the same box, they make the same deep bass per watt.** Below about 40 Hz the two are within about 1 dB of each other at 1 W, in a PA box and in a home box. The PA driver's extra 4–6 dB is all in the upper bass. Turn that down with EQ and it's a home sub. That's the Iron Law too: the extra efficiency was only ever above its cut-off.
- **It's a law about efficiency, not loudness.** Maximum output is set by power handling, cone displacement and the port. With its rated 1,700 W the PA driver plays up to 6 dB louder above 50 Hz; in a sealed box the home driver's 3.1 L of displacement against 1.7 L makes it up to 4.7 dB louder below 25 Hz.
- **Nothing beats it; you choose where to pay.** EQ, bigger amplifiers, ports, horns and more drivers all move you along it, spending watts, volume or money.

## Where the law comes from

The name: Josef Anton Hofmann, the "H" in KLH, which he founded in 1957 with Henry Kloss and Malcolm Low after the three had backed Acoustic Research [1][2]. It's usually spelled "Hoffman" on forums. Kloss named it "Hofmann's Iron Law" in a 1971 *Audio* article: efficiency goes with the box volume times the system's resonance squared times its damping frequency, so for a given response shape, **efficiency ∝ V × f³** [3]. Kloss's own example: the same response in half the volume costs 3 dB of efficiency [3]. A 1973 Boston Audio Society article used it to explain why the deeper, smaller Smaller Advent was less efficient than the KLH Seventeen [4].

Thiele and Small put numbers on it. A driver's **reference efficiency**, the power it radiates in its passband per watt it takes, follows from three of its parameters [5][6]:

**η₀ = (4π² / c³) × Fs³ × Vas / Qes**

1 W at η₀ = 1 % (0.01) gives about **92 dB at 1 m** (112 dB + 10 × log η₀, in half space). For a system with a given alignment, Small showed it becomes [5][7]:

**η₀ = kη × F3³ × Vb**

where kη depends only on the box type and alignment. Small found a vented box's best kη is about 2.9 dB higher than a sealed box's: the same cut-off from the same volume, with 2.9 dB more efficiency [7][8]. Don Keele's 1976 comparison found horns are "quite wasteful" of enclosed volume next to direct radiators [9].

What it predicts:

| Change | Efficiency |
|---|---|
| One octave deeper, same box | −9 dB (2³ = 8 times less) |
| Half the box, same cut-off | −3 dB |
| One octave deeper, same efficiency | 8 times the box |

## The two drivers

| | B&C 18SW115 (8 Ω) | Dayton Audio SS18-22 (coils in series, 4 Ω) |
|---|---|---|
| Made for | PA and touring subwoofers | Home and car subwoofers |
| Fs | 32 Hz | 21 Hz |
| Qes / Qts | 0.32 / 0.30 | 0.42 / 0.37 |
| Vas | 187 L | 224 L |
| Moving mass (Mms) | 275 g | 497 g |
| Motor strength per watt (Bl²/Re) | 173 | 158 |
| Cone area (Sd) | 1,210 cm² | 1,188 cm² |
| Xmax (one way) / displacement (Sd × Xmax) | 14 mm / 1.69 L | 26 mm / 3.09 L |
| Power rating | 1,700 W (AES) | 1,300 W (RMS) |
| **Reference efficiency η₀** | **1.87 % (94.8 dB at 1 W)** | **0.48 % (88.9 dB at 1 W)** |

Parameters are from B&C [10] and Dayton Audio [11]. B&C rates its power to the AES standard and Dayton as "RMS"; they aren't measured the same way, so treat the power figures as a guide.

Where the 5.9 dB comes from: the same η₀ can be written as (ρ / 2πc) × (Bl²/Re) × Sd² / Mms² [5][6]. The motors are within 0.4 dB of each other and the cones are the same size. **The difference is the moving mass**: the Dayton's cone and coil weigh 1.8 times as much, and that alone costs about 5 dB in the passband. The heavy cone is what gives it its 21 Hz resonance. Manufacturers' printed sensitivities are usually averaged over a band higher up, and some are at 2.83 V rather than 1 W, so they don't compare directly; η₀ does.

## The law, checked

Each driver in its own **QB3** box (the flattest ported alignment, as **Presets** gives it, sized the way WinISD sizes it), at 1 W:

| | B&C 18SW115 | Dayton SS18-22 |
|---|---|---|
| Box | 70.4 L, tuned to 41.1 Hz | 167.9 L, tuned to 22.1 Hz |
| F3 | 49.3 Hz | 22.9 Hz |
| Passband level, 1 W | 94.9 dB | 89.0 dB |
| kη = η₀ / (F3³ × Vb) | 2.22 × 10⁻⁶ | 2.38 × 10⁻⁶ |

The two kη values are within 0.3 dB: two very different drivers, one law. The PA driver is 5.9 dB more efficient, and pays for it with a cut-off more than an octave higher, in less than half the box. (The small difference comes from the alignment's shape at their different Qts.)

In their **Qtc 0.707 sealed** boxes (42 L and 87 L), kη is 0.91 and 0.76 × 10⁻⁶: the ported boxes come out 3.9–5.0 dB ahead of these sealed ones for their size and cut-off, 1–2 dB more than Small's 2.9 dB between the best of each type. (With the textbook lossless QB3 boxes, 63.3 L and 145.6 L, the gap is 3.3–4.4 dB: WinISD's QB3 trades a bigger box for a lower F3, which the law rewards.)

## Same box, same bass

Now swap boxes. Each driver goes into its maker's recommended ported box, and then into the other's: B&C's **150 L tuned to 35 Hz** [12], and Parts Express's **5 ft³ (141.6 L)** for the SS18-22, with an F3 of 26 Hz [13] (tuned here to 21 Hz; the listing doesn't give a tuning). Both boxes use a 20 cm port, behind an 18 Hz subsonic filter. At 21 Hz that port is 135 cm long, so a real build would use a folded slot or a passive radiator; it doesn't change the comparison. Both at 1 W:

![Both drivers at 1 W in the PA box (left) and the home box (right). Below about 40 Hz the curves sit on top of each other; the B&C (orange) is 4–6 dB louder from 60 Hz up.](img/iron-law.png)

| SPL at 1 W, 1 m | 25 Hz | 30 Hz | 40 Hz | 100 Hz | 150 Hz |
|---|---|---|---|---|---|
| PA box: B&C / Dayton | 81.3 / 80.2 | 87.9 / 86.7 | 93.1 / 93.8 | 94.5 / 90.4 | 95.4 / 89.8 |
| Home box: B&C / Dayton | 84.8 / 85.4 | 86.3 / 87.1 | 88.3 / 88.5 | 93.8 / 89.7 | 95.1 / 89.5 |
| Sealed 141.6 L: B&C / Dayton | 79.9 / 80.7 | 82.3 / 82.9 | 85.8 / 85.7 | 93.4 / 89.3 | 94.9 / 89.3 |

In every box, **the deep bass is the same per watt**, within about 1 dB. Below the system's resonance, a driver's output per watt is set by its motor (Bl²/Re), its cone area and the box, not by how heavy its cone is. These two have nearly the same motor and cone, so they make nearly the same deep bass. The heavy cone only lowers the output above resonance.

So the "home sub" isn't louder in the deep bass. It's **quieter in the upper bass**, which is what makes it flat down low. In the home box, the B&C rises 10 dB from 25 to 150 Hz; cut its upper bass with EQ (a shelf of about −5 to −6 dB) and it's flat at the Dayton's level, down to the same F3. Both then sit at the same efficiency, F3 and box: the Iron Law again. In the PA box it's the other way round: the Dayton has a 1 dB bump at 40 Hz and falls 4–6 dB behind from 100 Hz up, and the B&C is the flat one.

What each maker's box shows:
- **B&C's PA box** gives up the bottom octave to keep the B&C's efficiency over 35–150 Hz, where live music and PA need it, from a box that stacks in a truck.
- **The home box** gives up 6 dB of efficiency to stay flat to 26 Hz in the same volume, for film and music in a room, where amplifier power is cheap.

## Loudness is a different question

The Iron Law is about efficiency at small signals. How loud a sub can play is set by how much power it can take, how much air it can move (displacement, Sd × Xmax) and the port. At each driver's power rating:

![Maximum SPL at each driver's power rating. Left: the 141.6 L ported box, where the two are within 0.6 dB from 18 to 40 Hz and the B&C is ahead above. Right: 141.6 L sealed, where the Dayton's longer throw puts it ahead below about 40 Hz.](img/iron-law-maxspl.png)

- **In the ported home box**, from 18 to 40 Hz both are within 0.6 dB: the port does most of the work near its tuning, and at 20 Hz its air speed is the limit for both (112.3 dB). From 50 Hz up the B&C pulls ahead, by 2.8 dB at 60 Hz and 5.3 dB at 100 Hz. That's its 5.9 dB of efficiency and its higher power rating.
- **Sealed, the cone moves all the air**, and the Dayton's 26 mm of travel counts: **+4.7 dB at 15 Hz, +3.9 dB at 20 Hz** and +2.0 dB at 30 Hz. The B&C hits its Xmax first; the Dayton reaches its power rating first. From about 40 Hz up the B&C is ahead again.

So a PA driver isn't "unable to do deep bass": it does the same deep bass per watt, and with EQ and a big amplifier it can play deep. A long-throw home driver earns its place where the cone has to move a lot of air, in sealed and small boxes deep down. See [one 15″ or two 10″](/guides/one-15-vs-two-10s/) for displacement against power handling in more detail.

## Bending the law

Every trick moves you along the law; none breaks it:

- **EQ (a [Linkwitz Transform](/guides/linkwitz-transform/) or a bass boost).** Deep bass from a small box at the cost of efficiency: every octave of extension costs about 9 dB of amplifier power, and the cone must be able to move that far. KEF's KC62 white paper puts it as iron laws that can't be broken, but can be bent [14].
- **A ported box or passive radiator** raises kη by about 3 dB over sealed, at the cost of a steeper roll-off and port noise or a radiator to fit (see [sealed, ported or passive radiator](/guides/sealed-ported-pr/)).
- **Horns** buy efficiency with a lot of volume [9].
- **More drivers.** Two drivers in two boxes are twice the volume; the law applies to the total.
- **Room and cabin gain.** A small room or a car boosts the deep bass for free, but it's the room, not the box (see [car subwoofers](/guides/car-subwoofer/)).
- **Isobaric pairs** halve the box at the same F3, with two drivers and 3 dB less efficiency, as the law says (see [isobaric](/guides/isobaric/)).

## Doing it in the app

1. **Pick the driver.** The **Driver** tab shows its parameters; η₀ follows from Fs, Vas and Qes.
2. **Compare with another driver**, and both appear in every box on the same charts. The example links put the B&C as the main driver (solid lines) and the Dayton as the comparison (dashed).
3. **Presets** size each box for the driver: QB3, SC4 and others for ported, Qtc 0.707 for sealed.
4. **1 W in W mode**, with the response chart switched from **Relative** to **dB SPL**, shows efficiency, as here (**Relative** lines each driver up on its own passband, which hides the same-box result); the **Max SPL** chart shows loudness at the power you set, and what stops it (cone travel, port speed, power rating, amplifier).
5. **EQ** (the **Signal** tab) lets you flatten a PA driver, or extend a home one, and see what it costs on the Max SPL chart. It applies to every box and to the comparison driver too, so try it with one driver at a time.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Efficiency, size, extension: pick two" | True. Here kη came out within 0.3 dB for two very different drivers. |
| "Deep bass takes a bigger box" | Or less efficiency: 9 dB per octave in the same box. |
| "PA drivers can't do deep bass" | They can, at the same output per watt in the same box, with EQ to flatten their upper bass. What they lack is long throw for sealed and small boxes. |
| "Home subs are inefficient, so they're worse" | They spend efficiency on flat extension, by design. |
| "The Iron Law limits how loud a sub can play" | No. That's power handling, displacement and the port. |
| "EQ cheats the Iron Law" | No: it moves along it, paying in amplifier power and cone travel. |
| "It's Hoffman's Iron Law" | Hofmann's: Josef Anton Hofmann of KLH [1][2]. |

## Sources

1. Wikipedia, [Josef Anton Hofmann](https://en.wikipedia.org/wiki/J._Anton_Hofmann): audio engineer, co-founder of KLH, known for Hofmann's Iron Law.
2. D. Lander, [Henry Kloss, Dead at 72](https://www.stereophile.com/news/11260/index.html), *Stereophile*, 2002: Kloss, Low and Hofmann backed Acoustic Research and founded KLH in 1957.
3. H. Kloss, ["Loudspeaker Design: Hofmann's Iron Law"](https://gammaelectronics.xyz/audio_03-1971_iron.html), *Audio*, March 1971: efficiency in proportion to volume, resonance squared and damping frequency; the same response in half the volume at 3 dB less efficiency.
4. P. W. Mitchell, [Loudspeaker efficiency](https://enjoythemusic.com/magazine/bas/0808/), *BAS Speaker*, August 1973: the Iron Law as a working formula for closed boxes; the KLH Seventeen and the Smaller Advent.
5. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 1972: reference efficiency and the efficiency–bandwidth–volume limit. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=2022).
6. diyAudio, [Equation relating T/S parameters to sensitivity vs frequency](https://www.diyaudio.com/community/threads/equation-relating-t-s-parameters-to-sensitivity-vs-frequency.133285/): η₀ = 4π²/c³ × Fs³Vas/Qes and SPL = 112 + 10 log η₀; efficiency = k × Vb × Fc³.
7. R. H. Small, "Vented-Box Loudspeaker Systems, Parts I and II", *J. Audio Eng. Soc.* 21 (5–6), 1973: the same limit for vented boxes, and the comparison with closed boxes.
8. Wikipedia, [Acoustic suspension](https://en.wikipedia.org/wiki/Acoustic_suspension): summary of Small's comparison, closed box up to 2.9 dB less efficient than vented for the same volume and cut-off.
9. D. B. Keele Jr., [An Efficiency Constant Comparison Between Low-Frequency Horns and Direct-Radiators](https://aes2.org/publications/elibrary-page/?id=2287), AES Convention 54, paper 1127, 1976.
10. B&C Speakers, [18SW115](https://www.bcspeakers.com/en/products/lf-driver/18/8/18SW115): parameters supplied by B&C and published with their permission.
11. Dayton Audio, [SS18-22 18″ Signature Series DVC Subwoofer](https://www.daytonaudio.com/product/2130/ss18-22-18-signature-series-dvc-subwoofer-2-ohms-per-coil) and its [specification sheet](https://www.daytonaudio.com/images/resources/295-736--dayton-audio-ss18-22-specification-sheet.pdf).
12. B&C 18SW115 specifications, [Blue Aran](https://bluearan.co.uk/index.php?id=GRD2107) and [Sonovente](https://www.sonovente.com/en-gb/b-and-c-18sw115-4-ohm-p103328.html): recommended enclosure 150 dm³ tuned to 35 Hz.
13. Parts Express, [Dayton Audio SS18-22](https://www.parts-express.com/Dayton-Audio-SS18-22-18-Signature-Series-DVC-Subwoofer-2-Ohm-per-Coil-295-736): recommended vented volume 5 ft³, F3 26 Hz.
14. *Australian Hi-Fi*, [KEF & Hofmann's Iron Law](https://www.pressreader.com/australia/australian-hifi/20211206/282033330472069), December 2021: KEF's KC62 and the three linked attributes of bass, size and sensitivity.
