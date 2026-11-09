---
title: "1 Ω vs 2 Ω vs 4 Ω: does DVC wiring change how a subwoofer sounds?"
description: The same dual voice coil subwoofer wired in series (4 Ω) and in parallel (1 Ω), with 0.15 Ω of amplifier and cable resistance, on a real 1 Ω amplifier. SPL, impedance, Q and maximum output worked out, with charts you can open and change.
path: guides/dvc-wiring
image: dvc-wiring.png
order: 22
group: start
---

# 1 Ω vs 2 Ω vs 4 Ω: does DVC wiring change how a subwoofer sounds?

Ask r/CarAV how to wire a dual voice coil (DVC) sub and you'll get two camps. One says wire it in series, at 4 Ω or 8 Ω: it "sounds tighter" because the amplifier's damping factor is higher. The other says wire it as low as the amplifier allows, 1 Ω if it can, for the most watts. Here is one DVC subwoofer wired both ways, in the same boxes, on the same amplifier, with the amplifier and cable resistance included, so you can see what changes and by how much.

[[Open the same-power comparison|dvc-watts]] [[Open the same-gain comparison|dvc-volts]]

## The short answer

- **The wiring doesn't change the driver.** Wired in series or in parallel, the sub has the same motor strength per watt (Bl²/Re), the same Qes and Qts, the same Fs, the same bass shape and the same power handling. Only the impedance changes, by four times.
- **What does change is the share the amplifier and cable take.** A 0.15 Ω amplifier-and-cable resistance is 12.5 % of the circuit at 1 Ω and 3.4 % at 4 Ω. At 1 Ω it raises Qes by 14 % instead of 4 %, and it costs about 1 dB of output instead of 0.3 dB.
- **So series is a little "tighter", for a reason the forums rarely give.** It isn't the amplifier's damping-factor rating. It's the cable and connections, which matter four times more at 1 Ω. With 0.15 Ω, the sealed box's Qtc goes from 0.96 to 0.99 in series and to 1.07 in parallel: a bump of about half a dB near 50 Hz. With short, thick wire, the difference shrinks to about a fifth of that.
- **Parallel plays louder only if the amplifier makes more power into 1 Ω.** On the same gain setting it's about 6 dB louder, which is all level: turn the series one up by 6 dB and they match. At full power, a Kicker CXA1200.1 makes 600 W into 4 Ω and 1200 W into 1 Ω, but this sub is rated for 800 W, so 1 Ω gains 1.5 dB at most (0.6–1.2 dB with the 0.15 Ω), and nothing where the port or the cone's travel is the limit.
- **The 1 Ω load has costs elsewhere:** more current, more heat in the amplifier and its wiring, and usually more distortion from the amplifier.

## The sub: one driver, two wirings

The example is a Dayton Audio UMII12-22, a 12-inch subwoofer with two 2 Ω voice coils, rated for 800 W. Dayton measures its Thiele/Small parameters with the coils in series, as one 4 Ω load [1]. The boxes are Dayton's: 28.3 L (1 ft³) sealed, and 70.8 L (2.5 ft³) ported at 25 Hz for car audio [1][11], here with a 5 × 30 cm slot port (91 cm long, so it would be folded into an L, as car boxes usually are) and a 20 Hz subsonic filter. Here is what each wiring gives, worked out from Dayton's values:

| | Coils in series (4 Ω) | Coils in parallel (1 Ω) |
|---|---|---|
| Re (DC resistance) | 4.2 Ω | 1.05 Ω |
| Bl (motor force factor) | 14.8 T·m | 7.4 T·m |
| **Bl²/Re (motor strength per watt)** | **52.2** | **52.2** |
| Le (inductance) | 0.66 mH | 0.165 mH |
| Le/Re | 0.157 ms | 0.157 ms |
| Qes / Qts | 0.71 / 0.56 | 0.71 / 0.56 |
| Fs, Vas, Qms, Mms, Xmax | same | same |
| Power handling | 800 W | 800 W |

Why it works out this way:

- **In series**, the same current flows through both coils. Both push the cone, so the force factor doubles (2 × 7.4 = 14.8 T·m), and so does the resistance (2 × 2.1 = 4.2 Ω).
- **In parallel**, each coil takes half the current. The force per amp is that of one coil (7.4 T·m), and the resistance halves (2.1 / 2 = 1.05 Ω).
- **Per watt, it's the same.** Bl² rises four times from parallel to series, and so does Re, so Bl²/Re doesn't move: 14.8² / 4.2 = 7.4² / 1.05 = 52.2. Qes depends on Re/Bl², so it doesn't move either. The inductance scales with the resistance, so the top end rolls off the same way too.
- **The heat is the same.** It's the same copper in the same gap. 800 W in series and 800 W in parallel heat the coils equally.

