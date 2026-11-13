---
title: How to compare two drivers for the same box
description: Two 10-inch subs from the same family, the RSS265HF-4 and RSS265HO-4, in the same sealed and ported boxes from the same amplifier. Which one goes deeper, which one is louder, what stops each one, and what the forum rules of thumb get wrong.
path: guides/compare-drivers
image: chart:compare-example/spl
order: 9
group: start
---

# How to compare two drivers for the same box

Choosing between two woofers from their datasheets is guesswork, because the numbers that matter (how deep, how loud, what breaks first) depend on the box. Put both drivers in the boxes you can actually build, drive them from the same amplifier, and the answer usually stops being a matter of opinion. This guide does that for two 10″ subs that forum threads argue about a lot.

[[Open the worked example|compare-example]]

## The two drivers

The **Dayton Audio RSS265HF-4** and **RSS265HO-4** [1][2] look like twins: same frame, same cone area, same 12.3 mm Xmax, same 3.5 Ω coil. The HO ("high output") has a much stronger motor and a heavier cone, and is rated for 600 W against the HF's 350 W.

| | RSS265HF-4 | RSS265HO-4 |
|---|---|---|
| Fs | 25.6 Hz | 26.9 Hz |
| Qts | **0.45** | **0.35** |
| Vas | 54 L | 29.4 L |
| BL | 11.4 T·m | **17.6 T·m** |
| Moving mass | 120 g | **201 g** |
| Xmax | 12.3 mm | 12.3 mm |
| Power rating | 350 W | **600 W** |
| Passband level at 1 W, 1 m (the app) | **84.1 dB** | 83.5 dB |

## What each one wants

Before comparing them in the same box, it's worth seeing the boxes each one asks for. **Boxes → Size all** gives a sealed box for Qtc 0.707 and a flat ported alignment (QB3, the box WinISD's wizard gives):

![Each driver in the boxes the app sizes for it, at 350 W. The HF wants a sealed box of {{num:compare-own-hf/1/vb}} L (F3 {{num:compare-own-hf/1/f3}} Hz) or a ported box of {{num:compare-own-hf/2/vb}} L at {{num:compare-own-hf/2/fb}} Hz (F3 {{num:compare-own-hf/2/f3}} Hz); the HO wants a sealed box of {{num:compare-own-ho/1/vb}} L (F3 {{num:compare-own-ho/1/f3}} Hz) or a ported box of {{num:compare-own-ho/2/vb}} L at {{num:compare-own-ho/2/fb}} Hz (F3 {{num:compare-own-ho/2/f3}} Hz).](chart:compare-own-hf/spl|compare-own-ho/spl "RSS265HF-4|RSS265HO-4")

| Box the app sizes | HF: volume, F3 | HO: volume, F3 | Dayton's own (BassBox) [1][2] |
|---|---|---|---|
| Sealed, Qtc 0.707 | {{num:compare-own-hf/1/vb}} L, {{num:compare-own-hf/1/f3}} Hz | {{num:compare-own-ho/1/vb}} L, {{num:compare-own-ho/1/f3}} Hz | HF 25.5 L, 45 Hz · HO 8.5 L, 60 Hz |
| Ported, flat (QB3) | {{num:compare-own-hf/2/vb}} L at {{num:compare-own-hf/2/fb}} Hz, {{num:compare-own-hf/2/f3}} Hz | {{num:compare-own-ho/2/vb}} L at {{num:compare-own-ho/2/fb}} Hz, {{num:compare-own-ho/2/f3}} Hz | HF 42.5 L, 27 Hz · HO 14.2 L, 36 Hz |

The strong motor and low Vas let the HO work in a tiny box, but a tiny box costs depth: even ported, its "own" box only reaches 31.6 Hz. The HF wants big boxes and goes much deeper in them. Dayton's published BassBox boxes point the same way, a little smaller than the app's Qtc 0.707 choice [1][2].

That table doesn't answer the usual question, though, which is "I can build *this* box: which driver goes in it?" For that, put both in the same boxes.

## The worked example

Both drivers, the HF as the main driver and the HO as the comparison, in:

- a **30 L sealed box**, a typical size for a 10″ sub;
- a **50 L ported box tuned to 26 Hz**, with a 10 cm (4″) port flared 2.5 cm at both ends, 67.4 cm long.

