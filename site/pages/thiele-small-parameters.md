---
title: Thiele/Small parameters explained
description: What Fs, Qts, Vas, Xmax and the rest mean in practice, checked on two real 8-inch drivers in the same boxes. Which numbers decide the box, which decide how loud, what the forum rules of thumb get wrong, and how to enter a datasheet without mistakes.
path: guides/thiele-small-parameters
image: ts-spl.png
order: 10
group: start
---

# Thiele/Small parameters explained

Every woofer datasheet has a block of numbers like "Fs 35 Hz, Qts 0.33, Vas 37.4 L". These are its Thiele/Small (T/S) parameters, and they're all a box simulator needs to predict the bass in any box. This guide explains what each one does, then checks it on two real 8″ drivers whose numbers point in opposite directions, in the same two boxes, so you can see each parameter at work on a chart.

[[Open the worked example|ts-example]]

## Two drivers, opposite numbers

The **Dayton Audio DSA215-8** [1] is an 8″ woofer with a strong motor and a light cone. The **RSS210HF-4** [2] is an 8″ subwoofer with a heavy cone and a softer grip on it:

| Parameter | DSA215-8 | RSS210HF-4 | What it is |
|---|---|---|---|
| Fs | 35 Hz | 29.6 Hz | Resonance in free air |
| Qts | **0.33** | **0.57** | Total Q at resonance |
| Qes | 0.40 | 0.69 | Electrical Q (the motor's damping) |
| Qms | 1.87 | 3.25 | Mechanical Q (the suspension's damping) |
| Vas | **37.4 L** | **23.7 L** | Air volume as springy as the suspension |
| Sd | 211 cm² | 219 cm² | Cone area |
| Re | 5.9 Ω | 3.1 Ω | Voice coil resistance (DC) |
| Bl | 10.6 T·m | 8.1 T·m | Motor strength |
| Mms | 34.6 g | 78.4 g | Moving mass, air load included |
| Xmax | 5.5 mm | 9 mm | Cone travel, one way |
| Pe | 80 W | 280 W | Power handling (thermal) |
| EBP (Fs/Qes) | 88 | 43 | Efficiency-bandwidth product |

## How they fit together

![How the T/S parameters fit together, for the DSA215-8: six physical parts (Mms, Cms, Bl, Re, Rms, Sd) set the four datasheet values (Fs, Qes, Qms, Vas), and those decide how deep, which box, how big and how loud.](img/ts-relations.png)

Read the diagram left to right. Six physical parts set everything:

- **Mms** (moving mass) and **Cms** (suspension compliance, the inverse of stiffness) set **Fs** = 1 / (2π √(Mms·Cms)).
- **Bl** (motor strength) and **Re** (coil resistance) set **Qes** = 2π·Fs·Mms·Re / Bl². A strong motor means a low Qes.
- **Rms** (suspension losses) sets **Qms** = 2π·Fs·Mms / Rms.
- **Cms** seen as a volume of air is **Vas** = ρc²·Sd²·Cms.
- **Qts** combines Qes and Qms like resistors in parallel: Qts = Qes·Qms / (Qes + Qms). Qes usually dominates.

You can check a datasheet with these. For the DSA215-8, 2π × 35 × 0.0346 × 5.9 / 10.6² gives a Qes of 0.40, as stated.

> **Rule of thumb:** Fs, Qes, Qms, Vas, Re and Sd are a complete set. Everything else (Qts, Mms, Bl, Cms, Rms) follows from them, so if a datasheet gives more, the extra values are a cross-check, not new information.

## The ones that decide the box

**Qts decides the box type.** It says how well damped the driver is on its own. The usual guide [3]:

- under about 0.4: ported or passive radiator (the DSA215-8, at 0.33);
- about 0.4 to 0.6: either (the RSS210HF-4, at 0.57, near the top);
- over about 0.6: sealed, or open baffle.

**EBP**, Fs ÷ Qes, says the same thing another way: under 50 leans sealed, over 100 leans ported, in between either [4]. The DSA215-8's 88 leans ported; the RSS210HF-4's 43 says sealed. The app's **Driver** tab puts both rules in one line under the parameters: "Box type: EBP 88 (Fs/Qes), Qts 0.33: leans ported, sealed can work too."

**Vas and Qts together decide the box size.** For a sealed box with Qtc 0.707, Vb = Vas / ((0.707/Qts)² − 1) [5]. A low Qts shrinks the box fast:

![Sealed box size for Qtc 0.707 against Qts, for Vas 37.4 L and 23.7 L. The DSA215-8 (Qts 0.33) needs 10.4 L; the RSS210HF-4 (Qts 0.57), despite its smaller Vas, needs 43.6 L.](img/ts-box-size.png)

The chart is that formula for both drivers' Vas. The DSA215-8 has the *bigger* Vas but needs the *smaller* box, 10.4 L against 43.6 L, because its Qts is so low. **Boxes → Size all** gives exactly these:

| Size all gives | DSA215-8 | RSS210HF-4 |
|---|---|---|
| Sealed, Qtc 0.707 | **10.4 L**, F3 79.6 Hz | 43.6 L, F3 37.9 Hz |
| Ported, flat alignment (QB3) | **18.0 L** at 41.7 Hz | 80.9 L at 20.5 Hz |

**Fs, with the box, decides how deep.** A low Fs is the first sign of a deep-bass driver, but it's the box that sets the F3. The RSS210HF-4 has the lower Fs, and in the boxes it wants it reaches 37.9 Hz sealed and 17.6 Hz ported. (The ported boxes are sized as WinISD's QB3 alignment sizes them; WinISD would give the same.)

## The worked example: both drivers in the DSA215-8's boxes

The example puts both drivers in the DSA215-8's own boxes, the 10.4 L sealed box and the 18.0 L ported box at 41.7 Hz. The ported box has a 5 cm port flared 0.8 cm at both ends, 16.1 cm long, so it fits straight. The drive is **21.7 V**, the DSA215-8's rated 80 W into its 5.9 Ω coil; at the same voltage the 3.1 Ω RSS210HF-4 takes 152 W, well inside its 280 W. A 12 dB/oct high-pass filter at 30 Hz is on, as a bookshelf speaker's amp might have.

![Both drivers at 21.7 V in dB SPL: DSA215-8 solid, RSS210HF-4 dashed; blue the 10.4 L sealed box, orange the 18.0 L ported box. The DSA215-8 is 3.7 dB louder above 100 Hz; the RSS210HF-4 in the ported box humps up near 57 Hz.](img/ts-spl.png)

| At 21.7 V | DSA215-8, sealed | RSS210HF-4, sealed | DSA215-8, ported | RSS210HF-4, ported |
|---|---|---|---|---|
| F3 | 80.3 Hz | **46.4 Hz** | **49.3 Hz** | 36.9 Hz, but… |
| Qtc / peak | 0.71, flat | 1.03, +1.5 dB at 85 Hz | flat | **+5.7 dB at 57 Hz** |
| Passband level | **107.1 dB** | 103.4 dB | **107.1 dB** | 103.4 dB |
| 40 Hz | 93.6 dB | 97.5 dB | 100.1 dB | 102.9 dB |
| Peak cone travel | 5.6 mm at 48 Hz (Xmax 5.5) | 8.4 mm at 46 Hz (Xmax 9) | **7.9 mm at 24 Hz** | **10.2 mm at 24 Hz** |
| Peak port air speed | — | — | 18.9 m/s | **26.6 m/s** |

**In the box its numbers ask for, each driver is flat.** The DSA215-8 is flat in both of its boxes: Qtc 0.71 sealed, a QB3 ported. Its low Qts makes the sealed box roll off early (F3 80.3 Hz), and the port extends it to 49.3 Hz. That's what Qts 0.33 and EBP 88 predicted. At its full 80 W the port runs at 18.9 m/s, a little over the 17 m/s chuffing line; a bigger or longer-flared port would keep it quiet.

**In the wrong box, the high-Qts driver booms.** The RSS210HF-4 in the same 10.4 L sealed box has Qtc 1.03 and a 1.5 dB bump. In the 18.0 L ported box it humps **5.7 dB** above its passband at 57 Hz: the classic boomy, one-note bass of a high-Qts driver in a small ported box. Its "F3 36.9 Hz" is measured from that hump, which is why the F3 alone doesn't tell you a box is good.

**The DSA215-8 is 3.7 dB louder, from a smaller cone mass.** Reference efficiency goes with Fs³ × Vas ÷ Qes [6]: 112.0 + 10·log₁₀(9.78 × 10⁻¹⁰ × Vas × Fs³ / Qes) gives **88.0 dB** at 1 W, 1 m for the DSA215-8 and **81.4 dB** for the RSS210HF-4. The app's passband levels work out to 88.1 and 81.6 dB per watt. That 6.6 dB per watt (6.5 in the app) is partly made up because, at the same 21.7 V, the 3.1 Ω coil takes 2.8 dB more power. This is [Hofmann's Iron Law](/guides/hofmann-iron-law/) in two drivers: the RSS210HF-4 trades efficiency for depth in a big box.