"Bl doubles in series" is true, and it's the root of a lot of forum confusion. On its own it means nothing: the resistance quadruples at the same time. Bl²/Re is the figure that counts, the same one the [one 15″ or two 10″ guide](/guides/one-15-vs-two-10s/) uses to compare motors.

> Use both coils. One coil on its own has half the motor strength per watt (7.4² / 2.1 = 26.1) and half the copper to take the heat.

## What the 0.15 Ω does

The amplifier's output resistance, the speaker wire and every terminal and crimp sit in series with the voice coil. Simulators call this Rg. It's in this app's Settings as **Amp + cable**. It adds to Re in the coil's electrical damping, so it raises Qes [2][3][4]:

**Qes′ = Qes × (Re + Rg) / Re**

and part of the amplifier's output warms the wire instead of the coil [3]. With the 0.15 Ω the brief asked for:

| With 0.15 Ω amp + cable | Series (4 Ω) | Parallel (1 Ω) |
|---|---|---|
| Rg's share of the circuit | 0.15 / 4.35 = 3.4 % | 0.15 / 1.20 = 12.5 % |
| Qes′ (from 0.71) | 0.735 (+3.6 %) | 0.811 (+14 %) |
| Qts′ (from 0.56) | 0.580 | 0.627 |
| Qtc in 28.3 L sealed (0.96 without Rg) | 0.99 | 1.07 |
| Damping factor at the coil (Re / Rg) | 28 | 7 |
| Output lost, at the same rated watts | 0.1–0.3 dB | 0.3–1.1 dB |

A small correction to the forum version of this: 0.15 Ω takes 12.5 % of the power at 1 Ω and raises Qes by 14 %, not 13 % of both. The share is 0.15 / (1.05 + 0.15); the rise is 0.15 / 1.05.

![The UMII12-22 in a 28.3 L sealed box at 300 W either way: SPL (the series and no-resistance curves overlap), the impedance the amplifier sees (4.2–16.4 Ω in series, 1.06–4.1 Ω in parallel), and what the 0.15 Ω costs each wiring in the sealed box and the 70.8 L ported box.](img/dvc-wiring.png)

What the chart shows:

- **Grey, no resistance:** series and parallel give exactly the same curve at the same power. It's hidden under the blue one.
- **Blue, series with 0.15 Ω:** 0.1–0.3 dB less, almost the same shape.
- **Orange, parallel with 0.15 Ω:** about 1 dB less where the impedance is near Re (up top, and at the port tuning in the ported box), but only 0.3 dB less at the impedance peak. A loss that is smaller at resonance is a small bass bump: the rise in Q.
- **The impedance** has the same shape both ways, a quarter of the size in parallel. Note that a "1 Ω" load is only 1 Ω near Re: 4.1 Ω at the sealed box's resonance (52.7 Hz).

How much does a Qtc of 1.07 instead of 0.99 matter? Dick Pierce worked through it for a 0.707 sealed box. A damping factor of 10 at the coil raises its Qtc to 0.77 and adds about a tenth of a dB of peak. The decay after a note stops lengthens by a few milliseconds, nothing like the "overhang" forums describe [5]. Here the half-dB bump is measurable and in the bass. A [DSP](/guides/linkwitz-transform/) or a slightly bigger box takes it out. It isn't the difference between "tight" and "boomy".

## Is 0.15 Ω realistic?

It's a pessimistic figure for a car:

- **The amplifier's own output resistance** is tiny. JL Audio rates its 1000/1 at a damping factor above 500 into 4 Ω and above 250 into 2 Ω [6], which works out to under 0.01 Ω.
- **The speaker wire** is 5.21 Ω per km for 12 AWG and 13.2 Ω per km for 16 AWG, counting both conductors [7]. A sub in the trunk 1 m from the amplifier on 12 AWG adds 0.01 Ω. Getting to 0.15 Ω takes about 5 m of 16 AWG each way, or a poor crimp.
- **A realistic total** for a short trunk install is around 0.02–0.03 Ω with the terminals. At 0.03 Ω, parallel raises Qes by 2.9 % and costs 0.24 dB. The sealed Qtc is 0.98 instead of 0.96.

The amplifier's damping-factor rating is measured at its own terminals into a nominal load, and the voice coil's own resistance dwarfs it. That's why manufacturers can print "500" or "1000" and it makes no audible difference: what the cone sees is set by Re, the wire and the connections [4][5]. The one useful thing the series camp gets right is that **at 1 Ω every 0.01 Ω counts four times as much as at 4 Ω**. If you run a 1 Ω load, use short, heavy wire and good terminals.

## Same gain knob, or same power?

