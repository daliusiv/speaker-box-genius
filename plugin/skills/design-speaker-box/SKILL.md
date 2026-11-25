---
name: design-speaker-box
description: Design or check a loudspeaker enclosure (sealed, ported, passive radiator, bandpass, transmission line, open baffle) with the Speaker Box Genius tools. Use when someone asks what box suits a driver, how deep a box will play, whether a design will bottom out or chuff, which passive radiator to use, a box's net volume, or what a Speaker Box Genius share link shows.
---

# Design a speaker box with Speaker Box Genius

The `speaker-box-genius` MCP tools run Speaker Box Genius's own simulator on this machine. Its numbers match the web app at speakerboxgenius.com, which is checked against WinISD, Hornresp and SPICE (https://speakerboxgenius.com/validation/). Use the tools for every number you give: don't estimate box sizes, tuning or limits yourself.

## Workflow

1. **Find the driver.** `search_drivers` by brand and model, or by size, Fs, Qts and Xmax when the user only knows what they want. If the user gives T/S values instead, pass them as the driver (`fs`, `qts` or `qes` + `qms`, `vas_l`, `re`, plus `sd_cm2`, `xmax_mm`, `pe_w` when known: limits need Xmax and power).
2. **Start from sized boxes.** `suggest_boxes` gives the app's sealed (Qtc 0.707), ported and passive radiator alignments, judged at the driver's power rating.
3. **Fit the user's goal.** `simulate` the user's own volumes and tunings, or variations on the suggestions (up to 8 boxes in one call, so they can be compared). Use `find_passive_radiators` to pick a PR for a volume and tuning.
4. **Net volume.** If the user gives outside sizes, `box_volume` works out the net volume (walls, drivers, ports, bracing); use its `net_l` as `vb_l`.
5. **Links from others.** `read_share_link` opens a Speaker Box Genius link someone posted, so you can explain or change that design.

## Reporting

- Give F3, tuning (Fb) or Qtc, the box volume, and **what limits it first** at the drive asked: cone excursion vs Xmax, PR excursion, port air speed (about 17 m/s is the usual line for a quiet port), or power. Say at what drive the numbers are: the default is 1 W like WinISD, so check limits at the user's real power (`drive: "rated"` or `{ "watts": … }`).
- Always give the `share_link` for the design you recommend, so the user can open it in the app and see the charts.
- Units: SPL dB at 1 m, excursion mm one way peak, air speed m/s peak, volumes litres.
- Be clear about what the simulation doesn't cover: room gain (unless a room setting is used), a real driver's sample-to-sample spread, and build quality. Suggest measuring the finished box.

## Data

Driver values come from manufacturers' datasheets (most with permission) and the open driver-base project. Most of the database is CC BY-NC-SA 4.0 and a few brands are under their own terms (`get_driver` says which), so don't copy it out in bulk.
