---
title: "Speaker break-in: what really changes, and what it does in a box"
description: What break-in does to a woofer's suspension and T/S parameters, how much of it lasts, why a box hides most of it, how long it takes, the measuring mistake it causes, and a run-in routine before you measure your own drivers.
path: guides/driver-break-in
image: figure:break-in-difference
art: A driver in cutaway with its surround and spider picked out, and a clock beside it.
order: 29
group: measuring
---

# Speaker break-in: what really changes, and what it does in a box

Break-in is real: a new woofer's suspension softens with use, and you can measure it. What it isn't is a 300-hour transformation of the bass. For a box builder the real risk is measuring a stiff new driver, trusting the numbers, and sizing the cabinet for a suspension that's gone after an evening of use.

This guide runs the numbers through the simulator: a 10″ subwoofer, fresh and run in, in a sealed box, a ported box and with no box at all.

[[Open the example: run-in driver vs the same driver with Fs +15 %|break-in-15]] [[A 5 % stiffer driver|break-in-5]] [[Boxes sized from fresh numbers|break-in-trap]]

## The short answer

- **The suspension really does soften.** The spider and surround lose some stiffness the first time they're flexed hard. Fs and Qts fall and Vas rises: by a few percent on many drivers, {{fig:break-in-hours/drop:0}} % on one small woofer run for 40 hours, and up to 20 % on stiff drivers after long runs [4][5].
- **A box hides most of it.** The air in a sealed box is a second spring, often stiffer than the suspension. Make the example's suspension stiff enough to raise Fs by 15 % and its 30 L sealed box's Fc moves only {{fig:break-in-dilution/sealed15:1}} %. The response changes by at most {{fig:break-in-difference/k15sealed:1}} dB, around 20 Hz. For a typical 5 % change it's {{fig:break-in-difference/k5sealed:2}} dB.
- **Part of it comes back.** A warm, just-exercised suspension reads softer than it will tomorrow. A cold room, or a driver fresh off a cold truck, reads stiffer than either [2][4][11].
- **How long it takes depends on the drive level, not the calendar.** At large excursion most of the change happens in the first minutes [6]; music at normal levels takes longer. Some drivers keep creeping slowly for tens of hours [4]. Nothing in the measurements supports hundreds of hours for a change you'd hear.
- **The mistake to avoid:** measuring T/S on a brand-new driver at a whisper-quiet test level, then sizing a box from it. Here that gives a {{num:break-in-trap/1/vb}} L sealed box instead of {{num:break-in-trap/2/vb}} L, for an F3 just {{diff:break-in-trap/2/break-in-trap/1/f3}} Hz lower.

## What actually softens

Picture the cone hanging on two springs. The **spider**, the corrugated cloth ring under the cone, is woven fabric soaked in resin and heat-pressed into shape. The **surround** at the cone's edge is rubber, foam or treated cloth. Between them they set the suspension's compliance, Cms: how far the cone moves per newton of push.

The first time a new driver swings through a big excursion, the spider's stiff resin coating and fibres give a little. KEF's Jack Oclee-Brown describes the textile fibres pulling apart slightly under stress, which softens it [3]. Some of that is permanent. Some of it is the material's viscoelastic "memory", which relaxes while it's worked and slowly recovers at rest [2][8][9].

Wolfgang Klippel measured this as a function of the **work** done on the suspension rather than time. Stiffness falls along two exponentials: a fast break-in, then a slow fatigue that can continue for the driver's life [1]. In his examples, one woofer lost about 30 % of its stiffness, 85 % of that in the break-in phase.

> **Rule of thumb:** break-in is measured in excursion, not hours. Ten minutes at large excursion does more than a week of quiet background music.

What doesn't change is just as useful. The moving mass (Mms), the cone area (Sd), the motor's force factor (Bl) and the coil's resistance (Re, at the same temperature) are all the same before and after. Only Cms moves.

## One spring changes, five numbers move

Because only Cms changes, every T/S value that moves, moves by a predictable amount [15]:

| The suspension gets s times as stiff (Cms ÷ s) | What follows | 5 % stiffer | Fs +15 % (s = 1.32) |
|---|---|---|---|
| Vas = ρc² · Sd² · Cms | Vas ÷ s | {{num:break-in-5/1/vas}} → {{num:break-in-5/4/vas}} L | {{num:break-in-15/1/vas}} → {{num:break-in-15/4/vas}} L |
| Fs = 1 / (2π √(Mms · Cms)) | Fs × √s | {{num:break-in-5/1/fs}} → {{num:break-in-5/4/fs}} Hz | {{num:break-in-15/1/fs}} → {{num:break-in-15/4/fs}} Hz |
| Qes = 2π · Fs · Mms · Re / Bl² (Qms = 2π · Fs · Mms / Rms the same) | Qes and Qms × √s | {{num:break-in-5/1/qes}} → {{num:break-in-5/4/qes}} | {{num:break-in-15/1/qes}} → {{num:break-in-15/4/qes}} |
| Qts | Qts × √s | {{num:break-in-5/1/qts}} → {{num:break-in-5/4/qts}} | {{num:break-in-15/1/qts}} → {{num:break-in-15/4/qts}} |

The driver is a **Dayton Audio RSS265HF-4**: its datasheet values are the run-in driver, and the "fresh" one is the same driver with a stiffer Cms. (Careful makers measure run-in drivers: Scan-Speak, for one, drives each one near Fs to almost full excursion before measuring [6].)

So a stiff new driver doesn't just have a higher Fs. It has a higher Fs, a smaller Vas and a higher Qts, all together. Change only one of them in a simulator and you model a driver that doesn't exist.

> **Common trap:** "My new sub measures Fs 15 % high, so it'll have weak deep bass." The smaller Vas and higher Qts that come with it pull the other way. Whether the box notices is the next question.

## In a box, the air spring takes over

A sealed box adds the trapped air as a second spring on the cone. The two stiffnesses add, so the system's resonance depends on both [15]:

```
Fc = Fs × √(1 + Vas / Vb)
```

When the box is small next to Vas, the air spring does most of the work, and a change in the suspension is diluted. The example's 30 L box against a 54 L Vas has Vas ÷ Vb = {{fig:break-in-dilution/alpha:1}}: the air is almost twice as stiff as the suspension.