Most forum A/B tests swap the wiring and leave the gain alone. Then the comparison isn't fair:

![Left: the same 20 V from the amplifier into the ported box: parallel is about 5.5 dB louder (6 dB without the 0.15 Ω). Right: maximum SPL on a Kicker CXA1200.1: parallel is up to 1.2 dB louder above 30 Hz, and the same at 20–25 Hz, where the port is the limit.](img/dvc-wiring-maxspl.png)

- **At the same voltage**, the parallel sub takes four times the power and plays 6 dB louder (5.2–5.8 dB with the 0.15 Ω). BestCarAudio measured a 10-inch DVC sub both ways on the same amplifier settings and found just under 6 dB [8]. The louder one usually sounds punchier on a quick swap, so match the levels before you judge.
- **At the same power** (the first chart), the two wirings are identical with no resistance and within 1 dB with 0.15 Ω.

## What the amplifier gives you at 1 Ω

What decides between 1 Ω and 4 Ω is the amplifier, not the sub. The example uses a Kicker CXA1200.1, a 1 Ω-stable monoblock rated at 600 W into 4 Ω, 1200 W into 2 Ω and 1200 W into 1 Ω [9]. Those ratings fit an amplifier that tops out at 49 V and 34.6 A, which is how the example's **Amp max volts** and **Amp max current** are set ([matching an amplifier](/guides/amp-matching/) explains reading ratings this way, and what the sub's impedance dips do to it).

- **Wired in series (4.2 Ω),** the amplifier runs out of voltage first, at 49 V: about 570 W (49² / 4.2), below the sub's 800 W.
- **Wired in parallel (1.05 Ω),** the amplifier could deliver over 1000 W, so the sub's 800 W rating is the limit: 29 V at the amplifier (√(800 × 1.05)).
- **The difference is 800 W against 570 W: 1.5 dB at most.** With the 0.15 Ω, the app shows 0.6–1.2 dB. It holds the 800 W against the voltage at the amplifier's terminals (V²/Re, as WinISD does, and as you would set gain with a meter at the amplifier), so the wire's 12.5 % never reaches the coil.
- **In the ported box at 20–25 Hz there's no difference.** The port's air speed is the limit there, and it doesn't care how the coils are wired. The same goes wherever the cone's travel (Xmax) is the limit.

Other amplifiers change the picture:

- **A regulated amplifier makes the same power into any load it's rated for.** JL Audio's 1000/1 is rated at 1000 W from 1.5 Ω to 4 Ω [6]. Then going lower gains nothing.
- **Many amplifiers aren't 1 Ω-stable at all.** JL Audio's JD1000/1 is rated down to 2 Ω, with no 1.5 Ω rating [10]. A dual 2 Ω sub on it has to be wired in series.
- **The same watts at a lower impedance cost more current.** The Kicker's 1200 W at 1 Ω takes 34.6 A of output current against 24.5 A at 2 Ω, with more heat in the output stage, the power wire and the charging system. BestCarAudio found that the amplifiers it tests are generally less efficient and produce more distortion at lower loads [8].
- **Hot coils raise the load.** At full power the coil heats up and Re rises, so the amplifier sees more than 1 Ω, and the wire's share falls. See [power compression](/guides/power-compression/).

## Choosing

- **Wire for the load your amplifier is rated to make the most power into, up to the sub's rating.** With a dual 2 Ω sub that's 1 Ω (parallel) or 4 Ω (series). A dual 4 Ω sub gives 2 Ω or 8 Ω.
- **If the amplifier makes about the same power either way,** wire for the higher impedance: less current, less heat, less wire loss.
- **If you wire to 1 Ω,** keep the run short and the wire heavy, and set gain again. Every 0.01 Ω at 1 Ω costs what 0.04 Ω costs at 4 Ω.
- **If you want a tighter sealed box,** a little more volume or some EQ moves Qtc far more than the wiring does.

## Doing it in the app

1. **Driver tab:** pick the driver, then set **Voice coils** to **Dual (DVC)**. Library drivers set this for you.
2. **Values are for:** say how the datasheet measured the parameters. Dayton's are for **Both coils in series**. Getting this wrong scales Re and Bl by four.
3. **Coils wired:** choose **In series** or **In parallel**. The impedance chart shows what the amplifier will see.
4. **Settings → Amp + cable:** enter your amplifier and wire resistance. **Amp max volts** and **Amp max current** set the amplifier's limits on the Max SPL chart.
5. **Compare with another driver:** pick the same driver again and wire it the other way. The examples above do this: the solid curves are the main driver wired in series, and the dashed "(compare)" curves are parallel.
6. **W or V:** in **W** both wirings get the same rated power, which shows the driver is unchanged. In **V** both get the same voltage, as with an unchanged gain knob.

