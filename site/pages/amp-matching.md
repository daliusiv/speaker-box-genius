---
title: "Matching an amplifier to your subwoofer: volts, amps and why impedance dips matter"
description: Read an amp's watt ratings as a voltage limit and a current limit, see how far a "4 Ω" sub's impedance really swings in its box, and find out when a dip runs your amp out of current, with a Crown XLS 1002 and two ported 12s you can open and change.
path: guides/amp-matching
image: chart:amp-one+amp-parallel+amp-series+amp-bridged/maxspl
order: 27
group: start
---

# Matching an amplifier to your subwoofer: volts, amps and why impedance dips matter

Is a 350 W amp enough for a 400 W sub? By the watts on the boxes, no. By the volts the sub actually needs, yes, with a little to spare. And if you hang a second sub on the same channel to "use the 2 Ω power", you've just found the one place the amp runs out: right at the box's tuning, where you play the deepest notes.

That's what this guide sorts out. We'll turn an amp's watt ratings into the two numbers that really limit it, look at how far a "4 Ω" sub's impedance moves in its box, and wire two subs four ways on one amp to see which wiring hits which wall.

[[One sub, one channel|amp-one]] [[Two in parallel|amp-parallel]] [[Two in series|amp-series]] [[Two in series, bridged|amp-bridged]]

## The short answer

- **An amp's watt ratings hide two limits.** It runs out of **voltage** into high impedances and **current** into low ones. Two of its ratings give you both: the XLS 1002's 350 W into 4 Ω is 37.4 V, its 550 W into 2 Ω is 16.6 A.
- **Match volts, not watts.** A driver's power rating is a voltage in disguise, worked out over its lowest impedance, about Re [4][5]. This sub's 400 W is 35.2 V. The "350 W" amp makes 37.4 V, which by the sub's own yardstick is 451 W.
- **A 4 Ω sub isn't 4 Ω.** In its box this one swings from {{fig:amp-matching/oneMin:2}} Ω to {{fig:amp-matching/oneMax}} Ω. The watts it draws swing with it ({{fig:amp-matching-watts/wMin:0}} W to {{fig:amp-matching-watts/wMax:0}} W at the same 35.2 V) while the sound stays within {{fig:amp-matching-watts/splSpread}} dB.
- **The dips are where current runs out.** Two subs in parallel dip to {{fig:amp-matching/parZTune:2}} Ω at the tuning and want {{fig:amp-matching/wantTune}} A there. The amp has {{fig:amp-matching/amps}} A, so it's the limit from {{fig:amp-matching/ampFrom:0}} to {{fig:amp-matching/ampTo:0}} Hz and again above {{fig:amp-matching/ampAgain:0}} Hz.
- **The cheapest fix is wiring.** One sub per channel, or both in series on the bridged amp, and the amp never limits.

## The setup: two 12s and a Crown

The sub is our usual one from the [port chuffing guide](/guides/port-chuffing/): a **Dayton Audio RSS315HF-4** (Re 3.1 Ω, rated 400 W) in **83.5 L tuned to 23.8 Hz**, with a 10 cm flared port and a 20 Hz high-pass filter [2]. For two subs, picture two of those boxes.

The amp is a **Crown XLS 1002**, a popular, cheap two-channel pro amp for DIY subs. Its datasheet rates it at 215 W into 8 Ω, 350 W into 4 Ω and 550 W into 2 Ω per channel; bridged, 700 W into 8 Ω and 1100 W into 4 Ω [1].

## What an amp's watt ratings are really telling you

A power rating into a resistor is a voltage and a current at the same time: V = √(P × R), I = √(P ÷ R). Run the Crown's numbers and a pattern pops out:

| Rating | Volts | Amps |
|---|---|---|
| 215 W into 8 Ω | 41.5 | 5.2 |
| 350 W into 4 Ω | **37.4** | 9.4 |
| 550 W into 2 Ω | 33.2 | **16.6** |
| 700 W into 8 Ω, bridged | **74.8** | 9.4 |
| 1100 W into 4 Ω, bridged | 66.3 | **16.6** |

