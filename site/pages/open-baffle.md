---
title: "Open baffle speakers: board size, woofer choice and what the EQ really costs"
description: Why an open baffle loses bass, how big the board needs to be, which woofers work with and without DSP, and which forum rules hold up, with numbers from a 15-inch Dayton RSS390HF-4 on a 50 × 90 cm board at 100 W.
path: guides/open-baffle
image: chart:ob-example/spl
art: A woofer on a free-standing board, its rear wave curling round the board's edges to meet the front.
order: 30
group: sealed
---

# Open baffle speakers: board size, woofer choice and what the EQ really costs

Bolt a woofer to a plain board and the back of the cone pushes air out of step with the front. Below a certain frequency that rear wave slips round the edges and cancels the bass, so an open baffle (OB) gives up bass a box never loses, and most forum rules about it are half right. This guide puts one realistic build through the same engine the app runs: a 15-inch Dayton Audio RSS390HF-4 on a 50 × 90 cm board at 100 W. It shows what the board, the driver, the frame and the EQ each do, and checks a dozen popular claims against the charts.

[[Open the worked example|ob-example]]

> **Calculator:** the [open baffle calculator](/calculators/open-baffle/) gives a board's dipole peak and null, the bass it loses against a wall and the EQ that wins it back, or the board for the peak you want.

## The short answer

- **An open baffle is a dipole.** Below its peak the bass falls 6 dB per octave on top of the driver's own roll-off. On this board it's {{num:ob-example/1/rel@40}} dB at 40 Hz against a free-standing cone, and {{diff:ob-example/1/ob-example/3/spl@40}} dB below the same driver in a wall.
- **Width sets the bass, height barely does.** Going from 30 to 70 cm wide buys {{diff:ob-widths/3/1/rel@40}} dB at 40 Hz; going from 90 to 120 cm tall buys {{diff:ob-heights/3/2/rel@40}} dB.
- **EQ wins the response back, not the output.** The app's Dipole EQ takes F3 from {{num:ob-example/1/f3}} Hz to {{num:ob-example/2/f3}} Hz, but the most the board can play at 30 Hz is {{num:ob-example/1/max@30}} dB either way: {{diff:ob-example/3/1/max@30}} dB less than the same cone in a wall.
- **The famous "Qts above 0.7" rule is too weak to matter.** A Qts 0.70 woofer has no more bass on this board than the Qts 0.43 RSS390HF-4. It takes a Qts near 1 before the driver's own hump makes up a few dB.
- **Frames trade bass for a resonance.** A 30 cm deep U-frame adds {{diff:ob-frames/2/1/rel@40}} dB at 40 Hz and a duct resonance at {{num:ob-frames/2/obq}} Hz that you must cross over below.

## The worked example

- **Driver:** one Dayton Audio RSS390HF-4 (Fs {{num:ob-example/1/fs}} Hz, Qts {{num:ob-example/1/qts}}, Sd 830 cm², Xmax 14 mm, 500 W). It's long-throw and low-Qts, the kind of woofer DSP open-baffle builds use [1].
- **Board:** a flat 50 × 90 cm panel, 18 mm thick, the driver centred across and 35 cm up. That's 20 × 35 in, inside the 17–22 in wide, 20–35 in tall range most DIY boards fall in.
- **Drive:** 100 W, behind a 24 dB/oct Linkwitz–Riley subsonic filter at 20 Hz.

Three designs share the charts: the **bare board** ({{color:ob-example/1}}), the board with the app's **Dipole EQ** ({{color:ob-example/2}}), and the **same driver in a wall** ({{color:ob-example/3}}), an infinite baffle with its back open to an attic. The wall is our yardstick: it's what the cone can do when its rear wave never reaches you.

