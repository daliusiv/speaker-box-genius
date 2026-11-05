# Speaker Box Genius

**A free, browser-based loudspeaker enclosure simulator: a modern WinISD.**

Design sealed, ported, passive radiator, bandpass and transmission line boxes for any driver, see straight away whether the cone, the passive radiators or the port run out of headroom, then share the live design with a link instead of a pile of screenshots.

**Try it: https://speakerboxgenius.com**

Everything runs in your browser. There's nothing to install, no account and no server, and it keeps working offline. It works on phones as well as computers.

> 🚧 **Early preview.** It's usable and tested, but still changing quickly. The plan lives in [`docs/build-plan.md`](docs/build-plan.md).

## Features

### Box types

- **Sealed**, **ported** (vented) and **passive radiator** boxes
- **4th- and 6th-order bandpass**, each chamber with its own port or passive radiators
- **Transmission lines (beta)**: open lines, mass-loaded lines, **tapped horns** and **front-loaded horns**, built from tapered sections (parallel, conical or exponential), with stuffing, the driver anywhere along the line and a drawing of the folded box
- Up to **8 designs side by side** on the same charts, each easy to switch on or off, rename or duplicate

### Charts

- **SPL**, relative or absolute (dB SPL), with each design's **F3** marked
- **Cone excursion** with an **Xmax redline**, and **passive radiator excursion** with each PR's own Xmax
- **Port air velocity** with a **chuffing-risk line** (peak or RMS)
- **Maximum SPL**: the loudest each box can play at every frequency, with a band showing what limits it there (Xmax, PR Xmax, port speed or thermal power), and the **amplifier voltage and current** needed to reach it, after the filter and EQ
- **Impedance**, **group delay**, and **line load (Za)** for lines and horns
- For lines: the **cone and mouth** contributions on their own, and **pressure and air speed along the line** at any frequency, showing where stuffing does the most
- Over-limit parts of a curve glow red; hover or tap for the values of every curve at that frequency, with the **leading curve marked** (highest SPL, lowest excursion, and so on)
- Phone-friendly: tall charts, a legend under each chart, and one chart at a time

### Drivers

- **A T/S parameter editor that never overwrites what you typed.** Type any set of parameters in any order; the rest are calculated (shown in grey), and contradictions are flagged
- **Paste straight from a datasheet**: the parameters are picked out of the text, with units like "1.9 ft³" or "35630 mm²" converted
- **A driver database of about 1,360 drivers from 15 brands**, plus 46 passive radiators, searchable and filterable, with links to each manufacturer's datasheet
- **Compare with another driver**: a second driver drawn dashed in every box, with **Swap** to make it the main one
- **Multiple drivers**: any number, wired in series or parallel, **isobaric** pairs and **dual voice coil** drivers
- **Measure your own driver** from a free-air impedance sweep (DATS, REW, ARTA and others, as `.zma`, `.txt` or `.csv`), with an added-mass sweep for Vas
- Voice-coil inductance models (Le, and L2R2 for a closer match to measurements), and a **hot voice coil** setting for power compression
- **Import and export WinISD `.wdr`** drivers, and send a driver to the database from the app

### Sizing and tuning

- **Alignment presets**: Qtc 0.5, 0.577 and 0.707 for sealed boxes; QB3, B4 and Keele for ported ones; one tap sizes every box for the driver
- **Find a passive radiator**: tries every PR in the database (and, optionally, woofers used as PRs) in groups of 1, 2 or 4, tunes each with added mass and ranks them by bass extension and spare travel
- **Best PR tuning**: the added mass for the flattest response, the deepest bass or the smallest box for a target F3
- **Port fit checks**: the port length for a tuning, whether it fits inside the box, round or slot ports, flared ends, and an option to model ports as pipes (with their own resonances)
- **Tune a line** by its length (or its port, for a mass-loaded line) to a target frequency

### Signal and room

- **Drive by power or voltage** (W or V, e.g. 2.83 V for datasheet comparisons)
- **High-pass filter** (Butterworth or Linkwitz–Riley, any order), **Linkwitz Transform**, peaking and shelving **EQ**
- **Car cabin or room gain**, and **baffle step** for free-standing speakers

### Volume and build

- **Real-world net volume calculator** for boxes, cylinders, spheres and truncated pyramids, minus the drivers, passive radiators, ports, bracing and crossover board, linked to a design so its volume follows the calculator
- **Build sheet**: panel sizes, cutouts, port and braces, a **cut list laid out on stock sheets**, metric or imperial (to 1/16″), and a print view

### Sharing and projects

- **Shareable links**: the whole simulation lives in the URL, so a link opens exactly what you see
- **Forum image** with the summary, charts and a **QR code** to the live design, plus ready-to-paste **Reddit (Markdown)** and **diyAudio (BBCode)** posts
- **CSV export** of every curve
- **Hornresp import and export** for transmission lines and horns
- **Projects** saved in your browser, or as a `.json` file you can keep or send
- Undo and redo, and help on every input field (hover its label, or select the field)
- Installable as an app on phones and computers

### Settings

- **Metric or imperial** units
- **WinISD mode** (its air constants, peak or RMS port speed) and **Hornresp mode** (its air constants, SPL from radiated power), for like-for-like comparisons
- Box losses (Ql, Qa, Qp) and amplifier resistance

## Accuracy

Results are checked against the established tools, and every comparison runs as an automated test:

- **WinISD**: within 0.01 dB for sealed and ported boxes, with matching tuning for passive radiator boxes, and checks for bandpass, isobaric, dual voice coil, parallel drivers, high-pass filters and leakage. See [`docs/validation.md`](docs/validation.md).
- **Hornresp**: transmission lines, tapped horns and front horns, including impedance and the line load (Za). See [`docs/transmission-lines.md`](docs/transmission-lines.md).

The model is small-signal and lumped (one-dimensional for lines): it doesn't include port compression or Bl and Cms non-linearity.

## The driver database

The database lives in this repo, in [`drivers/`](drivers) and [`passive-radiators/`](passive-radiators): about 1,360 drivers and 46 passive radiators. Sources and credits are in [`docs/data-sources.md`](docs/data-sources.md). It isn't affiliated with or endorsed by any manufacturer. Spotted a mistake? [Ask for a correction or removal](../../issues/new?template=data-correction.yml).

## Contributing

There are two ways to help:

1. **Add drivers and passive radiators.** No coding needed. Use the [new driver form](../../issues/new?template=new-driver.yml) and copy the numbers from the manufacturer's datasheet. See [`drivers/README.md`](drivers/README.md).
2. **Work on the code.** See [`CONTRIBUTING.md`](CONTRIBUTING.md). Code and docs contributions need a one-time [Contributor License Agreement](CLA.md), signed with a comment on your first pull request; adding drivers doesn't.

## Development

Requires Node.js 22.6+ and pnpm 10. The repo has two packages: `packages/engine` (the simulation, plain TypeScript) and `packages/web` (the React app).

```bash
pnpm install
pnpm validate:db   # check every driver / PR file
pnpm test          # engine, database and app tests
pnpm dev           # run the web app locally
pnpm build         # production build (what GitHub Pages serves)
```

Merging to `main` builds and deploys to GitHub Pages automatically.

## Licence

Speaker Box Genius is **free and source-available for non-commercial use**. It is not "open source" in the OSI sense, because it doesn't allow commercial resale.

- **Code**: [PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for personal, hobby, educational or non-profit purposes. Selling it or using it in a paid product needs permission.
- **Driver database and docs**: [CC BY-NC-SA 4.0](LICENSE-DATA).

The aim is simple: it was built by the community, so it stays free for the community.