The amplifier gives **350 W**, which is 35 V into these 3.5 Ω coils: the HF's full rating, and a bit over half the HO's. A **24 dB/oct high-pass filter at 22 Hz** protects both. Because both coils are 3.5 Ω, the same watts means the same voltage from the amplifier, so this is a like-for-like test.

![Both drivers at 350 W in dB SPL: the HF solid, the HO dashed; blue the 30 L sealed box, orange the 50 L ported box. At 100 Hz the four curves are within 1.6 dB; below that the HO sealed (dashed blue) falls away first.](chart:compare-example/spl)

This is the response chart in **dB SPL** mode. Above 100 Hz all four curves sit together: the HO's stronger motor and heavier cone cancel out, and it's only 0.7 dB less sensitive. Below 100 Hz they split by box. In the sealed box the dashed HO falls away earliest. In the ported box the HO holds level a little lower down.

| At 350 W | HF, sealed 30 L | HO, sealed 30 L | HF, ported 50 L | HO, ported 50 L |
|---|---|---|---|---|
| F3 | **{{num:compare-example/1/f3}} Hz** | {{num:compare-example/3/f3}} Hz | {{num:compare-example/2/f3}} Hz | **{{num:compare-example/4/f3}} Hz** |
| Qtc / Fc | {{num:compare-example/1/qtc}} / {{num:compare-example/1/fc}} Hz | {{num:compare-example/3/qtc}} / {{num:compare-example/3/fc}} Hz | — | — |
| 25 Hz | {{num:compare-example/1/spl@25}} dB | {{num:compare-example/3/spl@25}} dB | {{num:compare-example/2/spl@25}} dB | **{{num:compare-example/4/spl@25}} dB** |
| 30 Hz | **{{num:compare-example/1/spl@30}} dB** | {{num:compare-example/3/spl@30}} dB | {{num:compare-example/2/spl@30}} dB | {{num:compare-example/4/spl@30}} dB |
| 40 Hz | **{{num:compare-example/1/spl@40}} dB** | {{num:compare-example/3/spl@40}} dB | **{{num:compare-example/2/spl@40}} dB** | {{num:compare-example/4/spl@40}} dB |
| 60 Hz | **{{num:compare-example/1/spl@60}} dB** | {{num:compare-example/3/spl@60}} dB | **{{num:compare-example/2/spl@60}} dB** | {{num:compare-example/4/spl@60}} dB |
| Peak cone travel (Xmax 12.3 mm) | {{num:compare-example/1/x}} mm at {{num:compare-example/1/xf}} Hz | **{{num:compare-example/3/x}} mm** at {{num:compare-example/3/xf}} Hz | {{num:compare-example/2/x}} mm at {{num:compare-example/2/xf}} Hz | **{{num:compare-example/4/x}} mm** at {{num:compare-example/4/xf}} Hz |
| Peak port air speed | — | — | {{num:compare-example/2/port}} m/s | {{num:compare-example/4/port}} m/s |

**In the sealed box the HF wins:** F3 {{num:compare-example/1/f3}} Hz against {{num:compare-example/3/f3}} Hz, and 1.9–2.7 dB louder from 30 to 60 Hz. The HO's motor over-damps it in 30 L (Qtc {{num:compare-example/3/qtc}}), so its output starts falling away below about 100 Hz.

**In the ported box it's close, and it depends on where you listen.** The HO goes a little deeper (F3 {{num:compare-example/4/f3}} Hz against {{num:compare-example/2/f3}} Hz) and is louder at 25 Hz ({{num:compare-example/4/spl@25}} against {{num:compare-example/2/spl@25}} dB). The HF is 2.5–2.7 dB louder from 40 to 60 Hz.

## What stops each one

At the same 350 W the HF is past Xmax in *both* boxes; the HO isn't in either.

![Cone excursion at 350 W: the HF in the sealed box (solid blue) peaks at {{num:compare-example/1/x}} mm at {{num:compare-example/1/xf}} Hz and in the ported box (solid orange) at {{num:compare-example/2/x}} mm at {{num:compare-example/2/xf}} Hz, both over the 12.3 mm line; the HO (dashed) stays under it, {{num:compare-example/3/x}} and {{num:compare-example/4/x}} mm.](chart:compare-example/excursion)