| Design | F3 | Level at 40 Hz | Peak excursion at 100 W | Max SPL at 30 Hz |
|---|---|---|---|---|
| Bare board | {{num:ob-example/1/f3}} Hz | {{num:ob-example/1/spl@40}} dB | {{num:ob-example/1/x}} mm at {{num:ob-example/1/xf}} Hz | {{num:ob-example/1/max@30}} dB |
| Board + Dipole EQ | {{num:ob-example/2/f3}} Hz | {{num:ob-example/2/spl@40}} dB | {{num:ob-example/2/x}} mm at {{num:ob-example/2/xf}} Hz | {{num:ob-example/2/max@30}} dB |
| Same driver in a wall | {{num:ob-example/3/f3}} Hz | {{num:ob-example/3/spl@40}} dB | {{num:ob-example/3/x}} mm at {{num:ob-example/3/xf}} Hz | {{num:ob-example/3/max@30}} dB |

The open baffle's F3 is measured from the level the same cone would give standing free in a field with no board at all, which is how the app rates an open baffle; the wall's is measured from its own (6 dB higher) level. Compare the SPL columns, not the F3s, when you weigh the board against the wall.

![SPL at 100 W, 1 m. The bare board ({{color:ob-example/1}}) climbs 6 dB per octave towards its dipole peak at {{num:ob-example/1/risef}} Hz, then dips. The Dipole EQ ({{color:ob-example/2}}) lifts the bass and flattens the peak. The same driver in a wall ({{color:ob-example/3}}) is {{diff:ob-example/3/1/spl@40}} dB louder than the bare board at 40 Hz.](chart:ob-example/spl)

Look at the gap between the bare board and the wall. At 80 Hz it's {{diff:ob-example/3/1/spl@80}} dB; at 40 Hz, an octave down, it has grown to {{diff:ob-example/3/1/spl@40}} dB. That's the dipole slope: about 6 dB more lost for every octave you go down. Above the peak the curves cross, and the board briefly plays louder than the wall.

## Why the bass cancels

Picture the cone from above. When it moves forward it pushes air towards you; at the same moment its back pulls air in. The two waves start out of phase. At high frequencies the board is big compared with a wavelength and the two waves mostly go their own ways. At low frequencies the wavelength dwarfs the board, the rear wave bends round the edges with almost no delay, and it cancels the front.

![Left: the rear wave bends round both edges of the board to meet the front wave, out of phase. Right: the result in the room. A box radiates bass equally in all directions; an open baffle radiates a figure of eight, 3 dB down at 45° and silent at 90° to the sides.](img/open-baffle-path.svg)

How much cancels depends on how far the rear wave has to travel compared with a wavelength. Call that distance D. Double D and you get 6 dB more bass, at every frequency below the peak. Halve the frequency and the wave is twice as long, so you lose 6 dB. That's the whole 6 dB/octave story [2].

> **Common trap:** measuring D as "front, to the edge, to the back", which here is half the width twice plus the board: 51.8 cm. The app puts this board's real bass path at **{{num:ob-example/1/obd}} cm**, because the rear wave reaches you round all four edges at once, and each edge passes some of it on to the others. Tools that use the long path predict 1.5–5 dB more bass than a real board gives.