Into high impedances the amp tops out on **voltage**, set by its power supply. Into the lowest load it's rated for, it tops out on **current**, set by its output stage and its protection. So a pair of numbers describes it: **37.4 V and 16.6 A** per channel, **74.8 V and 16.6 A** bridged. Plug those back in and you get 350, 550, 700 and 1100 W.

![The Crown XLS 1002 modelled as a voltage limit and a current limit: the watts it can deliver against load impedance, one channel (solid) and bridged (dashed), with its datasheet ratings as dots. Underneath, how far the subs' impedance swings from 15 to 200 Hz: one sub {{fig:amp-matching/oneMin:2}}–{{fig:amp-matching/oneMax}} Ω, two in parallel {{fig:amp-matching/parMin:2}}–{{fig:amp-matching/parMax}} Ω, two in series {{fig:amp-matching/serMin}}–{{fig:amp-matching/serMax:0}} Ω.](figure:amp-matching)

Read the curve from the left. Below about {{fig:amp-matching/knee}} Ω the amp is **current-limited**: halve the impedance and you halve the watts. Above it, it's **voltage-limited**: double the impedance and you halve the watts. The peak is where the two meet, at {{fig:amp-matching/volts}} V ÷ {{fig:amp-matching/amps}} A = {{fig:amp-matching/knee:2}} Ω.

The one dot that sits off the curve is 8 Ω. That's real: a lighter load drags the supply down less, so into 8 Ω the amp manages 41.5 V instead of 37.4. Taking the voltage from the 4 Ω rating is the conservative choice, and subs live near 4 Ω anyway.

> **Rule of thumb: two ratings in, two limits out.** Voltage = √(watts × ohms) from the higher-impedance rating. Current = √(watts ÷ ohms) from the lowest-impedance one. The app does this for you (see the end of the guide).

One caveat on Crown's numbers: they're **1 kHz** ratings at 0.5% distortion [1]. A long 25 Hz note works the power supply harder than a 1 kHz tone, so real sub-bass output can be a little lower. Treat the two limits as a ceiling, not a promise.

## A "4 Ω" sub spends most of its time somewhere else

The sticker says 4 Ω. The coil's DC resistance (Re) is 3.1 Ω. In the box, the impedance does this:

![Impedance of one RSS315HF-4 in 83.5 L at 23.8 Hz, from the app: peaks of {{num:amp-one/1/zlo}} Ω at {{num:amp-one/1/zlof:1}} Hz and {{num:amp-one/1/zpk}} Ω at {{num:amp-one/1/zpkf:1}} Hz, a dip of {{fig:amp-matching/oneZTune:2}} Ω at the 23.8 Hz tuning, and the lowest point, {{fig:amp-matching/oneMin:2}} Ω, around {{fig:amp-matching/oneMinF:0}} Hz.](chart:amp-one/impedance)

Two humps and two valleys:
- **The peaks ({{num:amp-one/1/zlo}} Ω at {{num:amp-one/1/zlof:1}} Hz, {{num:amp-one/1/zpk}} Ω at {{num:amp-one/1/zpkf:1}} Hz)** are the box and the cone resonating together. That's the classic vented-box double peak [11].
- **The valley at the tuning ({{fig:amp-matching/oneZTune:2}} Ω at 23.8 Hz)** is where the port does the work and the cone barely moves, so the driver looks almost like its bare coil.
- **The lowest point ({{fig:amp-matching/oneMin:2}} Ω around {{fig:amp-matching/oneMinF:0}} Hz)** is where the cone's moving mass and the coil's inductance roughly cancel.

{{fig:amp-matching/oneMin:2}} Ω is {{fig:amp-matching/oneMinPct:0}}% of 4 Ω. The loudspeaker standard IEC 60268-5 asks that a speaker's impedance never fall below 80% of its rated value in its working range [3], so this sub sits just below the line. That's common for subs, and it's why "4 Ω" is a label, not a load.

## The watts follow the impedance, the sound doesn't

Here's where the car-audio crowd's **"box rise"** comes from. Hold the sub at its rated 35.2 V and measure what the amp delivers:

![One sub at its rated 35.2 V: its impedance, and the watts the amp delivers, {{fig:amp-matching-watts/w25:0}} W at 25 Hz, down to {{fig:amp-matching-watts/w40:0}} W at the 39.5 Hz peak, back up to {{fig:amp-matching-watts/w150:0}} W at 150 Hz.](figure:amp-matching-watts)

Look at the watts: **{{fig:amp-matching-watts/w25:0}} W at 25 Hz, {{fig:amp-matching-watts/w40:0}} W at 40 Hz, {{fig:amp-matching-watts/w100:0}} W at 100 Hz, {{fig:amp-matching-watts/w150:0}} W at 150 Hz**. Same voltage, a fivefold swing in watts, mirroring the impedance.

And the sound? Between 30 and 200 Hz the SPL at that voltage stays within {{fig:amp-matching-watts/splSpread}} dB. At the impedance peak the box is doing its job: the sub needs very little power there to play just as loud.

> **Common trap: "box rise means my 1000 W amp only makes 300 W."** That's true of the watts [9], but it doesn't cost you output. What sets the SPL is the **voltage** the amp can swing, and the voltage limit doesn't care about the impedance. Fewer watts at the peaks is a free lunch, not a loss.

## So how much amp does this sub need?

Since a sub's loudness tracks voltage, ask how much voltage its rating stands for. AES2-1984, the test B&C and many others use, computes a driver's power as the RMS voltage squared over its **minimum impedance**, which is close to Re [4][5]. The app does the same with Re.

So this sub's 400 W means **√(400 × 3.1) = 35.2 V**.

Now the amp. "350 W into 4 Ω" is 37.4 V. Square that over the sub's Re and you get **451 W** on the sub's own yardstick. The watt ratings use different denominators (4 Ω on the amp, 3.1 Ω on the sub), which is why comparing them directly undersells the amp. In volts it's simple: 37.4 V against 35.2 V needed, 0.5 dB to spare.

**Is 0.5 dB enough?** Pro-audio makers usually suggest an amp rated about **twice** the speaker's continuous power: QSC says at least twice [6]; Harman suggests 1.6 to 2.5 times, or 2 to 4 times with a limiter [7]. That's 2 to 4 dB of headroom, so the amp isn't clipping on peaks while the speaker sits at its rating. By that rule the XLS 1002 is the bare minimum for this sub. The bigger XLS 1502 makes 45.8 V, 2.3 dB of headroom, which lands right in that window.

> **Rule of thumb: volts needed = √(Pe × Re).** Then take your amp's 4 Ω rating, find its voltage (√(W × 4)), and compare. Aim for 2–3 dB more than the sub needs: 1.25 to 1.4 times the voltage, which is 1.6 to 2 times the watts.

## Two subs, one amp: four ways to wire them

Here's where the impedance curve earns its keep. Two subs on one XLS 1002, four ways:

![Maximum SPL on one Crown XLS 1002: one sub on one channel ({{color:amp-one+amp-parallel+amp-series+amp-bridged/1}}), two in parallel on one channel ({{color:amp-one+amp-parallel+amp-series+amp-bridged/2}}), two in series on one channel ({{color:amp-one+amp-parallel+amp-series+amp-bridged/3}}), two in series on the bridged amp ({{color:amp-one+amp-parallel+amp-series+amp-bridged/4}}).](chart:amp-one+amp-parallel+amp-series+amp-bridged/maxspl)

| Wiring | Load | Max SPL at 30 Hz | at 100 Hz | Peak current | What limits it |
|---|---|---|---|---|---|
| One sub, one channel | {{fig:amp-matching/oneMin:2}}–{{fig:amp-matching/oneMax}} Ω | {{num:amp-one/1/max@30}} dB | {{num:amp-one/1/max@100}} dB | {{fig:amp-matching/peakOne}} A | the sub (400 W) |
| Two in parallel, one channel | {{fig:amp-matching/parMin:2}}–{{fig:amp-matching/parMax}} Ω | {{num:amp-parallel/1/max@30}} dB | {{num:amp-parallel/1/max@100}} dB | {{fig:amp-matching/peakPar}} A (wants {{fig:amp-matching/wantPeak:0}}) | the amp's **current** at {{fig:amp-matching/ampFrom:0}}–{{fig:amp-matching/ampTo:0}} Hz and above {{fig:amp-matching/ampAgain:0}} Hz |
| Two in series, one channel | {{fig:amp-matching/serMin}}–{{fig:amp-matching/serMax:0}} Ω | {{num:amp-series/1/max@30}} dB | {{num:amp-series/1/max@100}} dB | {{fig:amp-matching/peakSer}} A | the amp's **voltage**, everywhere |
| Two in series, bridged | {{fig:amp-matching/serMin}}–{{fig:amp-matching/serMax:0}} Ω | {{num:amp-bridged/1/max@30}} dB | {{num:amp-bridged/1/max@100}} dB | {{fig:amp-matching/peakBri}} A | the subs (400 W each) |

Each wiring hits a different wall:
- **Series on one channel** splits 37.4 V between two subs: 18.7 V each where they could take 35.2. That's {{diff:amp-bridged/1/amp-series/1/max@30}} dB short at 30 Hz, and barely louder than one sub alone.
- **Bridged series** gives each sub its full 35.2 V with voltage to spare. It reaches the subs' own limits everywhere, with only {{fig:amp-matching/peakBri}} A of current at most.
- **Parallel on one channel** is the interesting one. Most of the time it matches bridged, but not everywhere.

## Where the dips bite

Two "4 Ω" subs in parallel are a "2 Ω" load, and the XLS 1002 is rated for 2 Ω. Job done? Here's the current the amp would need to drive them to their limits, from the app's Max SPL chart in its **Amps** view:

![From the app: the amplifier current needed for maximum SPL with two subs in parallel on one channel. The curve climbs to the dashed {{fig:amp-matching/amps}} A line around the 24 Hz tuning and again from {{fig:amp-matching/ampAgain:0}} Hz up, where the band underneath turns amplifier blue.](chart:amp-parallel/maxamps)

Follow the orange line. It climbs to the dashed **16.6 A** line twice:
- **Around the tuning ({{fig:amp-matching/ampFrom:0}}–{{fig:amp-matching/ampTo:0}} Hz).** The load dips to {{fig:amp-matching/parZTune:2}} Ω at 23.8 Hz, and the subs would like {{fig:amp-matching/wantTune}} A there. The amp gives {{fig:amp-matching/amps}}, so the output is {{fig:amp-matching/shortTune}} dB short ({{fig:amp-matching/maxTune}} dB instead of {{fig:amp-matching/maxTuneFree}}).
- **From {{fig:amp-matching/ampAgain:0}} Hz up.** The load keeps falling, to {{fig:amp-matching/parZ100:2}} Ω at 100 Hz and {{fig:amp-matching/parMin:2}} Ω near {{fig:amp-matching/parMinF:0}} Hz. The output is {{fig:amp-matching/short100}} dB short at 100 Hz and {{fig:amp-matching/short150}} dB short at 150 Hz.

The coloured band under the chart shows the same thing: blue (amplifier) where current runs out, grey (the sub's rating) in between.

None of this is a disaster: {{fig:amp-matching/shortNearTuning}} dB at the tuning is barely audible. But the shortfall lands at the deepest notes this box plays, so it's exactly the one you wanted.

It also explains the "2 Ω stable" fine print. Two 4 Ω subs in parallel never present 2 Ω. They present {{fig:amp-matching/parMin:2}} to {{fig:amp-matching/parMax}} Ω, and the low end of that range is what the amp has to survive.

> **Common trap: wiring to the amp's lowest rated load to "get the most watts".** You do get more watts on paper. But the dips go below the rating, and one of them sits right at the tuning, where the port does the deepest work. Here one sub per channel would have given both subs their full output without the amp ever limiting.

## The part of the dip you can't see on the impedance chart

Ohms are only half the load. The other half is **phase**, the angle between the voltage and the current:

![From the app: impedance phase of one sub, swinging between about +47° and −45°, crossing zero at each impedance peak, at the tuning and at the 183 Hz minimum.](chart:amp-one/phase)

At 50 Hz the sub is 7.84 Ω, which sounds easy, but at **−45°**. When voltage and current are out of step like that, a linear (class AB) output stage burns far more heat for each watt it delivers. Keith Howard's EPDR measure turns this into "the resistor that would heat the amp as much", and near 45° it can be well under the impedance [8].

Two caveats keep this in proportion:
- EPDR is about **linear output stages**. Class-D amps like the XLS behave differently, so it's a rough guide for them.
- It's about **amp heat and protection**, not the sub's output.

Still, a sub that sits at 1.6 Ω and ±40° is a harder load than one that sits at 1.6 Ω and 0°. That's why the app now shows phase.

## "An underpowered amp will blow your sub"

You'll hear this one a lot. The usual story is that clipping sends harmonics to a tweeter. A sub has no tweeter, so for a sub the real mechanism is **average power** [10].

Drive an amp so hard that its sine waves flatten into square waves and the average power doubles, because a square wave holds its peak the whole time. The XLS 1002 clipped flat out would put about 52.9 V of square wave across the sub. That's **902 W** on the sub's own V²/Re yardstick, more than twice its 400 W rating.

So the danger isn't "too small an amp", it's an amp of any size driven past its limit. Rod Elliott makes the same point: power, not the shape of the clipping, is what kills drivers [10]. A bigger amp you keep out of clipping is safer than a small one you lean on, which is the real reason behind the "twice the rating" advice.

## Doing it in the app

![The app's Settings: Amp max volts and Amp max current, and the helper that works them out from two ratings (350 W into 4 Ω and 550 W into 2 Ω give 37.4 V and 16.6 A).](img/amp-matching-settings.png)

1. **Driver → Drivers and Wiring:** set how many subs and how they're wired. The line underneath says what the amp sees, nominally and at its lowest (here "2 Ω nominal (Re 1.55 Ω), dipping to 1.58 Ω").
2. **Settings → Work these out from the amp's ratings:** enter two of its ratings (the 4 Ω one and its lowest) and press **Use**. That fills in **Amp max volts** and **Amp max current**. Use the bridged ratings if you'll bridge it.
3. **Settings → Power rating vs:** leave it on V²/Re (like WinISD), which matches how drivers are rated. **Real power** lets the sub take more voltage at its impedance peaks, as Hornresp does.
4. **Max SPL chart:** the band underneath shows what limits each frequency, and blue means the amplifier. Switch to **Volts** or **Amps** to see what the amp has to deliver, with its own limit as a dashed line.
5. **Impedance chart:** switch between **Ω** and **Phase** to see how hard a load the boxes are.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Your amp should be twice the sub's RMS" | **A good guideline**, as headroom: twice the watts is 1.4 times the voltage, 3 dB. Compare in volts, with the sub's watts over Re [6][7]. |
| "A 350 W amp is underpowered for a 400 W sub" | **Not here.** 350 W into 4 Ω is 37.4 V; the sub's 400 W is 35.2 V. It's enough, with little headroom. |
| "Box rise means your amp only makes a third of its power" | **True for watts, false for loudness.** The voltage is what counts, and it doesn't drop at the peaks [9]. |
| "Wire to the lowest load the amp is rated for" | **Only if the dips stay above it.** Two 4 Ω subs at "2 Ω" dip to 1.58 Ω and run this amp out of current at the tuning. |
| "Underpowered amps kill subs" | **Clipped amps do,** of any size: a clipped amp delivers up to twice the average power [10]. |
| "Impedance is impedance" | **No:** the phase matters to the amp too. ±45° is the hardest angle for a linear output stage [8]. |

## Sources

1. Crown, [XLS DriveCore 2 Series datasheet](https://goknight.com/content/documentation/XLS_DC2_Datasheet_Web_050615%20(1).pdf): XLS 1002 ratings (550 W into 2 Ω, 350 W into 4 Ω, 215 W into 8 Ω; 1100 W and 700 W bridged), as maximum average power at 0.5% THD, 1 kHz.
2. Dayton Audio, [RSS315HF-4 12″ Reference HF Subwoofer](https://www.daytonaudio.com/product/121/rss315hf-4-12-reference-hf-subwoofer-4-ohm): Re 3.1 Ω, 400 W RMS, Xmax 14.3 mm (data used with Dayton Audio's permission).
3. J. Begin, [Loudspeaker impedance measurements](https://digital.livesoundint.com/december-2019/page-47), Live Sound International, December 2019: IEC 60268-5 requires the lowest impedance in the rated frequency range to be at least 80% of the rated impedance.
4. B&C Speakers, [Power handling](https://bcspeakers.com/en/products-overview/power-handling): AES2-1984 testing with 6 dB crest-factor pink noise; power from the RMS voltage and the minimum impedance in the working range; program power twice the nominal rating.
5. EAW, [Power Handling](https://eaw.com/wp-content/uploads/2020/12/Power_Handling.pdf): AES2-1984's power calculation, P = V²rms ÷ Zmin.
6. QSC, [Which power amplifier is best for my loudspeakers?](https://support.qsc.com/en_US/faq/faq-%7C-which-power-amplifier-is-best-for-my-loudspeakers): an amplifier rated at least twice the loudspeaker's continuous power rating.
7. Harman, [How much amplifier power do I need?](https://support.harmanaudio.com/dk/da/howto/how-much-amplifier-power-do-i-need-emea/000048074.html): 1.6 to 2.5 times the continuous rating, 2 to 4 times with a limiter; Crown's Gerald Stanley on continuous and peak power being nearly the same.
8. E. Benjamin, "Audio Power Amplifiers for Loudspeaker Loads", *J. Audio Eng. Soc.* 42 (9), 1994; Keith Howard's EPDR, explained in REW's [EPDR thread](https://www.avnirvana.com/threads/equivalent-peak-dissipation-resistance-epdr.6662) and, with its limits (linear output stages, amp heat, not sound), in [Stereophile and Equivalent Peak Device Resistance](https://speakermakersjourney.blogspot.com/2025/11/stereophile-and-equivalent-peak-device.html).
9. CarAudio.com, [How do I figure out the rise of my box](https://www.caraudio.com/threads/how-do-figure-out-the-rise-of-my-box.455085/): the "box rise" method (clamp meter and voltmeter) and the claim that a 1000 W amp then makes 200–350 W.
10. L. Lee, [Clip to Be Square](https://www.precisionaudioservices.com/s/Clip_To_Be_Square-Lawrence-Lee2023.pdf) (on whether underpowered amplifiers are more dangerous; clipping raises the average power); Rod Elliott, [Why do tweeters blow when amplifiers distort?](https://www.sound-au.com/tweeters.htm), Elliott Sound Products.
11. R. H. Small, "Vented-Box Loudspeaker Systems, Part I: Small-Signal Analysis", *J. Audio Eng. Soc.* 21 (5), 363–372, 1973: the vented box's two impedance peaks with the minimum between them near the box's tuning.