Set **Amp + cable** to 0 and the two wirings' SPL curves land on top of each other.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Series has more Bl, so it's tighter" | Bl doubles, but Re quadruples: Bl²/Re, Qes and Qts are identical both ways. |
| "Series sounds tighter because of the amp's damping factor" | The amp's rating doesn't matter: its 0.01 Ω is lost next to the coil. The cable and terminals do, four times more at 1 Ω. With 0.15 Ω: Qtc 0.99 against 1.07, about half a dB of bump. |
| "Parallel is louder" | At the same gain, 6 dB louder: just level. At the same power, the same, less the wire loss. At full power, only as much as the amplifier makes more into the lower load: 1.5 dB at most here. |
| "1 Ω gets you double the watts" | Only from an amplifier rated that way. The Kicker makes the same 1200 W at 2 Ω and 1 Ω; JL's regulated 1000/1 makes 1000 W from 1.5 Ω to 4 Ω. |
| "Low impedance is hard on the amp" | Yes: more current, more heat, usually more distortion [8]. |
| "DVC wiring changes the box you need" | No: Fs, Qts and Vas are the same, so the box is the same. |

## Sources

1. Dayton Audio, [UMII12-22 Ultimax II 12″ DVC Subwoofer 2 Ohms Per Coil](https://daytonaudio.com/product/2064/umii12-22-ultimax-ii-12-dvc-subwoofer-2-ohms-per-coil) and its [specification sheet](https://www.daytonaudio.com/images/resources/295-712--dayton-audio-UMII12-22-spec-sheet.pdf): 800 W RMS, dual 2 Ω coils, parameters measured with the coils in series as one 4 Ω load.
2. diyAudio, [System Q](https://www.diyaudio.com/community/threads/system-q.3719): series resistance from the amplifier, crossover and cables raises Qes by (1 + Rg/Re), and Qts with it.
3. diyAudio, [T/S parameters equations](https://www.diyaudio.com/community/threads/t-s-parameters-equations.23300): Qes counts Re + Rg, and the output falls by 20·log(Re / (Re + Rg)).
4. Butler Audio, [Defining "damping factor"](https://butleraudio.com/damping2.php): the amplifier's damping-factor rating says little about the damping the woofer sees. Series resistance raises a sealed box's Qtc by (Re + Rg)/Re.
5. Dick Pierce, [Damping Factor: Effects On System Response](https://www.audioholics.com/audio-amplifier/damping-factor-effects-on-system-response), Audioholics, 2004: Qtc, peak and decay time against damping factor for a sealed box. Most of the damping comes from the voice coil's own resistance.
6. JL Audio, [1000/1 owner's manual, specifications](https://www.manualsdir.com/manuals/135043/jl-audio-1000_1.html?page=11): regulated 1000 W from 1.5 Ω to 4 Ω, damping factor above 500 at 4 Ω and above 250 at 2 Ω.
7. HyperPhysics, [Common wire gauges](https://hyperphysics.gsu.edu/hbase/Tables/wirega.html): copper resistance per 1000 m by AWG (12 AWG 5.21 Ω, 16 AWG 13.2 Ω).
8. Dave MacKinnon, [How Does Series and Parallel Voice Coil Wiring Affect Subwoofer Output?](https://www.bestcaraudio.com/how-does-series-and-parallel-voice-coil-wiring-affect-subwoofer-output/), BestCarAudio.com, November 2023: a 10″ DVC sub measured both ways on the same amplifier settings, just under 6 dB apart. Amplifiers are less efficient and add more distortion at low loads.
9. Kicker, [CXA1200.1 1200-Watt Mono Class D Subwoofer Amp](https://www.kicker.com:443/CXA12001-1200-Watt-Mono-Class-D-Subwoofer-Amp): 600 W into 4 Ω, 1200 W into 2 Ω, 1200 W ±10 % into 1 Ω.
10. JL Audio JD1000/1 specifications, [MCOR Automotive](https://shop.mcorautomotive.com/products/jd1000-1) and [Masori](https://masori.de/en/products/jl-audio-jd1000-1-verstaerker): 600 W into 4 Ω, 1000 W into 2 Ω, not rated for 1.5 Ω. Damping factor above 1000 at 4 Ω and above 500 at 2 Ω.
11. Parts Express, [Dayton Audio UMII12-22 Ultimax II 12″ DVC Subwoofer](https://www.parts-express.com/Dayton-Audio-UMII12-22-ULTIMAX-II-12-700W-RMS-DVC-Subwoofer-2-Ohm-Per-Coil-295-712): sealed boxes from 1 ft³, and a 2.5 ft³ vented box tuned to 25 Hz for car audio.