The app works this out by treating each edge as a row of small sources and summing every bounce between edges, the method of Svensson, Fred and Vanderkooy [3]. On 23 thin boards it lands within 0.1 dB of a full boundary-element solution, and on nine thick ones within 0.13 dB in the bass (see [Why the app disagrees with simpler tools](#why-the-app-disagrees-with-simpler-tools)).

## The dipole peak: higher and louder than the textbook

The textbook dipole is two point sources D apart. It puts the peak at c/2D, where the rear wave arrives half a wavelength late and adds to the front: {{num:ob-example/1/c2d}} Hz for this board's D. It says the peak is +6 dB, and that the dipole matches a plain monopole at c/6D, {{num:ob-example/1/c6d}} Hz [2][4].

A real board does three things the two points don't:

| | Point dipole | This board, from the app |
|---|---|---|
| Dipole peak | c/2D = {{num:ob-example/1/c2d}} Hz | **{{num:ob-example/1/obpeak}} Hz** |
| Peak level, against a free monopole | +6 dB | **+{{num:ob-example/1/rise}} dB** |
| Matches a free monopole | c/6D = {{num:ob-example/1/c6d}} Hz | **{{num:ob-example/1/cross}} Hz** |
| First null | c/D | {{num:ob-example/1/obnull}} Hz |

The extra 5 dB at the peak is the board acting as a baffle for the front wave: above the peak it settles back about 6 dB above a free cone, the same baffle step a box has [5]. So the peak a Dipole EQ has to tame is bigger than the old rule suggests, and the shelf below it has to start from higher up.

> **Rule of thumb:** cross the woofer over at no more than about half the dipole peak, here below about 180 Hz. Under that the board behaves like a clean dipole; above it you're into the peak and the null.

## Width matters, height barely does

The bass path is set mostly by the shortest way round, which on a tall board is across the width. Here are three widths, all 90 cm tall:

| Width | Path D | Dipole peak | Level at 40 Hz | F3 |
|---|---|---|---|---|
| 30 cm | {{num:ob-widths/1/obd}} cm | {{num:ob-widths/1/obpeak}} Hz | {{num:ob-widths/1/rel@40}} dB | {{num:ob-widths/1/f3}} Hz |
| 50 cm | {{num:ob-widths/2/obd}} cm | {{num:ob-widths/2/obpeak}} Hz | {{num:ob-widths/2/rel@40}} dB | {{num:ob-widths/2/f3}} Hz |
| 70 cm | {{num:ob-widths/3/obd}} cm | {{num:ob-widths/3/obpeak}} Hz | {{num:ob-widths/3/rel@40}} dB | {{num:ob-widths/3/f3}} Hz |

And three heights, all 50 cm wide:

| Height | Path D | Dipole peak | Level at 40 Hz |
|---|---|---|---|
| 60 cm | {{num:ob-heights/1/obd}} cm | {{num:ob-heights/1/obpeak}} Hz | {{num:ob-heights/1/rel@40}} dB |
| 90 cm | {{num:ob-heights/2/obd}} cm | {{num:ob-heights/2/obpeak}} Hz | {{num:ob-heights/2/rel@40}} dB |
| 120 cm | {{num:ob-heights/3/obd}} cm | {{num:ob-heights/3/obpeak}} Hz | {{num:ob-heights/3/rel@40}} dB |

![Relative response of three widths (all 90 cm tall) and three heights (all 50 cm wide). Widening the board from 30 cm ({{color:ob-widths/1}}) to 70 cm ({{color:ob-widths/3}}) moves the peak down and lifts the whole bass. Stretching it from 90 to 120 cm tall ({{color:ob-heights/2}} to {{color:ob-heights/3}}) barely moves the bass.](chart:ob-widths/response|ob-heights/response "Width: 30, 50, 70 cm|Height: 60, 90, 120 cm")

Look at the left chart below 100 Hz: the three widths run as parallel lines, each 6 dB/octave, stacked by how long their path is. The 70 cm board's path is about twice the 30 cm board's ({{num:ob-widths/3/obd}} cm against {{num:ob-widths/1/obd}} cm), and the gap between them at 40 Hz is {{diff:ob-widths/3/1/rel@40}} dB: the 6 dB that doubling D predicts. On the right, the 90 and 120 cm curves sit almost on top of each other. Once a board is taller than it is wide, the extra height adds little.

> **Rule of thumb:** spend wood on width first. Height pays until the board is a little taller than it is wide; past that it's furniture.

## Where you put the driver

Centring the driver puts all four edges at nearly the same distance, and their contributions line up into one sharp peak and a deep null. Move it towards a corner and the edges arrive at different times. The peak spreads into a broad hump, at a cost in bass.

| Driver position on 50 × 90 cm | Path D | Peak above a free cone | First null | Level at 40 Hz |
|---|---|---|---|---|
| Centred (25, 45 cm) | {{num:ob-position/1/obd}} cm | +{{num:ob-position/1/rise}} dB | {{num:ob-position/1/obnull}} Hz | {{num:ob-position/1/rel@40}} dB |
| Near a corner (15, 20 cm) | {{num:ob-position/2/obd}} cm | +{{num:ob-position/2/rise}} dB | {{num:ob-position/2/obnull}} Hz | {{num:ob-position/2/rel@40}} dB |

![Relative response, centred ({{color:ob-position/1}}) against near a corner ({{color:ob-position/2}}). The corner position's peak is {{diff:ob-position/1/2/rise}} dB lower and broader, and its bass {{diff:ob-position/1/2/rel@40}} dB lower at 40 Hz.](chart:ob-position/response)

For a woofer crossed over well below the peak, the smoother top end doesn't buy you much: you pay {{diff:ob-position/1/2/rel@40}} dB of bass for a peak you'd have filtered out anyway. An off-centre position earns its keep on a midrange board, where the region round the peak is inside the band you listen to.

## What the Dipole EQ does, and what it costs

The app's Dipole EQ (**Boxes → Open baffle → Dipole EQ**) fits two filters to the gap between the board and the same driver in a wall, the same pair Linkwitz uses [6]:

- a **6 dB/oct low shelf** that rises below the peak, matching the dipole's slope: here **+{{num:ob-example/2/shelf}} dB** centred at {{num:ob-example/2/shelff}} Hz;
- a **peaking cut** at the dipole peak: **{{num:ob-example/2/cut}} dB** at {{num:ob-example/2/cutf}} Hz, Q {{num:ob-example/2/cutq}}.

The fit wanted a 12 dB shelf. At 100 W that would drive the cone past Xmax, so the app turned it down until the excursion stayed inside it. That one constraint shapes every DSP open baffle.

![Cone excursion at 100 W. The bare board ({{color:ob-example/1}}) and the same driver in a wall ({{color:ob-example/3}}) are the same curve: the board doesn't change what the cone does. The Dipole EQ ({{color:ob-example/2}}) takes it to {{num:ob-example/2/x}} mm at {{num:ob-example/2/xf}} Hz, right at the 14 mm Xmax line.](chart:ob-example/excursion)

Look at the bare board and the wall on the excursion chart: one line. The cone moves exactly as far on the board as in the wall, for the same signal. The board only decides how much of that movement you hear. Every dB the shelf gives back costs the same dB in excursion, and with the shelf the cone hits its 14 mm limit at {{num:ob-example/2/xmaxW}} W instead of {{num:ob-example/1/xmaxW}} W.

![Maximum SPL, the bare board ({{color:ob-example/1}}) against the same driver in a wall ({{color:ob-example/3}}). Both are set by Xmax in the deep bass and by the driver's 500 W rating higher up; the board's ceiling is {{diff:ob-example/3/1/max@30}} dB lower at 30 Hz.](chart:ob-example:1,3/maxspl)

The **Max SPL** chart is the honest picture of an open baffle. With the cone at Xmax, the board plays {{num:ob-example/1/max@30}} dB at 30 Hz and the wall {{num:ob-example/3/max@30}} dB. No EQ moves that ceiling: the Dipole EQ only decides how hard you push towards it. Each doubling of cone area buys 6 dB, so closing a gap of {{diff:ob-example/3/1/max@30}} dB at 30 Hz takes three doublings: eight of these drivers on boards to match one in a wall. That's why open-baffle bass towers carry two or four 15s per side.

> **Common trap:** EQ'ing a bare board flat without a subsonic filter. Below the dipole peak the shelf keeps rising as the frequency drops, so the excursion runs away exactly where there's least music. Set **Signal → High-pass** first (here a 24 dB/oct Linkwitz–Riley at 20 Hz), then press **Dipole EQ**: the shelf is fitted with the filter in place.

## Picking the woofer: Qts, Fs and Xmax

The old passive recipe says: use a high-Qts woofer and let its resonant hump fill in what the dipole loses. Here are three real drivers on the same 50 × 90 cm board, no EQ:

| Driver | Qts | Fs | Level at 40 Hz | F3 | Reaches Xmax at |
|---|---|---|---|---|---|
| Dayton Audio RSS390HF-4 (15″) | {{num:ob-qts-low/1/qts}} | {{num:ob-qts-low/1/fs}} Hz | {{num:ob-qts-low/1/rel@40}} dB | {{num:ob-qts-low/1/f3}} Hz | {{num:ob-qts-low/1/xmaxW}} W |
| Peerless FSL-1520R02-08 (15″) | {{num:ob-qts-mid/1/qts}} | {{num:ob-qts-mid/1/fs}} Hz | {{num:ob-qts-mid/1/rel@40}} dB | {{num:ob-qts-mid/1/f3}} Hz | {{num:ob-qts-mid/1/xmaxW}} W |
| Redcatt Twiggy12 (12″) | {{num:ob-qts-high/1/qts}} | {{num:ob-qts-high/1/fs}} Hz | {{num:ob-qts-high/1/rel@40}} dB | {{num:ob-qts-high/1/f3}} Hz | {{num:ob-qts-high/1/xmaxW}} W |

![Relative response of three drivers on the same 50 × 90 cm board, no EQ: the RSS390HF-4, Qts 0.43 ({{color:ob-qts-low+ob-qts-mid+ob-qts-high/1}}), the FSL-1520R02-08, Qts 0.70 ({{color:ob-qts-low+ob-qts-mid+ob-qts-high/2}}), and the Twiggy12, Qts 1.08 ({{color:ob-qts-low+ob-qts-mid+ob-qts-high/3}}). Only the Twiggy12's hump fills in some of the dipole's loss.](chart:ob-qts-low+ob-qts-mid+ob-qts-high/response)

A Qts of 0.70 is a Butterworth alignment: maximally flat, with no hump at all [7]. On a board it adds nothing, and this one's higher Fs costs it bass against the low-Qts RSS390HF-4. It's the Twiggy12, at Qts {{num:ob-qts-high/1/qts}} with Fs {{num:ob-qts-high/1/fs}} Hz, that wins {{diff:ob-qts-high/1/ob-qts-low/1/rel@40}} dB at 40 Hz over the RSS390HF-4. The hump has to sit low, too: a high-Qts driver with Fs in the 40s puts its help above the bass you wanted.

The catch is the last column. The passive drivers reach Xmax at tens of watts; the long-throw RSS390HF-4 takes {{num:ob-qts-low/1/xmaxW}} W on the bare board. A passive open baffle is a low-power, high-sensitivity design. If you want level, you want Xmax and cone area, and then you'll want DSP to shape the response.

> **Rule of thumb:** with DSP, pick for Sd × Xmax and a low Fs, and let the EQ do the shaping. Without DSP, look for Qts around 1 or more and Fs in the 20s or low 30s, and keep the power modest.

The driver browser has both: **Driver → Browse drivers → Filters → Suits → Open baffle (passive)** (its own level at 40 Hz, from Fs and Qts, −2 dB or better: the Twiggy12 passes, the FSL-1520R02-08 doesn't) and **Open baffle with DSP** (Qts 0.35 or more, Xmax 8 mm or more, Fs 45 Hz or less).

## Frames: more bass, plus a resonance

Fold the board's edges back into side walls and the rear wave has further to go round. A **U-frame** has the board at the front and the frame open at the back; an **H-frame** has the board half-way, open both ways [8].

![Three open baffles seen from above: a flat board, a U-frame with the board at the front and a duct behind it, and an H-frame with the board in the middle and a duct on each side. The walls make the rear wave's path longer.](img/open-baffle-frames.svg)

| Frame (50 × 90 cm outside) | Path D | Level at 40 Hz | Quarter-wave | Peak above a free cone |
|---|---|---|---|---|
| Flat board | {{num:ob-frames/1/obd}} cm | {{num:ob-frames/1/rel@40}} dB | none | +{{num:ob-frames/1/rise}} dB at {{num:ob-frames/1/risef}} Hz |
| U-frame, 30 cm deep | {{num:ob-frames/2/obd}} cm | {{num:ob-frames/2/rel@40}} dB | {{num:ob-frames/2/obq}} Hz | +{{num:ob-frames/2/rise}} dB at {{num:ob-frames/2/risef}} Hz |
| H-frame, 40 cm deep | {{num:ob-frames/3/obd}} cm | {{num:ob-frames/3/rel@40}} dB | {{num:ob-frames/3/obq}} Hz | +{{num:ob-frames/3/rise}} dB at {{num:ob-frames/3/risef}} Hz |

![Relative response: flat board ({{color:ob-frames/1}}), 30 cm U-frame ({{color:ob-frames/2}}) and 40 cm H-frame ({{color:ob-frames/3}}). Both frames give about 5 dB more bass, then a tall peak where their duct resonates.](chart:ob-frames/response)

The walls lengthen the path by more than half, and that buys {{diff:ob-frames/2/1/rel@40}} dB at 40 Hz for the U-frame. The price is the duct the walls make: it resonates where it's a quarter-wavelength long, and on the chart that shows up as a peak {{num:ob-frames/2/rise}} dB high at {{num:ob-frames/2/risef}} Hz for the U-frame. Cross a frame over below its quarter-wave, as well as below half its dipole peak. Stuffing the duct lightly is the usual way to tame it; the app doesn't model a damped frame yet.

## What the board doesn't change

The board changes what you hear, not what the driver does. Its impedance, and so the load your amplifier sees, is the same as in the wall, and so is its group delay in the bass.

![Impedance and group delay, the bare board ({{color:ob-example/1}}) against the same driver in a wall ({{color:ob-example/3}}). The impedance curves lie on top of each other, peaking at the driver's Fs of {{num:ob-example/1/fs}} Hz. The group delays agree within a fraction of a millisecond below 100 Hz: {{num:ob-example/1/gd@30}} ms and {{num:ob-example/3/gd@30}} ms at 30 Hz, most of it from the 20 Hz subsonic filter.](chart:ob-example:1,3/impedance|ob-example:1,3/delay "Impedance|Group delay")

That matters for two forum claims. A flat board doesn't shift Fs, and open-baffle bass isn't "faster" in the group-delay sense: a dipole's cancellation is a 90° phase lead that barely varies with frequency in the bass, so it adds next to no delay. What a dipole does change is how the room is excited, which no on-axis chart shows.

## Why the app disagrees with simpler tools

If you've modelled your board in a spreadsheet, Hornresp or The Edge, expect the app to show less bass and a higher, louder peak. Simpler tools use a fixed path rule or only the first one or two bounces between edges. The cancellation series alternates in sign, so stopping early lands well off at low frequencies. The app sums every order until the next term is negligible. It matches boundary-element solutions of 23 thin boards within 0.1 dB and of nine thick boards within 0.13 dB in the bass, and frames are checked against seven more. The details and every comparison are on the [validation page](/validation/) and in the [validation notes](https://github.com/daliusiv/speaker-box-genius/blob/main/docs/validation.md#open-baffle).

What hasn't been checked: any of it against a measured board, a round board, or H-frames' peaks, which the app puts 3–8 % high.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "Open baffles can't make real bass" | **They can, but each dB below 50 Hz costs cone area.** With the Dipole EQ, F3 is {{num:ob-example/2/f3}} Hz. The board's maximum at 30 Hz is {{diff:ob-example/3/1/max@30}} dB below the same driver in a wall, so serious OB bass means several large woofers. Max SPL chart above. |
| "The dipole peak is at c/2D, +6 dB" | **Lower and louder on a real board.** {{num:ob-example/1/obpeak}} Hz, not {{num:ob-example/1/c2d}} Hz, and +{{num:ob-example/1/rise}} dB above a free cone, because the board baffles the front wave too. |
| "D is front → edge → back" | **Too long.** 51.8 cm by that rule; the board's real bass path is {{num:ob-example/1/obd}} cm. |
| "Below the peak it falls 6 dB/oct, 18 dB/oct below Fs" | **True.** The gap to the wall grows from {{diff:ob-example/3/1/spl@80}} dB at 80 Hz to {{diff:ob-example/3/1/spl@40}} dB at 40 Hz. Below Fs the driver's own 12 dB/oct adds on [6]. |
| "OB woofers must have Qts above 0.7" | **No, and 0.7 isn't enough anyway.** Qts 0.70 gives {{num:ob-qts-mid/1/rel@40}} dB at 40 Hz, the Qts 0.43 RSS390HF-4 {{num:ob-qts-low/1/rel@40}} dB. A hump needs Qts near 1 and a low Fs. With DSP, low Qts is fine. |
| "Higher Qts means more control" | **The reverse.** Qts is damping in reverse: higher Qts, less damping, more ring at Fs [7]. |
| "Deep OB bass needs a huge amplifier" | **Depends on the driver's Xmax.** The RSS390HF-4 reaches Xmax at 30 Hz with {{num:ob-example/1/volts@30}} V across it ({{num:ob-example/1/vw@30}} W as amplifiers are rated), and above about 35 Hz its 500 W rating is the limit. The Peerless reaches Xmax at {{num:ob-qts-mid/1/xmaxW}} W. Max SPL chart, Volts view. |
| "Open baffle bass is faster" | **Not on group delay.** At 30 Hz the bare board has {{num:ob-example/1/gd@30}} ms, the same driver in a wall {{num:ob-example/3/gd@30}} ms (Group delay chart above). What does differ is the room: a dipole excites fewer room modes [9]. |
| "The board changes the driver's Fs" | **Not a flat board.** The impedance peak stays at the driver's {{num:ob-example/1/fs}} Hz, on the board and in the wall (Impedance chart above). Fs is measured in free air, which is what a flat board gives it. |
| "Dipoles have constant directivity" | **Only well below the peak.** The figure of eight holds while D is small against a wavelength, roughly below half the peak; above the first null the pattern breaks into lobes [2][4]. The app shows on-axis response only. |
| "A dipole puts 4.8 dB less energy into the room" | **True, at the same on-axis level.** A figure of eight radiates a third of a monopole's power [9]. Not modelled in the app. |
| "Avoid round baffles" | **True.** With the driver at the centre every edge path is equal and the ripples stack, up to ±5 dB on Olson's measurements [10]. The app models rectangular boards only. |
| "Absorb the rear wave" | **Debated; Linkwitz says no.** He kept the wall behind diffusive and the speakers at least 1 m from it, so the rear wave arrives late and diffuse rather than being thrown away [11]. The app doesn't model the room. |
| "Open baffles always sound more accurate than boxes" | **No.** On axis the bare board has a +{{num:ob-example/1/rise}} dB peak and a null at {{num:ob-example/1/obnull}} Hz; without EQ it's far from flat. A good box beats a careless board. |

## What the app can't tell you

- **The room.** A dipole's null to the sides and its rear wave make placement matter more than with a box. Start at least 1 m from the wall behind and aim the side nulls at the side walls [11].
- **Midrange and tweeter boards.** The same physics applies, but past the woofer's band the response depends on off-axis lobes the app doesn't draw. For a midrange, a narrow board pushes the peak above the band; the [calculator's](/calculators/open-baffle/) **Board for a peak** gives the board for the peak you want.
- **Time alignment.** Measure it: flip one driver's polarity, adjust the DSP delay for the deepest null at the crossover, then flip it back.

## Doing it in the app

1. **Driver tab:** pick the driver. **Driver → Browse drivers → Filters → Suits → Open baffle with DSP** lists woofers with the travel for EQ.
2. **Boxes → + Box → Open baffle.** Choose the **Frame** (Flat board, H-frame or U-frame), then **Width**, **Height**, **From left**, **From bottom**, **Thickness** and, for frames, **Depth**. The card shows **Path D**, **Dipole peak**, **First null** and, for frames, **Quarter-wave**.
3. **Boxes → + Box → Infinite baffle** with **Rear space → Open** gives the same driver in a wall for comparison.
4. **Signal → High-pass:** Filter **Linkwitz-Riley**, Slope 24 dB/oct, 20 Hz.
5. Set the power on the **Power bar**.
6. **Boxes → Open baffle → Dipole EQ** adds the shelf and the cut to **Signal → EQ**, fitted to the limits. If the board is already past Xmax without EQ, the note says so and gives a power to try.
7. Read the **SPL**, **Cone excursion** and **Max SPL** charts; charts run to 1 kHz while an open baffle is on so you can see the peak and null.

## Sources

1. Dayton Audio, [RSS390HF-4 15″ Reference HF Subwoofer](https://www.daytonaudio.com/product/126/rss390hf-4-15-reference-hf-subwoofer-4-ohm), product page and specifications.
2. S. Linkwitz, [Design models: open-baffle loudspeakers](https://linkwitzlab.com/models.htm), Linkwitz Lab: two point sources, the 6 dB/oct roll-off, the dipole peak and nulls.
3. U. P. Svensson, R. I. Fred and J. Vanderkooy, "An analytic secondary source model of edge diffraction impulse responses", J. Acoust. Soc. Am. 106 (5), 1999, pp. 2331–2344.
4. S. Linkwitz, [Electrical, mechanical and acoustic filters](https://www.LinkwitzLab.com/AES-Chile'09/Chile-el-mech-acoust%20filters.pdf) (AES Chile, 2009): the dipole equals a monopole where D = λ/6.
5. Speaker Box Genius, [Baffle step: why your speaker sounds thin](/guides/baffle-step/).
6. S. Linkwitz, [Dipole woofer](https://www.linkwitzlab.com/woofer.htm) and [Active filters](https://www.linkwitzlab.com/filters.htm), Linkwitz Lab: the 6 dB/oct equalizer and the notch at the peak.
7. R. H. Small, "Closed-Box Loudspeaker Systems Part I: Analysis", J. Audio Eng. Soc. 20 (10), 1972; V. Dickason, *The Loudspeaker Design Cookbook*, 7th ed., Audio Amateur Press, 2006.
8. S. Linkwitz, [H-frame and U-frame open-baffle woofers](https://linkwitzlab.com/frontiers.htm), Linkwitz Lab, Issues in loudspeaker design (section L).
9. S. Linkwitz, ["Investigation of Sound Quality Differences between Monopolar and Dipolar Woofers in Small Rooms"](https://linkwitzlab.com/AES'98/aes-98.htm), AES 105th Convention, 1998: directivity factor 3 for a dipole, 4.8 dB; and [Room acoustics](https://linkwitzlab.com/rooms.htm).
10. H. F. Olson, "Direct Radiator Loudspeaker Enclosures", Audio Engineering, 1951; reprinted J. Audio Eng. Soc. 17 (1), 1969, pp. 22–29.
11. S. Linkwitz, [The listening room](https://linkwitzlab.com/listening_room.htm), Linkwitz Lab: a diffusive wall behind dipoles.
