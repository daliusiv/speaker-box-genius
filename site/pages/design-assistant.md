---
title: "Design assistant: find a driver and a box"
description: Say what you're building and your limits, and the design assistant tries every suitable driver in the database in sealed, ported, bandpass and transmission line boxes, graded on any amp.
path: guides/design-assistant
image: assistant-results.png
order: 2
---

# Design assistant: find a driver and a box

Not sure which driver to buy, or which box to put it in? The design assistant asks what you're building and what your limits are. It then tries every suitable driver in the database, in the boxes that suit it, and starts your project with the one you pick. New projects, and your first visit, start here; later, it's **☰ → New project…**

[Open the design assistant](/#assistant)

## Four steps

1. **What for:** a car subwoofer, a home subwoofer, a hi-fi bookshelf woofer, a tower (floor-stander), or something else. Each sets sensible starting limits.
2. **Limits:** the largest box (net inside volume), your amplifier's power and the lowest load it takes, how many drivers and what sizes, which box types, and which brands. With ported boxes, the chuffing line for port air speed too (below).
3. **Priority:** balanced, deepest, loudest (at a frequency you choose) or smallest box (that still reaches a target F3).
4. **Results:** a ranked list. **Open** starts your project with that driver and box.

![The first step: what you're building.](img/assistant-uses.png)

## What it tries

- **Sealed:** sized for a Qtc of 0.707, or as big as your limit allows.
- **Ported:** a flat alignment (QB3, or Keele for a higher Qts), capped at your limit. In a smaller box it picks the tuning with the lowest F3 that stays flat. Each port is the simplest one that fits straight inside the box and stays under the chuffing line at your power: a plain tube, then a tube with rounded (flared) ends, then a slot along a wall.
- **Transmission lines** (bookshelf, tower and "something else"): a mass-loaded line (MLTL) and a classic tapered line from the app's line presets, narrowed to your volume and tuned. Lines longer than 3 m (too long to fold into a tower) or much narrower than the cone are left out.
- **Bandpass boxes** (car, home and "something else" subwoofers): 4th order (sealed rear, ported front) and 6th order (both chambers ported), found by a search within your volume, with a plain, flared or slotted port in each chamber. A bandpass box only plays a band, so it's never offered for a speaker; its band (−3 dB from its own peak) has to reach up to at least 80 Hz to cross over to your main speakers. The same search is the **Size for a flat band** button on any bandpass design in the app.

Lines and bandpass boxes take longer to work out, so they're tried after the plain boxes, for the best drivers from those plus the drivers whose parameters suit them best. They appear when that search finishes, or earlier with **Show them now**. The **Show** switch filters the list by box type.

![Hi-fi results, best first: each card gives the F3, the output at your frequency, the box size and how it's graded.](img/assistant-results.png)

## How results are graded

Every design is simulated at your power and graded the same way the app grades your own designs, so a result looks the same once you open it.

- **✓ Within its limits:** the cone stays inside its Xmax and the port air speed stays under the chuffing line, all the way down.
- **Deep bass (amber):** a ported, passive radiator or line box only goes past Xmax **below 0.7 × its tuning**, and never past 2 × Xmax down to 20 Hz. Music has little energy that low, so this is fine for most listening, even on an ordinary stereo amplifier with no subsonic filter. The card says the power at which it would stay within Xmax there too.
- **⚠ Over a limit:** past Xmax in the bass it plays, or the port chuffs. These come after every result that's within its limits, with the power that would keep them within.
- **Slow bass:** a note when the group delay in the band (from just below F3) is longer than one cycle of the note, where bass starts to sound late or boomy. The flat alignments the assistant uses rarely get there.

On the excursion chart, the deep-bass zone is shaded, with its own 2 × Xmax line:

![A ported 8″ woofer at 50 W: it reaches Xmax just below 40 Hz, inside the shaded deep-bass zone, and stays well under 2 × Xmax.](img/deep-bass-zone.png)

A subsonic filter (on the **Signal** tab) removes the deep-bass zone altogether; see the [subsonic filter guide](/guides/subsonic-filter/).

## Towers and transmission lines

Choose **Tower / floor-stander** and lines are switched on: 60 L, 100 W and 5–10″ drivers to start with. Each line card gives its length (to fold into a tall cabinet), its tuning and whether it ends in a port or opens to the room. **Open with ported too** puts the same driver's ported box next to it, to compare.

![Tower results showing only the lines: MLTLs about 1.1–1.2 m long reaching the mid 20s Hz in 57 L.](img/assistant-lines.png)

Opened, a line is a full line design: the [transmission line guide](/guides/transmission-line/) shows how to fold it, change its stuffing and look inside it.

## Subwoofers and bandpass boxes

Tick **Bandpass (4th / 6th order)** for a car or home sub. A bandpass box plays louder than a plain box of the same size in its band, but all the sound leaves through its ports, so their air speed is usually what limits it. Each card gives both chambers, their ports and the band:

![Home subwoofer results showing only the bandpass boxes.](img/assistant-bandpass.png)

## The chuffing line

Port air speed above the **chuffing line** counts as over a limit. 17 m/s is the usual guide for a quiet hi-fi port; car SPL builds often accept 25–30 m/s for a little port noise at full power. Change it in the assistant's **Limits** step or in **Settings → Ports**: it's the same setting, used everywhere in the app. See the [port chuffing guide](/guides/port-chuffing/).

## Good to know

- Driver data comes from the manufacturers' published figures. Check the datasheet before you buy.
- The assistant starts a project; it doesn't add to the one you have. When the current project is in use, it opens in a new tab.
- The assistant remembers your last limits; it always starts at the first step.