![How far the resonance moves when the suspension gets stiff enough for Fs +15 % (solid) or 5 % stiffer (dashed), against how big the box is next to Vas. With no box (left edge) the driver's whole +15 % shows; in the example's 30 L box it's +{{fig:break-in-dilution/sealed15:1}} %.](figure:break-in-dilution)

Read the chart from left to right. At the left edge there's no box: the driver sits in an infinite baffle with nothing behind it, and the full {{fig:break-in-dilution/ib15:0}} % shift in Fs shows up as the system resonance. By Vas ÷ Vb = 2, two-thirds of it has gone. Small boxes for big-Vas drivers, the usual sealed subwoofer, are the least sensitive of all.

Now the whole response. Here are the run-in driver (solid) and the same driver with Fs 15 % higher (dashed), in the 30 L sealed box, a 50 L ported box tuned to 26 Hz, and an open-rear infinite baffle, at 120 W (every cone inside its Xmax) behind a 22 Hz high-pass:

![The run-in RSS265HF-4 (solid) and the same driver with Fs 15 % higher (dashed): sealed 30 L ({{color:break-in-15/1}}), ported 50 L ({{color:break-in-15/2}}) and infinite baffle ({{color:break-in-15/3}}). The dashed curves sit almost on the solid ones.](chart:break-in-15/spl)

You have to look closely to see two curves at all. To make the difference visible, here it is on its own: the fresh driver's response minus the run-in one's.

![The fresh driver's response minus the run-in driver's, in each box. With a typical 5 % stiffer suspension the gap stays under {{fig:break-in-difference/k5sealed:2}} dB from 20 to 200 Hz. With a stiff sample (Fs +15 %) it reaches {{fig:break-in-difference/k15sealed:1}} dB at 20 Hz and a few tenths of a dB above it.](figure:break-in-difference)

What to look at:

- **The 5 % case is flat.** The biggest gap is {{fig:break-in-difference/k5sealed:2}} dB in the sealed box and {{fig:break-in-difference/k5ported:2}} dB in the ported one. Audioholics' sealed-box model of the same 5 % change found 0.02–0.09 dB [7]. Four midrange drivers from one production run varied by about 1 dB in the same article, ten times more.
- **The Fs +15 % case matters only at the bottom.** The sealed box loses {{diff:break-in-15/1/break-in-15/4/spl@20}} dB at 20 Hz and {{diff:break-in-15/1/break-in-15/4/spl@25}} dB at 25 Hz. By 60 Hz the stiff one is just {{diff:break-in-15/4/break-in-15/1/spl@60}} dB louder.
- **The ported box goes the other way.** With the stiffer driver it plays {{diff:break-in-15/5/break-in-15/2/spl@20}} dB *more* at 20 Hz. Its tuning is set by the box and the port, not the driver, and the higher Qts props up the response around it.

![Cone excursion at 120 W: run-in (solid) and Fs +15 % (dashed). The stiffer cone moves slightly less in the sealed box ({{color:break-in-15/1}}), and slightly more below the ported box's tuning ({{color:break-in-15/2}}).](chart:break-in-15/excursion)

The excursion chart tells the same story. In the sealed box the stiffer cone peaks at {{num:break-in-15/4/x}} mm instead of {{num:break-in-15/1/x}} mm, and it takes {{num:break-in-15/4/xmaxW}} W to reach Xmax instead of {{num:break-in-15/1/xmaxW}} W. But the **maximum SPL** where Xmax limits is the same: {{num:break-in-15/4/max@25}} dB at 25 Hz against {{num:break-in-15/1/max@25}} dB. How loud a cone can play at Xmax depends on Sd × Xmax, not on how stiff its suspension is.

Where break-in does show is the driver on its own. On the infinite baffle the impedance peak, which sits at Fs, moves from {{num:break-in-15/3/fs}} to {{num:break-in-15/6/fs}} Hz:

![Impedance of the driver on an open-rear infinite baffle, run-in (solid) and Fs +15 % (dashed): the peak sits at each one's Fs, {{num:break-in-15/3/fs}} and {{num:break-in-15/6/fs}} Hz.](chart:break-in-15:3,6/impedance)

That's exactly what you see on a DATS or REW impedance sweep of a new driver, and why a measurement of a raw driver exaggerates what you'll hear from a finished speaker.

## The real trap: sizing a box from fresh numbers

Suppose you measure the stiff new driver, believe it, and let **Boxes → Size all** pick a Qtc 0.707 sealed box and a flat (QB3) ported box for those values. Then the driver runs in. Here are those boxes with the run-in driver, next to the boxes sized from its run-in values (both ported boxes with the same 4″ flared port, cut for each tuning):

| | Sealed, sized fresh | Sealed, sized run-in | Ported, sized fresh | Ported, sized run-in |
|---|---|---|---|---|
| Net volume | {{num:break-in-trap/1/vb}} L | {{num:break-in-trap/2/vb}} L | {{num:break-in-trap/3/vb}} L | {{num:break-in-trap/4/vb}} L |
| Tuning | | | {{num:break-in-trap/3/fb}} Hz | {{num:break-in-trap/4/fb}} Hz |
| Fc / Qtc with the run-in driver | {{num:break-in-trap/1/fc}} Hz / {{num:break-in-trap/1/qtc}} | {{num:break-in-trap/2/fc}} Hz / {{num:break-in-trap/2/qtc}} | | |
| F3 | {{num:break-in-trap/1/f3}} Hz | {{num:break-in-trap/2/f3}} Hz | {{num:break-in-trap/3/f3}} Hz | {{num:break-in-trap/4/f3}} Hz |

![The run-in driver in the boxes sized from its fresh values ({{color:break-in-trap/1}}, {{color:break-in-trap/3}}) and from its run-in values ({{color:break-in-trap/2}}, {{color:break-in-trap/4}}): sealed {{num:break-in-trap/1/vb}} L and {{num:break-in-trap/2/vb}} L, ported {{num:break-in-trap/3/vb}} L and {{num:break-in-trap/4/vb}} L.](chart:break-in-trap/response)

The sound barely suffers: the oversized sealed box ends up a little overdamped (Qtc {{num:break-in-trap/1/qtc}}), the oversized ported box a little deeper. What you lose is space. The sealed cabinet is {{diff:break-in-trap/1/break-in-trap/2/vb:0}} L bigger than it needed to be, the ported one {{diff:break-in-trap/3/break-in-trap/4/vb:0}} L, for the trade the [Hofmann iron law](/guides/hofmann-iron-law/) always offers: a bigger box, a bit more bass.

That's a quiet failure, and it's the reason to run a driver in before measuring it (below).

## How long does it take?

The honest answer: it depends how hard you push it, and on the driver.

GR Research measured a 5¼″ woofer (their M-130) fresh, after 10 seconds, 20 hours and 40 hours of a 50 Hz tone, each time warm straight after the run and again after cooling for hours [4]:

![GR Research's M-130 woofer: Fs measured warm right after each run (dashed) and after cooling for hours (solid). The cooled Fs fell from {{fig:break-in-hours/fresh:1}} to {{fig:break-in-hours/cooled40:1}} Hz over 40 hours, {{fig:break-in-hours/drop:0}} %. Data: GR Research.](figure:break-in-hours)

Three things show up:

- **Some of it is instant.** Just flexing the cone in and out by hand dropped Fs from 56.9 to 54.2 Hz, the same as 10 seconds of tone.
- **Some of it is temporary.** Straight after each run Fs read 1–3 Hz lower than after cooling. That's the warm, just-worked suspension, and it's why a measurement taken right after a break-in session flatters the driver [2][4].
- **Some drivers keep going.** This one was still softening between 20 and 40 hours. GR's larger test of seven woofers, at half Xmax and 40 Hz, found the same trend [5]. Even so, the {{fig:break-in-hours/drop:0}} % change in this small woofer's Fs becomes a much smaller one in its box, by the dilution above.

Other measurements point the same way. A 2026 study cycled a midrange driver through loading and rest. In the gentle case its stiffness came all the way back over a day or two of rest; at the highest drive, about 5 % stayed lost [2]. Scan-Speak sees the compliance change most in the first few minutes of large excursion [6], and Klippel's model has the same shape: a fast break-in, then slow fatigue [1].

> **Rule of thumb:** if a driver's measured Fs is still falling, it's either still warm or still breaking in. Let it cool and measure again; the number that holds after a rest is the one to design with.

## Temperature moves it too

Rubber and foam stiffen when cold, so Cms drops with temperature: Fs rises, Vas falls and Qts rises, exactly like a fresh driver. Zaph Audio cooled a 6.5″ woofer to −18 °C and could barely find its impedance peak at all [10]. GR noted that the one driver measured straight from a cold storeroom showed the largest early shift of the seven [5].

That's the boring explanation for "new speakers sound tight for the first day". B&W's manuals say the same: a speaker stored somewhere cold needs time to recover, and its suspensions loosen over the first hours of use [11]. Rousseau (of B&W) and Vanderkooy measured the suspension's stiffness falling with temperature, and found that exercising the driver softens it partly through heat [8].

The voice coil heats too, which raises Re and Qes: about 0.39 % per °C. A sweep taken with a warm coil reads a higher Qes than the cold datasheet (see [power compression](/guides/power-compression/)).

## Tweeters, crossovers and guitar speakers

- **Dome tweeters** move a fraction of a millimetre, with tiny suspensions working far inside their range. There's little to break in.
- **Crossover parts** aren't mechanical: film capacitors, air-core inductors and resistors don't have a run-in mechanism a simulator would know about.
- **Guitar speakers** are the exception. Their stiff paper cones and treated edges are meant to break up in the midrange, so softening changes the tone itself. Celestion recommends at least an hour of loud, chunky playing [14].

## Why it still sounds different a week later

If the box hides almost all of it, why do so many people hear a change? Floyd Toole's answer, from decades of controlled listening tests, is blunt: apart from tiny changes in woofer resonance, loudspeakers don't break in, but listeners do [12]. Your ears adapt to a new speaker's balance within days. Without an instant, level-matched comparison, there's no reference left to compare against.

A controlled test points the same way. In it, a designer ran one of a pair of Cambridge Audio Aero 2 speakers for over 50 hours while its twin stayed sealed in its carton. Three listeners couldn't tell them apart blind, and both were measured afterwards [13]. That's three people, so it proves little on its own, but it's more than the "300 hours" claims are built on.

There's one argument for listeners that deserves a fair hearing. Forum sceptics point out that break-in is always reported as an improvement, never as worse. But designers measure and voice their speakers with run-in drivers. If break-in moves a driver at all, it moves it toward the speaker they designed. "It got better" is the direction physics predicts, even if the amount is usually too small to hear.

## A run-in routine before you measure

This is where break-in matters to a builder: before measuring a driver's T/S parameters.

1. **Let it reach room temperature.** A driver that came off a cold delivery van wants a day indoors.
2. **Exercise it in free air.** Hold it firmly, magnet down and vent clear, and play a sine wave at or just below its Fs, as Scan-Speak does [6]. Turn it up until the cone swings through most of its Xmax without slapping. Ten to thirty minutes for a hi-fi woofer; an hour or more for a stiff subwoofer or a cloth-edge pro driver. More drive does more work [1].
3. **Let it rest and cool.** An hour or two, so the coil and the suspension's temporary softening settle [2][4].
4. **Measure at a low level**, with the driver held firmly and away from walls, as small-signal T/S values assume [6].
5. **Load the sweep into the app**: **Driver → Edit T/S → ⋯ → Measure from an impedance sweep…**. A second sweep with a known added mass gives Mms and Vas directly. Without one, the app keeps the driver's Mms and works Vas out from it: moving mass doesn't change with break-in, Vas does.
6. **If it's still drifting**, measure again the next day and design with the value that holds.

> **Common trap:** keeping the datasheet's Vas with your measured Fs. If your driver's Fs is 15 % above the datasheet, its Vas is about 24 % below it. Mixing the two describes a driver with a quarter less moving mass than the real one.

## Seeing it in the app

To see what break-in (or a stiff sample) would do to your own design:

1. Pick your driver, then in **Driver → Compare** pick the same driver again.
2. Press **Swap**, and in **Edit T/S** change the main driver's suspension: for one s times as stiff, divide Vas by s and multiply Fs, Qes, Qms and Qts by √s. (For Fs +15 %: Vas × 0.756; Fs, Qes, Qms and Qts × 1.15.)
3. The dashed curves are the datasheet driver; the solid ones the stiff one. Look at the **Response** chart, then **Cone excursion** and **Impedance**.

The [simulation vs measurement](/guides/simulation-vs-measurement/) guide covers the other reasons a built box can measure differently, and the [Thiele/Small guide](/guides/thiele-small-parameters/) what each parameter means.

## The claims, checked

| Claim | Verdict |
|---|---|
| "Break-in is a myth; nothing physical changes." | No: the suspension softens, measurably. Fs falls and Vas rises [1][3][4]. *Proof: the Impedance chart's peak.* |
| "Speakers need 100–500 hours to open up." | Not supported. At large excursion most of the change happens in minutes [6]; some drivers creep on for tens of hours [4], and a box dilutes what's left. |
| "Bass gets dramatically deeper after break-in." | In a box, no: under {{fig:break-in-difference/k5sealed:2}} dB for a typical 5 % change, up to {{fig:break-in-difference/k15sealed:1}} dB around 20 Hz for a stiff sub. *Proof: the difference figure.* |
| "A stiff new driver can't play as loud in the deep bass." | Where Xmax limits, no: {{num:break-in-15/4/max@25}} vs {{num:break-in-15/1/max@25}} dB at 25 Hz. It takes more power to get there. *Proof: Max SPL.* |
| "Once broken in, the T/S values are fixed." | No: they move with temperature [8][10], and partly recover at rest [2][4]. |
| "Tweeters and crossovers need burn-in." | No mechanism a measurement has shown in a dome tweeter or a passive crossover. |
| "Measure new drivers straight from the box." | That's the trap: stiff values size a box {{diff:break-in-trap/1/break-in-trap/2/vb:0}} L too big here. Run them in first. |

## Sources

1. W. Klippel, "Mechanical Fatigue and Load-Induced Aging of Loudspeaker Suspension", AES 131st Convention, New York, 2011 ([AES E-Library](https://secure.aes.org/forum/pubs/conventions/?elib=16000), [slides](https://www.klippel.de/fileadmin/klippel/Files/News/KLPPEL_Fatigue_and_Aging_of_suspension_AES_NY_2011.pdf)): stiffness as a function of accumulated work, a break-in exponential plus slow fatigue; a woofer losing about 30 % of its stiffness, 85 % of it in break-in.
2. L. Duparc and P. Lotton, ["Characterizing Reversible and Irreversible Stiffness Degradation in Loudspeaker Suspensions"](https://dael.euracoustics.org/confs/fa2026/data/articles/000199.pdf), Forum Acusticum 2026: stiffness recovering at rest after loading; about 5 % permanently lost in the high-drive case.
3. KEF, [Some facts about speaker break-in](https://us.kef.com/blogs/news/some-facts-about-speaker-break-in): Jack Oclee-Brown on impregnated textile suspensions softening as the fibres pull apart under stress.
4. GR Research, [Driver burn-in facts](https://gr-research.com/?p=228440): M-130 woofer Fs, Vas and Qts fresh, after 10 s, 20 h and 40 h at 50 Hz, warm and cooled.
5. GR Research, [Burn-in myth](https://gr-research.com/?p=228899): seven woofers run at half Xmax with a 40 Hz tone, measured after cooling; cold storage giving the largest early shift.
6. Scan-Speak, [Technical Note 01: Measurement of Thiele Small parameters](https://www.scan-speak.dk/datasheet/tech/Scan-Speak_Technote01_TS-measurement.pdf): each driver run in near its resonance at almost full excursion before measuring at a very low level; compliance changing most in the first minutes.
7. Audioholics, [Loudspeaker break in: fact or fiction?](https://www.audioholics.com/loudspeaker-design/speaker-break-in-fact-or-fiction) (2005): a 5 % compliance increase modelled in sealed boxes (0.02 and 0.09 dB), against about 1 dB between four production samples.
8. M. Rousseau and J. Vanderkooy, ["Visco-elastic Aspects of Loudspeaker Drivers"](https://www.aes.org/e-lib/browse.cfm?elib=13240), AES 118th Convention, paper 6524, 2005: suspension stiffness falling with temperature, and exercise softening it through both mechanical and thermal effects.
9. M. H. Knudsen and J. G. Jensen, ["Low-Frequency Loudspeaker Models That Include Suspension Creep"](https://www.aes.org/e-lib/browse.cfm?elib=7015), *J. Audio Eng. Soc.* 41 (1/2), 3–18, 1993: compliance that depends on frequency and time (creep).
10. Zaph Audio, [Effect of temperature on a woofer](https://www.zaphaudio.com/temp.html) (2005): a Vifa P17WG-19 measured at 43, 21, 4 and −18 °C.
11. Bowers & Wilkins, [CMC owner's manual](https://manualmachine.com/bowerswilkins/cmc/986138-user-manual), "Running-in period": cold storage and the suspensions loosening over the first hours of use.
12. F. E. Toole, *Sound Reproduction: The Acoustics and Psychoacoustics of Loudspeakers and Rooms*, 3rd ed., Routledge, 2018: loudspeakers don't break in, apart from tiny changes in woofer resonance; listeners adapt.
13. Audioholics forum, [Breaking in a speaker is no joke](https://forums.audioholics.com/forums/goto/post?id=1581090): a Cambridge Audio Aero 2 run 50 hours against its twin from the carton, compared blind and measured.
14. Celestion, [How to break in a guitar speaker](https://celestion.com/blog/how-to-break-in-a-guitar-speaker/).
15. R. H. Small, "Closed-Box Loudspeaker Systems, Part I: Analysis", *J. Audio Eng. Soc.* 20 (10), 798–808, 1972: Fc = Fs √(1 + α) with α = Vas/Vb, and the T/S relations.