## The ones that decide how loud

**Sd × Xmax is the air the cone can move** (its displacement), and it sets how loud a driver can play in the bottom octave, whatever the box. Xmax is one way, peak; some makers quote peak to peak, or a looser figure, so check. **Pe** is how much power the coil takes before it overheats; using it all takes an amplifier that delivers √(Pe × Re) volts: **21.7 V** for the DSA215-8.

![Cone excursion at 21.7 V: the DSA215-8 (solid) reaches its 5.5 mm Xmax at 48 Hz in the sealed box and 7.9 mm at 24 Hz in the ported box, below the tuning; the RSS210HF-4 (dashed) stays under its 9 mm in the sealed box and reaches 10.2 mm at 24 Hz in the ported box.](img/ts-excursion.png)

On the **Excursion** chart each driver has its own Xmax line (the label says "Xmax 5.5 · vs 9 mm"). At its full 80 W the DSA215-8 just reaches Xmax in the sealed box (5.6 mm at 48 Hz). In the ported box it goes to **7.9 mm at 24 Hz**, below the tuning, where the port no longer holds the cone back and a 12 dB/oct filter at 30 Hz isn't steep enough.

![Maximum SPL (first limit reached) with each box's limit bars: filled markers for the DSA215-8, outlined for the RSS210HF-4. Cone Xmax (red) limits the sealed boxes up to 60 Hz (DSA215-8) and 66 Hz (RSS210HF-4); in the ported box port speed (amber) limits from 32 to 50 Hz for the DSA215-8 and from 27 to 64 Hz for the RSS210HF-4.](img/ts-maxspl.png)

The **Max SPL** chart lets each driver go to its own limit, and the bars say which limit comes first. At 40 Hz the sealed DSA215-8 tops out at 93.8 dB (Xmax). The ported box reaches **99.2 dB with either driver**, because the port's air speed, not the driver, is the limit there. The RSS210HF-4's 280 W and 9 mm don't help at 40 Hz in a box this small.

## Forum myths, checked

**"A big Vas means a big box."** Only for the same Qts. The DSA215-8's Vas is 58 % bigger, and its sealed box is a quarter the size: 10.4 L against 43.6 L. Box size goes with Vas *and* Qts [5]; as a diyAudio regular put it, the box is usually smaller than Vas, except for small high-Qts drivers [7]. *Proof: Boxes → Size all for each driver; the box-size chart above.*

**"A lower Fs means deeper bass."** Usually, but not on its own [8]. In the same 10.4 L sealed box the RSS210HF-4 (Fs 29.6 Hz) reaches 46.4 Hz and the DSA215-8 (Fs 35 Hz) 80.3 Hz. But it's the Qts that makes the gap that big, and in a ported box the DSA215-8 gets to 49.3 Hz with a flat response the RSS210HF-4 can't match there. *Proof: the response chart, with the summary table's F3 column.*

**"Any driver can go in a ported box; just tune it lower."** The RSS210HF-4 in an 18.0 L ported box humps 5.7 dB at 57 Hz, and its port runs at 26.6 m/s, well over the 17 m/s chuffing line, at only 152 W. With Qts 0.57 a ported box has to be big (80.9 L) to be flat. *Proof: the response and Port speed charts.*

**"Sensitivity figures tell you which driver is more efficient."** The reference efficiency from Fs, Vas and Qes is the honest number: it predicted the app's 88.1 and 81.6 dB per watt within 0.2 dB. Published sensitivities are sometimes at 2.83 V into a low impedance, or optimistic [9]. *Proof: response chart in dB SPL, above 100 Hz.*

**"Datasheet T/S values are exact."** Production drivers commonly vary 10–20 % on Fs, Qts and Vas, and Vas tolerances of ±20–30 % are quoted [9]. They also shift as the suspension breaks in. For a box that matters, measure your own (below).

## Entering them without mistakes

![The app's T/S editor after pasting six values from Dayton's spec sheet: what you typed is bold with an orange edge (Fs, Qms, Qes, Vas, Re, Sd); what the app works out is grey and dashed (Qts 0.33, Mms 34.99 g, Cms 0.591 mm/N, Bl 10.65 T·m, Rms 4.12 kg/s).](img/ts-editor.png)

Any complete set describes the driver, and the rest follows. In Speaker Box Genius:

- **What you type is never changed.** Your values are bold with an orange edge; what the app works out is grey. Type them in any order. Above, six pasted values give Mms 34.99 g and Bl 10.65 T·m, within about 1 % of the datasheet's 34.6 g and 10.6 T·m.
- **Contradictions are flagged.** If you type more values than needed and they disagree by more than 3 %, the app says which ones and lets you use the calculated value. The simulation always uses Fs, Qms, Qes, Vas, Re and Sd.
- **Paste the datasheet.** **Driver → Paste datasheet** (or **Driver tools → Paste from datasheet…**) picks the values out of a pasted spec table and converts units: "1.32 ft.³" as Dayton writes it, "1.9 ft3", "35630 mm²", "33 in²". A number with a unit it can't read is left out, and it says which line to type by hand.
- **Or pick the driver** from the database of about 1,530 drivers. Each also has [its own page](/drivers/) with its parameters and suggested boxes.
- **Measure your own.** **Driver tools → Measure from an impedance sweep…** fits the T/S parameters to a DATS, REW or ARTA sweep (.zma), and a second sweep with a known added mass gives Vas. A mass that drops Fs by roughly 10–30 % works well [10].

[[Open the worked example|ts-example]]

Next: what the parameters mean for your box, in [Sealed, ported or passive radiator?](/guides/sealed-vs-ported/), and why the same 2 dB can't be had for free, in [Hofmann's Iron Law](/guides/hofmann-iron-law/). Comparing two drivers yourself is covered in [How to compare two drivers](/guides/compare-drivers/).