On the **Excursion** chart, both solid HF curves cross the red Xmax line: {{num:compare-example/1/x}} mm at {{num:compare-example/1/xf}} Hz sealed, which it reaches at about {{num:compare-example/1/xmaxW}} W, and {{num:compare-example/2/x}} mm at {{num:compare-example/2/xf}} Hz ported, reached at about {{num:compare-example/2/xmaxW}} W. The dashed HO curves stay under it. That's partly because the HO is a little quieter in the sealed box, so look at the ceiling too.

![Maximum SPL (first limit reached), with each box's limit bars: filled markers for the HF, outlined for the HO. In the sealed box both are capped by Xmax (red) up to 45 Hz at almost the same level. In the ported box the HO's dashed curve rises above the HF's from 23 to 33 Hz, limited by port speed (amber) at 24–27 Hz.](chart:compare-example/maxspl)

The **Max SPL** chart lets each driver go to its own limit, its own 600 or 350 W included. The bars under it say which limit comes first, one row per box per driver (outlined markers are the comparison driver):

| Most output (first limit) | HF, sealed | HO, sealed | HF, ported | HO, ported |
|---|---|---|---|---|
| 25 Hz | {{num:compare-example/1/max@25}} dB ({{num:compare-example/1/limit@25}}) | {{num:compare-example/3/max@25}} dB ({{num:compare-example/3/limit@25}}) | {{num:compare-example/2/max@25}} dB ({{num:compare-example/2/limit@25}}) | **{{num:compare-example/4/max@25}} dB** ({{num:compare-example/4/limit@25}}) |
| 30 Hz | {{num:compare-example/1/max@30}} dB ({{num:compare-example/1/limit@30}}) | {{num:compare-example/3/max@30}} dB ({{num:compare-example/3/limit@30}}) | {{num:compare-example/2/max@30}} dB ({{num:compare-example/2/limit@30}}) | **{{num:compare-example/4/max@30}} dB** ({{num:compare-example/4/limit@30}}) |
| 40 Hz | {{num:compare-example/1/max@40}} dB ({{num:compare-example/1/limit@40}}) | {{num:compare-example/3/max@40}} dB ({{num:compare-example/3/limit@40}}) | {{num:compare-example/2/max@40}} dB ({{num:compare-example/2/limit@40}}) | {{num:compare-example/4/max@40}} dB ({{num:compare-example/4/limit@40}}) |
| Amplifier volts needed at 30 Hz | {{num:compare-example/1/volts@30}} V | {{num:compare-example/3/volts@30}} V | {{num:compare-example/2/volts@30}} V | **{{num:compare-example/4/volts@30}} V** |

In the 30 L sealed box the two have **the same ceiling** within 0.2 dB, because it's set by cone area × Xmax, which they share. The HO just needs more voltage to get there: {{num:compare-example/3/volts@30}} V at 30 Hz against {{num:compare-example/1/volts@30}} V. In the ported box the HO's extra rating does buy something: 2.5–3.0 dB more at 25–30 Hz. To get it you need an amplifier that delivers **45 V**, about 600 W into these coils. A 350 W amp won't do it.

![Amplifier voltage needed for maximum SPL: the HF tops out at 35 V (its 350 W rating), the HO at {{num:compare-example/4/volts@30}} V (600 W); in the ported box the HO needs 45 V around 28 Hz.](chart:compare-example/maxvolts)

> **Rule of thumb:** a higher power rating only means more output where the cone isn't the limit. Check the Max SPL bars: where both drivers are red (Xmax), the extra watts buy nothing.

## Forum myths, checked

**"The HF is for ported, the HO is for sealed."** A diyAudio poster put it that way about these two drivers, and the next reply said it's the other way around [3]. The reply is right. In the 30 L sealed box the HO's F3 is {{num:compare-example/3/f3}} Hz against the HF's {{num:compare-example/1/f3}}, because its low Qts over-damps it (Qtc {{num:compare-example/3/qtc}}). The HO's "sealed box" is 8.5–10.6 L with an F3 of 55–60 Hz, by the app's sizing and by Dayton's own [2]: fine for a car, too shallow for most home subs. *Proof: the response chart, sealed curves.*

**"The HF's Qts is too high for a port; it'll be boomy."** An Audioholics reply said exactly this about the HF [4]. In the 50 L box at 26 Hz its response stays between −0.8 and +1.3 dB of its passband from 30 Hz up, with no hump, and its flat alignment (86.4 L at 22.3 Hz) reaches 20.2 Hz. A Qts of 0.45 asks for a *bigger* ported box, not a different box type. *Proof: the response chart, ported curves; Boxes → Size all.*

**"The HO has a bigger motor, so it's louder."** Not per watt: 83.5 dB at 1 W against the HF's 84.1. The heavier cone uses up what the motor adds. It's louder only where its extra rating lets it take more power and Xmax doesn't stop it first: in the ported box at 25–30 Hz, from a 45 V amplifier. *Proof: response in dB SPL above 100 Hz; Max SPL → Volts.*

**"Lower Qts always means deeper bass."** Only in a ported box ({{num:compare-example/4/f3}} Hz against {{num:compare-example/2/f3}} Hz here). In a sealed box of the same size a lower Qts means a lower Qtc and an *earlier* roll-off. *Proof: the summary table's F3 column.*

**"Compare drivers by their recommended boxes."** That tells you what each does in a box *you may not build*: 19 L against 86 L here. Compare them in your box. The HO's 19 L ported box is attractive until you see its F3 is 31.6 Hz. *Proof: Size all for each driver, then the same boxes for both.*

## Doing it in the app

Shortlisting? Each driver's [page](/drivers/) shows its suggested boxes, so you can narrow the list first.

1. Pick the first driver on the **Driver** tab and add the boxes you can build on the **Boxes** tab.
2. Next to **Compare**, pick the second driver. It shows in every box as a dashed curve in the same colour, on every chart. If its database entry has no Xmax or power rating, the message says it's borrowing the main driver's: swap to enter its own.
3. Set the power to what your amplifier gives. If the two drivers' impedances differ, switch the drive to **volts**, since an amplifier gives both the same voltage, not the same watts.
4. Switch the response chart to **dB SPL**. **Relative** puts each curve's own passband at 0 dB, which hides a sensitivity difference.
5. Read the summary table: each box has a second row for the comparison driver, with its F3 and peak excursion and port speed, in red when over a limit.
6. Check **Excursion**, then **Max SPL**: its bars show what stops each driver, and **Volts** shows the amplifier each one needs.
7. Press **Swap** (⇅) to make the second driver the main one, for example to **Size all** for it, then swap back.

The comparison driver uses the same number of drivers, wiring, filter and settings as the main one. Its voice coil wiring is its own, so you can compare one dual voice coil sub with itself wired the other way, as the [DVC wiring guide](/guides/dvc-wiring/) does. For one big driver against two smaller ones, see [one 15″ or two 10″](/guides/one-15-vs-two-10s/).

[[Open the worked example|compare-example]]

> **Common trap:** reading a 1–2 dB difference between similar drivers as real. Production T/S parameters typically vary 10–20 % between samples, so differences of a dB or two are inside that spread. Differences of several dB in output, or several hertz of F3, or a cone over Xmax, are real.

## Sources

1. Dayton Audio, [RSS265HF-4 10″ Reference HF Subwoofer](https://www.daytonaudio.com/product/118/rss265hf-4-10-reference-hf-subwoofer-4-ohm): T/S parameters (used with Dayton Audio's permission); "optimum" boxes from BassBox: sealed 0.9 ft³, F3 45 Hz; vented 1.5 ft³, F3 27 Hz.
2. Dayton Audio, [RSS265HO-4 10″ Reference HO Subwoofer](https://daytonaudio.com/product/120/rss265ho-4-10-reference-ho-subwoofer-4-ohm): T/S parameters (used with Dayton Audio's permission); "optimum" boxes from BassBox: sealed 0.3 ft³, F3 60 Hz; vented 0.5 ft³, F3 36 Hz.
3. diyAudio, [Musical subwoofer: ported or sealed?](https://www.diyaudio.com/community/goto/post?id=2736133): a poster calls the HF best for a ported box and the HO good for sealed; the reply says it should be the other way around.
4. Audioholics forums, [First sub design, sanity check please?](https://forums.audioholics.com/forums/threads/first-sub-design-sanity-check-please.87805/latest): a reply calling the RSS265HF-4's Qts too high for a ported box.
