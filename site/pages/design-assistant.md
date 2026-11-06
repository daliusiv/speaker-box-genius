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
2. **Limits:** the largest box (net inside volume) or **My space** (below), your amplifier's power and the lowest load it takes, how many drivers and what sizes, which box types, and which brands. With ported boxes, the chuffing line for port air speed too (below).
3. **Priority:** balanced, deepest, loudest (at a frequency you choose) or smallest box (that still reaches a target F3).
4. **Results:** a ranked list. **Open** starts your project with that driver and box. **Share these results** copies a link that opens the same list (for a forum thread or a friend): it carries your limits, priority, chuffing line and the box type shown, and the list is worked out again when it's opened, so it reflects the database as it is then. If the link brings a different chuffing line, or the database has been updated since it was shared, a note above the list says so.

![The first step: what you're building.](img/assistant-uses.png)

## Fit my space

Know where the box has to go (a car boot, a shelf, beside the sofa) but not its volume? Choose **My space** in the Limits step and give the box's outside width, height and depth and the wall thickness. Each driver then gets the net volume that space holds with its own displacement, and each ported or passive radiator box with its own port or PRs taken off too, worked out exactly as the volume calculator does. Drivers whose frame (from the database's cutout size where it has one) won't fit a face of the box, or that are too deep for it, are left out. The drivers and passive radiators have to go on the box's panels together (a row on each of the six), so a small space never gets four PRs that couldn't be mounted; transmission lines have to fold into it. A ported box that fills your space can have a port as long as the space's longest inside side, and a slot as wide as the next, rather than the cube-shaped box the app assumes otherwise.

Each card says whether the box fills your space or how much of it it uses. A sealed box at Qtc 0.707, or a ported box at its flat alignment, often needs less: when filling the space reaches noticeably deeper (at least 3 % lower F3), a second result of that type fills it, at a lower Qtc or tuned for the bigger box. In the app it's named "(fills space)".

A bandpass box in a space has its driver on a divider panel across the space: the smallest one that takes the drivers, with room behind it for the magnet in the rear chamber. The two chambers share what's left after the driver, the divider and both ports.

![My space in the Limits step: the box's outside size and wall thickness.](img/assistant-space.png)

![Results that fill a 45 × 40 × 40 cm space, each port running along its longest side.](img/assistant-space-results.png) Opening a result sets the volume calculator to your space, and a box that fills it takes its volume from there, so the app shows the same net volume.

## What it tries

- **Sealed:** sized for a Qtc of 0.707, or as big as your limit allows.
- **Ported:** a flat alignment (QB3, or Keele for a higher Qts), capped at your limit. In a smaller box it picks the tuning with the lowest F3 that stays flat. Each port is the simplest one that fits straight inside the box and stays under the chuffing line at your power: a plain tube, then a tube with rounded (flared) ends, then a slot along a wall.
- **Passive radiator boxes** (on by default for home subs, bookshelf woofers and towers; tick **Passive radiator** for the others): the ported box's size and tuning with the database's passive radiators instead of a port, picked by the app's PR finder in groups of 1, 2 or 4 and tuned with added mass. A PR that runs out of travel before the driver, needs more than three times its own mass added, or won't fit a face of the box is ruled out. With no port, there's no chuffing, so a PR box often stays within its limits where the ported one can't.
- **Transmission lines** (bookshelf, tower and "something else"): a mass-loaded line (MLTL) and a classic tapered line from the app's line presets, narrowed to your volume and tuned, then folded with the app's fold tool into a cabinet no more than 125 cm tall, 50 cm deep and 45 cm wide (as few folds as it takes, the driver in the first run). Lines that won't fold into that, are longer than 3 m or are much narrower than the cone are left out.
- **Bandpass boxes** (car, home and "something else" subwoofers): 4th order (sealed rear, ported front) and 6th order (both chambers ported), found by a search within your volume, with a plain, flared or slotted port in each chamber. A bandpass box only plays a band, so it's never offered for a speaker; its band (−3 dB from its own peak) has to reach up to at least 80 Hz to cross over to your main speakers. The same search is the **Size for a flat band** button on any bandpass design in the app.

Passive radiator boxes, lines and bandpass boxes take longer to work out, so they're tried after the plain boxes, for the best drivers from those plus the drivers whose parameters suit them best (for PRs: the drivers whose ported box goes deepest). They appear when that search finishes, or earlier with **Show them now**. The **Show** switch filters the list by box type.

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

## Passive radiators

Each PR card gives the radiator, how many, the mass to add to each, and how much of its travel it uses when the driver reaches its own Xmax (under 100 %, or the PR would become the limit). **Open with ported too** puts the same driver's ported box next to it.

![Home subwoofer results showing only the passive radiator boxes.](img/assistant-pr.png)

Opened, it's a full PR design: the [passive radiator guide](/guides/passive-radiator-box/) shows how to check it and compare it with a port.

## Towers and transmission lines

Choose **Tower / floor-stander** and lines are switched on: 60 L, 100 W and 5–10″ drivers to start with. Each line card gives its length, its tuning, whether it ends in a port or opens to the room, and how it folds: the runs and the cabinet's outside height, width and depth (and when an MLTL's port is longer than the cabinet is tall, so it needs a bend). Opened, the line keeps that fold, ready for the **Build** tab's drawing and cut list. **Open with ported too** puts the same driver's ported box next to it, to compare.

![Tower results showing only the lines: MLTLs in 57 L reaching the low to mid 20s Hz, each with the cabinet it folds into.](img/assistant-lines.png)

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