## Sources

1. Dayton Audio, [DSA215-8 8″ Designer Series woofer](https://www.daytonaudio.com/product/1315/dsa215-8-8-designer-series-aluminum-cone-woofer-8-ohm) and its [specification sheet](https://www.daytonaudio.com/images/resources/295-530--dayton-audio-DSA215-8-specifications.pdf) (used with Dayton Audio's permission).
2. Dayton Audio, [RSS210HF-4 8″ Reference HF subwoofer](https://www.daytonaudio.com/product/117/rss210hf-4-8-reference-hf-subwoofer-4-ohm) (used with Dayton Audio's permission).
3. diyAudio, [Qts ranges for reflex, aperiodic and closed boxes](https://www.diyaudio.com/community/goto/post?id=3909300): reflex under about 0.38, closed box over about 0.5.
4. diyAudio, [EBP and Dickason's *Loudspeaker Design Cookbook*](https://diyaudio.com/community/goto/post?id=2436410): EBP = Fs/Qes, under 50 sealed, over 100 vented, 50–100 either (after R. Small).
5. diyAudio, [Qb and Vb in acoustic suspension systems](https://www.diyaudio.com/community/threads/qb-and-vb-in-acoustic-suspension-systems.28700): Vb = Vas / ((Qtc/Qts)² − 1), from R. H. Small, "Closed-Box Loudspeaker Systems, Part I", *J. AES* 20 (10), 1972.
6. Best Car Audio, [The science behind speaker efficiency specifications](https://bestcaraudio.com/the-science-behind-car-audio-speaker-efficiency-specifications): η₀ = 9.7822 × 10⁻¹⁰ × Vas × Fs³ / Qes (Vas in litres), and how Bl, Cms and Re move Qes.
7. diyAudio, [Box size and Vas](https://www.diyaudio.com/community/goto/post?id=4330490): box size relative to Vas sets Fbox and Qbox; Vbox is usually less than Vas, except for small high-Qts drivers.
8. the12volt.com, [Thiele-Small parameters](https://www.the12volt.com/caraudio/thiele-small-parameters.asp): a lower Fs generally suits low frequencies, but not always, because the other parameters matter too.
9. caraudio.com, [What does it all mean?](https://www.caraudio.com/threads/what-does-it-all-mean-man.496067/): a typical Vas tolerance of ±20–30 %, and why reference efficiency is a fairer comparison than published sensitivity.
10. Studio Six Digital, [Thiele/Small parameters: driver parameter measurement](https://studiosixdigital.com/thiele-small-parameters/): the added-mass method; the mass should drop Fs by roughly 10–30 %.
