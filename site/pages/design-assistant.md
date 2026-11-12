---
title: "Design assistant: find a driver and a box"
description: Say what you're building and your limits, and the design assistant tries every suitable driver in the database in sealed, ported, passive radiator, bandpass and transmission line boxes, at your power. What it tries, how it grades, a worked home-sub run, and what its rankings do and don't mean.
path: guides/design-assistant
image: assistant-results.png
order: 2
group: start
---

# Design assistant: find a driver and a box

Not sure which driver to buy, or which box to put it in? The design assistant asks what you're building and what your limits are. Then it simulates every suitable driver in the database, in every box type that suits it, at your amplifier's power, and grades each one the way the app grades your own designs. New projects, and your first visit, start here; later, it's **☰ → New project…** or **+ New**.

[Open the design assistant](/#assistant) · [Open the worked example's results](/#assistant=zLc09C8IwFIXh_3LmO7R-QLmbi5OuLiIhNRcbyEdJ0lor_ncxuJ33LM8bM7glPMBvTFnAGKIXEMZkY7LlBUavnQ53MSD0SQeTwdcbwevlEt3kRTlw1xDG-JSknuBt0xC8DaeojYqDB-8IJtlZUq5ctqucbVA2gLt_6qVm2xH6uMgPQRbtqjtLKHWMCTeCi5M5FDWsP4tQdHpIOW7rsdl_Pl8)

## Three steps

1. **Goal:** a car subwoofer, a home subwoofer, a hi-fi bookshelf woofer, a tower (floor-stander), or something else. Each sets starting limits:

| Goal | Box (net) | Power | Driver sizes | Boxes tried |
|---|---|---|---|---|
| Car subwoofer | 45 L | 500 W, 2 Ω | 8–15″ | sealed, ported (bandpass if ticked), with the car's cabin gain |
| Home subwoofer | 80 L | 300 W, 4 Ω | 8–18″ | sealed, ported, passive radiator |
| Hi-fi / bookshelf | 20 L | 50 W, 4 Ω | 4–8″ | sealed, ported, passive radiator |
| Tower | 60 L | 100 W, 4 Ω | 5–10″ | sealed, ported, passive radiator, transmission line |
| Something else | 50 L | 200 W, 4 Ω | 4–18″ | sealed, ported |

2. **Limits:** change any of those: the largest box, or **My space** (below), the amplifier's power and the lowest load it takes, one or two drivers, which box types, which brands, and the **chuffing line** for port air speed.
3. **Results:** a ranked list, which you can re-sort (**Balanced**, **Deepest**, **Loudest** at a frequency you choose, **Smallest box** that still reaches a target F3) and filter by box type. **Open** starts a project with that driver and box; **Open with ported too** (or **sealed + ported**) adds the same driver's other boxes next to it. **Share list** copies a link that opens the same list for someone else. It carries the goal and limits, not the results: the list is worked out again when it's opened, so it reflects the database as it is then, and a note says so if the database has changed.

![The first step: what you're building.](img/assistant-uses.png)

## A worked run: the home-subwoofer defaults

Leave everything at **Home subwoofer**'s defaults and the assistant tries **760** of the database's drivers (the rest are outside the size range, aren't woofers, resonate above 60 Hz, lack the parameters or can't be wired to the amplifier's minimum load) and returns **1,486 boxes**. **451** are within their limits at 300 W, **78** more only pass Xmax in deep bass (amber, below), and **957** are over a limit. The top of the list, Balanced:

![The home-sub results, best first. The Dayton RSS315HO-44 with two RSS315-PR radiators leads: F3 24.9 Hz, 107 dB at 30 Hz, 43.5 L. Each card gives the F3, the output at your frequency, the box, the grade, and where a subsonic filter is needed.](img/assistant-results.png)

The first result is a **Dayton Audio RSS315HO-44** 12″ (its two 4 Ω coils in series, 8 Ω) [1] with two **Dayton Audio RSS315-PR** 12″ passive radiators [2], 723 g added to each, in **43.5 L** tuned to **23 Hz**. The box is the driver's QB3 alignment, sized as WinISD sizes it. The card notes that the PRs use 81 % of their 26 mm travel when the driver reaches its Xmax, a little past the 75 % where a PR's suspension starts to stiffen, so check the **PR excursion** chart once it's open. **Open with ported too** puts the same driver in the same 43.5 L box with a port; the worked example adds its sealed box (23.6 L, Qtc 0.707) from its own card further down the list:

[[Open the worked example|assistant-example]]

| At 300 W, no filter | PR, 43.5 L | Ported, 43.5 L | Sealed, 23.6 L |
|---|---|---|---|
| F3 | 24.9 Hz | **24.1 Hz** | 42.9 Hz |
| Output at 30 Hz | 106.8 dB | **107.4 dB** | 101.0 dB |
| Peak cone travel, 20 Hz up (Xmax 14 mm) | 9.5 mm | 8.7 mm | 10.3 mm |
| Peak PR travel, 20 Hz up (26 mm) | 14.0 mm | — | — |
| Port air speed | — | **37.7 m/s** | — |
| Grade | ✓ within limits from 20 Hz up | ⚠ port, safe to about 61 W | ✓ within limits down to 10 Hz |
| Rank in the list | **1st** | 530th | 3rd |

![The example's response: the ported box (orange) reaches 24.1 Hz, the PR box (green) 24.9 Hz, the sealed box (blue) 42.9 Hz.](img/assistant-example-spl.png)

![Port air speed in the ported box at 300 W: 37.7 m/s, more than twice the 17 m/s chuffing line.](img/assistant-example-port.png)

The ported box goes only 0.8 Hz deeper than the PR box, and it can't be built to play at 300 W. A 43.5 L box tuned to 23 Hz needs a long port. The biggest that fits straight inside is **5 cm** across (flared, 23.8 cm long), and at 300 W its air moves at **37.7 m/s**. That box is only quiet up to about **61 W**. The PR box has no port to chuff, which is why it ranks first and the ported box 530th. That's the trade a passive radiator makes: a hertz or so of F3 and the cost of two radiators, against a port you can't fit.

## How results are graded

Every design is simulated at your power and graded exactly as the app grades it, so a result looks the same once you open it. Both run the same limit check.

- **✓ Within its limits:** the cone stays inside its Xmax, and any port under the chuffing line, through the bass it plays.
- **Deep bass (amber):** a ported, PR or line box only goes past Xmax **below 0.7 × its tuning**, and never past **2 × Xmax** down to 20 Hz. Music has little energy that low, so this is fine for most listening without a subsonic filter. The card says the power that would keep it within Xmax there too.
- **⚠ Over a limit:** past Xmax in the bass it plays, or the port chuffs. These come after every result that's within its limits, with the power that would keep them within (the ported box above: about 61 W).
- **Slow bass:** a note when the group delay in the band (from 0.8 × F3 up) is longer than one cycle of the note, where bass starts to sound late. The third result in the example's list, a UMII10-22 PR box, gets one: 41 ms at 26 Hz, 1.06 cycles.

**Where the checks stop.** With no high-pass filter, every box is checked from **20 Hz** up, sealed or tuned, or from its own F3 if that's lower: a box built to reach 18 Hz is checked at 18 Hz. Below that, music has little energy. Any design with a high-pass filter on the **Signal** tab is checked from 10 Hz, since the filter is part of the simulation. A card within its limits also says whether the cone (or a PR) passes Xmax below the checks, and up to what power it wouldn't: "within its limits from 20 Hz up" with a subsonic-filter warning, or "down to 10 Hz" when nothing passes Xmax at all.

![The example's cone travel at 300 W: within the 14 mm Xmax from 20 Hz up in all three boxes, but below 20 Hz the PR (green) and ported (orange) cones unload and pass it.](img/assistant-example-excursion.png)

> **Common trap: "within its limits" means safe with any signal.** The grade ignores everything below 20 Hz, but your amplifier doesn't. On the excursion chart the PR box's cone reaches **21.0 mm at 15 Hz** (Xmax 14), and the card says it's only safe to 80 W down there. Turn on **Signal → High-pass filter**, 24 dB/oct at 18 Hz, and that drops to **9.1 mm**, for an F3 of 25.5 Hz instead of 24.9. The sealed box doesn't need it: its cone tops out at 11.3 mm, even at 10 Hz. See the [subsonic filter guide](/guides/subsonic-filter/).

On a box tuned higher, the deep-bass zone is shaded on the excursion chart, with its own 2 × Xmax line:

![A tuned box's deep-bass zone, shaded below 0.7 × its tuning (here 41.6 Hz for a 59.3 Hz box), with the 2 × Xmax line. The cone passes Xmax only inside it, so the box is graded deep bass, not over.](img/deep-bass-zone.png)

## How results are ranked

- **Within its limits first**, always: over-limit results sort after every one that's within.
- **Balanced** adds up each result's place in the list on three measures: F3, output at your frequency, and box size (counted at 0.6). It adds a small penalty for a response hump over 1.5 dB and a nudge down for a deep-bass grade. It doesn't use your target F3. So an 18″ ported box with an F3 of 46 Hz ranks 4th in this home-sub list, ahead of sealed boxes reaching 31 Hz, because it's loud and compact. If depth is what you're after, switch to **Deepest**.
- **Deepest**, **Loudest** and **Smallest box** sort on that one measure (Smallest only among results that reach your target F3).
- Badges mark the deepest, loudest and smallest of the top 50 that are within their limits.

## What it tries

- **Sealed:** sized for a Qtc of 0.707 as WinISD sizes it, or as big as your limit allows.
- **Ported:** the flat QB3 alignment, sized as WinISD sizes it (or the textbook one, if **Settings → Box presets** says so), capped at your limit; in a smaller box, the tuning with the lowest F3 that stays flat. The port is the simplest that fits straight inside the box and stays under the chuffing line at your power: a plain tube, then a flared tube, then a slot along a wall. If none does both, it gets the one that fits and is graded over the limit, as in the example.
- **Passive radiator boxes** (on by default for home subs, bookshelf woofers and towers; tick **Passive radiator** for the others): the ported box's size and tuning with the database's PRs instead of a port. The app's PR finder picks them, in groups of 1, 2 or 4, tuned with added mass. The finder sizes them so they don't run out of travel before the driver reaches its Xmax (from 20 Hz up), which is why a 12″ driver can end up with four 10″ PRs. A PR that runs out of travel first, or needs more than 3 × its own mass added, is ruled out. With **My space**, one that won't fit a face of the space is ruled out too. Without it, the card notes when the driver and PRs won't all fit the panels of a cube-shaped box of that volume, such as an 18″ PR on an 80 L box, so you can plan the box around them.
- **Transmission lines** (bookshelf, tower and "something else"): a mass-loaded line (MLTL) and a classic tapered line from the app's line presets. Each is narrowed to your volume, tuned, and folded with the app's fold tool into a cabinet at most 125 cm tall, 50 cm deep and 45 cm wide. Lines longer than 3 m, or narrower on average than 0.8 × the cone, are left out.
- **Bandpass boxes** (car, home and "something else" subwoofers): 4th order (sealed rear, ported front) and 6th order (both ported), found by a search within your volume. A bandpass box only plays a band, so its band (−3 dB from its own peak) has to reach at least 80 Hz to cross over to your main speakers. The same search is the **Size for a flat band** button on any bandpass design.

Passive radiators, lines and bandpass boxes take longer to work out, so they're tried after the plain boxes. PRs are tried for 20 drivers, lines for 10 and bandpass boxes for 30. Half of each set are the best drivers from the plain boxes, half the ones whose parameters suit that box best. They appear when that search finishes, or earlier with **Show them now**.

## Fit my space

Know where the box has to go (a car boot, a shelf, beside the sofa) but not its volume? In the Limits step choose **My space** and give the box's outside width, height and depth and the wall thickness. Each result then gets the net volume that space holds with its own displacement, ports and PRs taken off, exactly as the volume calculator works it out.

- **Drivers that won't fit are left out:** a frame too big for any face, or a driver too deep for the box.
- **Every part has to mount:** the drivers and PRs have to go on the panels together (a row on each of the six), and lines have to fold into the space.
- **Ports can use the space's real shape:** a port can be as long as its longest inside side, rather than the cube-shaped box assumed otherwise.

When filling the space reaches at least 3 % lower F3 than the flat alignment, a second result of that type fills it, named "(fills space)". Opening a result sets the volume calculator to your space.

![My space in the Limits step: the box's outside size and wall thickness.](img/assistant-space.png)

![Results that fill a 45 × 40 × 40 cm space, each port running along its longest side.](img/assistant-space-results.png)

## Passive radiators, lines and bandpass boxes

**PR cards** give the radiator and how many, the mass to add to each, and how much of its travel it uses when the driver reaches its own Xmax. Above 75 % the card warns that a PR's suspension starts to stiffen. The [passive radiator guide](/guides/passive-radiator-box/) shows how to check one once it's open.

![Home subwoofer results showing only the passive radiator boxes.](img/assistant-pr.png)

**Line cards** (choose **Tower** and lines are on) give the length, the tuning, whether it ends in a port or opens to the room, and the fold: the runs and the cabinet's outside height, width and depth. Opened, the line keeps that fold, ready for the **Build** tab's drawing and cut list (see the [transmission line guide](/guides/transmission-line/)).

![Tower results showing only the lines: MLTLs in 57 L reaching the low to mid 20s Hz, each with the cabinet it folds into.](img/assistant-lines.png)

**Bandpass cards** (tick **Bandpass (4th / 6th order)** for a car or home sub) give both chambers, their ports and the band. All the sound leaves through the ports, so their air speed is usually what limits a bandpass box.

![Home subwoofer results showing only the bandpass boxes.](img/assistant-bandpass.png)

## Assistant myths, checked

**"The top result is the best driver."** It's the best by the measure you picked, among those within their limits at your power. Balanced is a sum of ranks, not your target. Set the power to what your amplifier really gives, and re-sort if depth or size matters more. *Proof: on the same list, Balanced puts the RSS315HO-44 PR box first, Deepest the same RSS315HO-44 PR box (F3 24.9 Hz), and Loudest an 18 Sound 15NTLS3500 ported in 80 L (110.0 dB at 30 Hz). Smallest box puts a Peerless STW-350F188PR01-04 in 31.7 L, but with a SEAS SL26R carrying 640 g, and its card warns the driver and radiator won't all fit a cube that size.*

**"A ported box always beats a PR box."** In the same box and tuning the port goes a little deeper here (24.1 Hz against 24.9 Hz). But only the PR box can play at 300 W, because the port that fits a 43.5 L box at 23 Hz chuffs above about 61 W. *Proof: the response and Port speed charts of the worked example.*

**"Within its limits means I don't need a subsonic filter."** The grade stops at 20 Hz. Below that the example's PR box reaches 21.0 mm at 15 Hz, past its 14 mm Xmax, and its card says so. *Proof: the card's "from 20 Hz up" line, the excursion chart, then Signal → High-pass filter.*

**"Bigger power, louder results."** Only until a limit: at the default 300 W, 957 of the 1,486 home-sub boxes are over one. The card always says what sets its output (the amplifier, the cone, the port) and the power that keeps it within. *Proof: each card's limit line; Max SPL once opened.*

## Good to know

- **The chuffing line** (17 m/s by default, peak) is the same setting as **Settings → Ports**. Car SPL builds often accept 25–30 m/s; see the [port chuffing guide](/guides/port-chuffing/).
- **DVC drivers are wired for your amplifier.** A dual voice coil driver's coils are wired to suit the lowest load you gave, and the card says how: "Coils in series: 8 Ω" above.
- **Driver data comes from the manufacturers' published figures** [1][2]. Check the datasheet before you buy, and [measure your driver](/guides/thiele-small-parameters/) if the box matters.
- **The assistant starts a project; it doesn't add to the one you have.** When the current project is in use, it opens in a new tab.
- **It remembers your last limits** and always starts at the first step.

## Sources

1. Dayton Audio, [RSS315HO-44 12″ Reference HO DVC subwoofer](https://www.daytonaudio.com/product/125/rss315ho-44-12-reference-ho-dvc-subwoofer-4-ohms-per-coil) (T/S parameters used with Dayton Audio's permission).
2. Dayton Audio, [RSS315-PR 12″ passive radiator](https://www.daytonaudio.com/product/1426/rss315-pr-12-aluminum-cone-passive-radiator): Mms 300 g, Xmax 26 mm (used with Dayton Audio's permission).
