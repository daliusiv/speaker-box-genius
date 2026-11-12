# Speaker Box Genius

**A free, browser-based loudspeaker enclosure simulator: a modern replacement for WinISD and Hornresp.**

Design sealed, ported, passive radiator, bandpass and transmission line boxes for any driver, see straight away whether the cone, the passive radiators or the port run out of headroom, then share the live design with a link instead of a pile of screenshots.

**Try it: https://speakerboxgenius.com**

![Dragging a ported box's tuning on the response chart: the port air speed passes the chuffing line and glows red, then Share offers a link, Reddit and diyAudio text, and a forum image](docs/img/hero.gif)

Everything runs in your browser. There's nothing to install, no account and no server, and it keeps working offline. It works on phones as well as computers.

> 🚧 **Early preview.** It's usable and tested, but still changing quickly. See [What's next](#whats-next).

## Features

- **Design assistant:** say what you're building (car sub, home sub, hi-fi woofer, tower…), your limits (box size, amplifier power and minimum load, number and size of drivers, box types, brands) and what matters most (deepest, loudest, smallest, balanced). It tries every suitable driver in the database in a sealed and a ported box sized the way the presets would (with a plain, flared or slot port that fits), and, for the best few drivers, mass-loaded and classic transmission lines (towers) or 4th- and 6th-order bandpass boxes (subwoofers); it simulates them at your power, grades them on any amp (deep bass below 0.7 × the tuning in amber, not failed), and ranks them; one tap starts your project with a result (or with the same driver in two boxes). New projects, and your first visit, start here.

### Box types

- **Sealed**, **ported** (vented) and **passive radiator** boxes
- **4th- and 6th-order bandpass**, each chamber with its own port or passive radiators
- **Transmission lines**: open lines, mass-loaded lines, **tapped horns** and **front-loaded horns**, built from tapered sections (parallel, conical or exponential), with stuffing, the driver anywhere along the line and a drawing of the folded box. Presets and **Compare types** cover every type but the tapped horn, whose starting point is being reworked; set one up by hand or import it from Hornresp
- **Stuffing** per sealed, ported or passive radiator design: lined walls, a fibre fill by weight (g/L or lb/ft³, with the grams to weigh out) or your own measured values, so an empty and a stuffed box can sit on one chart; **fit to a measured impedance sweep** (.zma) finds the volume a finished box really acts as and its Qa
- Up to **8 designs side by side** on the same charts, each easy to switch on or off, rename or duplicate

### Charts

- **SPL**, relative or absolute (dB SPL), with each design's **F3** marked
- **Cone excursion** with an **Xmax redline**, and **passive radiator excursion** with each PR's own Xmax and a shaded caution band below it (75 % of Xmax by default, a rule of thumb)
- **Port air velocity** with a **chuffing-risk line** (peak or RMS; 17 m/s by default, your own in Settings → Ports, used by every check and the design assistant)
- **Box pressure**: the peak sound pressure inside the box (both chambers of a bandpass), the load on the cone and the walls; matches Hornresp's diaphragm pressure chart
- **Air distortion**: the 2nd harmonic a box's air spring adds when a big cone squeezes a small box (sealed, ported, PR and bandpass), and that builds up along a line or horn as the wave steepens (checked against Thuras 1935), in % or dBc, at the power set or at max SPL, with each box's peak in the summary and your own limit (Settings → Air distortion); it can also count as a Max SPL limit. The air only: the driver's own distortion isn't modelled
- **Maximum SPL**: the loudest each box can play at every frequency, with a band showing what limits it there (Xmax, PR Xmax, port speed or thermal power), and the **amplifier voltage and current** needed to reach it, after the filter and EQ, against your amplifier's limits (typed in, or worked out from its watt ratings)
- **Impedance** (magnitude or phase, with the lowest load the amplifier sees), **group delay**, and **line load (Za)** for lines and horns
- For lines: the **cone and mouth** contributions on their own, and **pressure and air speed along the line** at any frequency, showing where stuffing does the most
- **Edit on the chart:** drag a ported or PR box's tuning, or an EQ point (frequency, gain; tap it for Q and Remove), on the response chart, with mouse, finger or keyboard; Cancel puts everything back as it was
- Over-limit parts of a curve glow red; hover or tap for the values of every curve at that frequency, with the **leading curve marked** (highest SPL, lowest excursion, and so on)
- Phone-friendly: tall charts, a legend under each chart, one chart at a time, and a strip of every box's F3 and limits pinned above the controls
- Every warning leads somewhere: tap "over a limit" (or a red value) to jump to the chart that shows it, or a port warning to the field that fixes it

### Drivers

- **A T/S parameter editor that never overwrites what you typed.** Type any set of parameters in any order; the rest are calculated (shown in grey), and contradictions are flagged. A box-type hint (EBP and Qts) says whether the driver leans sealed or ported
- **Paste straight from a datasheet**: the parameters are picked out of the text, with units like "1.9 ft³" or "35630 mm²" converted
- **A driver database of about 1,610 drivers from 19 brands**, plus 59 passive radiators, searchable and filterable, with links to each manufacturer's datasheet. Values that look wrong for a driver (an Xmax too large for its cone, say) are marked "check" until someone confirms them against the datasheet, and the design assistant leaves those drivers out
- **A page for every driver** on the site ([speakerboxgenius.com/drivers](https://speakerboxgenius.com/drivers/)), with suggested sealed, ported and passive radiator boxes (none over 300 L) at the driver's power rating, their charts, and a link that opens them in the app
- **Compare with another driver**: a second driver drawn dashed in every box, with its own number of drivers and wiring if you like (one 15″ against two 10″s), and **Swap** to make it the main one
- **Multiple drivers**: any number, wired in series or parallel, **isobaric** pairs and **dual voice coil** drivers
- **Measure your own driver** from a free-air impedance sweep (DATS, REW, ARTA and others, as `.zma`, `.txt` or `.csv`), with an added-mass sweep for Vas
- Voice-coil inductance models (Le, and L2R2 for a closer match to measurements), and a **hot voice coil** setting for power compression
- **Import and export WinISD** `.wdr` drivers and `.wpr` projects (open any sealed, ported, PR or ported bandpass box in WinISD; slot ports go both ways as WinISD's rectangular vents), **import OpenISD** `.owpr` projects and `.owdr` drivers, and send a driver to the database from the app
- **Export an LTspice netlist** of any box: the equivalent circuit the app is tested against, with a header that says what to plot

### Sizing and tuning

- **Alignment presets sized like WinISD's wizard**: Qtc 0.5, 0.577 and 0.707 for sealed boxes; QB3, plus C4/SC4 and BB4/SBB4, for ported and PR boxes, giving the same boxes as WinISD (counting its 0.1 Ω amplifier resistance and the box's losses). Settings → Box presets → Textbook gives the lossless textbook alignments instead (QB3/B4, Keele, SQB3, C4/SC4, BB4/SBB4). One tap sizes every box for the driver (sealed at Qtc 0.707, or twice Vas when Qts is so close to 0.707 that the box would run away) and picks each port: the simplest that fits and stays under the chuffing line at the driver's rated power. A single preset keeps your port when its new length fits the box, and otherwise picks one the same way
- **Find a passive radiator**: tries every PR in the database (and, optionally, woofers used as PRs) in groups of 1, 2 or 4, tunes each with added mass and ranks them by bass extension and spare travel. Also a stand-alone [passive radiator calculator](https://speakerboxgenius.com/calculators/passive-radiator/): the added mass for any box, tuning and PR, and whether the PRs keep up with your driver
- **Best PR tuning**: the added mass for the flattest response, the deepest bass or the smallest box for a target F3
- **Port fit checks**: the port length for a tuning, whether it fits inside the box, round or slot ports, flared ends, your own end correction (K), the likely tuning range of a slot along a wall, and an option to model ports as pipes (with their own resonances). Also a stand-alone [port length calculator](https://speakerboxgenius.com/calculators/port-length/)
- **Tune a line** by its length (or its port, for a mass-loaded line) to a target frequency

### Signal and room

- **Drive by power or voltage** (W or V, e.g. 2.83 V for datasheet comparisons). New projects start at 1 W, like WinISD and Hornresp, with one tap for 1 W or the driver's rated power
- **High-pass filter** (Butterworth 6–24 dB/oct or Linkwitz–Riley 12 and 24 dB/oct), **Linkwitz Transform**, peaking, low-shelf and high-shelf **EQ** (matched with Hornresp)
- **Export to DSP**: the high-pass and EQ as biquads for **Equalizer APO**, **CamillaDSP 3** or **miniDSP**, or as a coefficient CSV, at 44.1, 48, 96 or 192 kHz
- **Passive parts** between the amplifier and the drivers: series coils (with their resistance), capacitors across, Zobels and L-pads, in up to four branches (Hornresp's layout); the impedance chart shows what the amplifier sees
- **Car cabin or room gain**, or **your own room-gain curve** (.txt or .frd, as Hornresp imports it), and **baffle step** for free-standing speakers

### Volume and build

- **Real-world net volume calculator** for boxes, car wedges (single slope, exact, with a double-baffle option, a side-view drawing, saw angles and a driver-motor clearance check), cylinders (with their own end-cap thickness), spheres and tapered boxes (all sides; walls taken square to each sloping face), with the shape's lowest standing wave, minus the drivers, passive radiators, ports, bracing and crossover board, linked to a design so its volume follows the calculator
- **3D take-apart view** of every volume-calculator shape (box, car wedge, tube, sphere, tapered box): turn it round, pull it apart piece by piece, tap a panel for its cut size; drawn by a small built-in renderer, loaded only when opened
- **Build sheet**: panel sizes, cutouts, port and braces, a **cut list laid out on stock sheets**, metric or imperial (to 1/16″), a print view and a **FreeCAD macro** that builds every panel as a solid, with the air inside checked against the app's volume

### Sharing and projects

- **Shareable links**: the whole simulation lives in the URL, so a link opens exactly what you see
- **Share** window: copy the link, the **forum image** (download or copy to the clipboard) with the summary, charts and a **QR code** to the live design, plus ready-to-paste **Reddit (Markdown)** and **diyAudio (BBCode)** posts
- **Save & Export** window (☰ menu): save in the browser, a project file, a CSV of every curve, WinISD projects and drivers, LTspice netlists and DSP filters, with each format's settings in one place; several boxes download as one zip
- **Hornresp import and export** for transmission lines and horns
- **Projects** saved in your browser, or as a `.sbgenius` project file you can keep or send (older `.json` saves still open; on desktop the installed app opens `.sbgenius` files with a double-click) (with **New project**, which starts in the design assistant, in a new tab if the current project is in use)
- **Open / Import** window (☰ menu): your latest browser saves, and one drop zone for project, WinISD, OpenISD and measurement files; or drop a file anywhere on the page. An impedance sweep asks whether to measure the driver or show it on the charts
- Undo and redo, and help on every input field (hover its label, or select the field)
- Installable as an app on phones and computers

### Settings

- **Metric or imperial** units
- **WinISD** and **Hornresp** presets that set each program's conventions together (air constants, coil inductance, how watts are counted; for Hornresp also the cone's air load, ports as pipes, leaked air and SPL from radiated power), for like-for-like comparisons. Opening a WinISD project sets the WinISD one
- **Your own air**: temperature, humidity and pressure (for altitude or a hot car), which set the air's density and speed of sound
- Box losses (Ql, Qa, Qp), amplifier and cable resistance (0.1 Ω by default, as WinISD), peak or RMS port speed and the chuffing line

## Accuracy

Results are checked against the established tools, and every comparison runs as an automated test:

- **WinISD**: about 0.01 dB for sealed, ported, passive radiator and bandpass boxes, from hand-made cases plus a run of 51 projects written by the app, opened in WinISD and read at six frequencies (about 1,000 values: response, excursion, port speed, impedance, phase and group delay). Also isobaric, dual voice coil, parallel drivers, high-pass filters, losses and the alignment presets (19 drivers). See the [validation page](https://speakerboxgenius.com/validation/).
- **Hornresp**: transmission lines, tapped horns and front horns, including impedance and the line load (Za); and sealed, ported, passive-radiator and bandpass boxes, with one or two drivers. See the [validation page](https://speakerboxgenius.com/validation/#hornresp) and [`docs/transmission-lines.md`](docs/transmission-lines.md).

The model is small-signal and lumped (one-dimensional for lines). Port compression and a hot voice coil are optional estimates in Settings, and the box air's distortion is estimated on its own chart; Bl and Cms non-linearity aren't modelled.

## The driver database

The database lives in this repo, in [`drivers/`](drivers) and [`passive-radiators/`](passive-radiators): about 1,610 drivers and 59 passive radiators. Sources and credits are in [`docs/data-sources.md`](docs/data-sources.md). Every driver with enough parameters also gets a page on the site with suggested sealed, ported and passive radiator boxes: [speakerboxgenius.com/drivers](https://speakerboxgenius.com/drivers/). It isn't affiliated with or endorsed by any manufacturer. Spotted a mistake? [Ask for a correction or removal](../../issues/new?template=data-correction.yml).

## Contributing

There are two ways to help:

1. **Add drivers and passive radiators.** No coding needed. Use the [new driver form](../../issues/new?template=new-driver.yml) and copy the numbers from the manufacturer's datasheet. See [`drivers/README.md`](drivers/README.md).
2. **Work on the code.** See [`CONTRIBUTING.md`](CONTRIBUTING.md). Code and docs contributions need a one-time [Contributor License Agreement](CLA.md), signed with a comment on your first pull request; adding drivers doesn't.

## Development

Requires Node.js 22.6+ and pnpm 10. The repo has four packages: `packages/engine` (the simulation, plain TypeScript), `packages/web` (the React app), `packages/schema` (data formats) and `packages/db-tools` (database checks, bundling and imports), plus `site/` (the guides, calculators, validation page and driver pages).

```bash
pnpm install
pnpm validate:db   # check every driver / PR file
pnpm db:review     # list values that look implausible, with datasheet links
pnpm test          # engine, database and app tests
pnpm dev           # run the web app locally
pnpm build         # production build (what GitHub Pages serves)
```

`pnpm build` also builds the content pages (`site/`): the guides, the validation page and a page per driver. Each driver page gets a share card drawn with headless Chrome, found at `CHROME_PATH` or the usual install paths; set `SBG_CARDS=0` to skip them (CI does). Cards are kept in `.cache/cards` (or `SBG_CARD_CACHE`) and only redrawn when a driver's card changes.

Merging to `main` builds and deploys to GitHub Pages automatically.

## What's next

- More manufacturer data (several brands have given permission)
- A box volume calculator page
- More cross-checks against other programs
- CAD drawings of the build sheet (SVG/DXF)

Ideas and requests: [open an issue](../../issues).

## Licence

Speaker Box Genius is **free and source-available for non-commercial use**. It is not "open source" in the OSI sense, because it doesn't allow commercial resale. The [About page](https://speakerboxgenius.com/about/) explains the licence and the contributor agreement in plain words.

- **Code**: [PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for personal, hobby, educational or non-profit purposes. Selling it or using it in a paid product needs permission.
- **Driver database and docs**: [CC BY-NC-SA 4.0](LICENSE-DATA), except a few brands that allowed use here but not under Creative Commons (listed in LICENSE-DATA).

The aim is simple: it was built by the community, so it stays free for the community.
