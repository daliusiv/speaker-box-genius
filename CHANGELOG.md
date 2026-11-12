# Changelog

What's new in Speaker Box Genius. The live site updates once a day; each dated section below is one update.

## Unreleased

## 2026-11-12

### Added
- Air distortion: a new "Air distortion" chart shows the 2nd harmonic a box's air adds when a big cone squeezes a small box (sealed, ported, passive radiator and bandpass boxes), in % or dBc, at the power set or at each box's max SPL, with each box's peak above the chart. The summary gets a "Peak air" column, red over your limit (10 % by default, Settings → Air distortion). It can also count as a Max SPL limit (off by default, so Max SPL stays as WinISD shows it), and the CSV export carries it. Box fill (empty to packed) lowers it a little. It's the box's air only: the driver's own distortion isn't modelled.
- Air distortion now covers transmission lines, MLTLs, tapped and front-loaded horns too: a strong wave steepens as it travels down a line or horn, adding 2nd harmonic that grows with pressure, path length and frequency. Shown on the same chart (at the mouth, over the whole sweep), in the summary's "Peak air" column and, if counted, in Max SPL. Checked against Thuras, Jenkins and O'Neil's 1935 tube and horn measurements (validation page).
- Open / Import window (☰ → Open / Import…): your three latest browser saves (and the rest a click away), and one place to open project, WinISD, OpenISD and measurement files. Drop a file anywhere on the page to open it; a .zma asks whether to measure the driver from it or show it on the charts.
- Save & Export window (☰ → Save / Export…): every export in one place, picked from a list: browser save, project file, CSV, WinISD project or driver, LTspice netlist, DSP filters. Tick the boxes to include; several files come as one zip. Driver tools → Export WinISD .wdr opens it too.
- Validation against Hornresp re-run on Hornresp 60.70 (identical results) and widened to 73 cases: twelve more lines and horns (other flares, three-segment lines, offset and tapered lines, tapped and front horns with two segments, two drivers in a line), fifteen more boxes (two passive radiators, added mass, lossy radiators, a small PR box, a 12″ subwoofer and a 4″ full-range sealed and ported, every coil model at once, two drivers in series, full space), port and mouth air speed, and maximum SPL with the amplifier's current limited.
- This changelog, at /changelog/ and linked from the site footer: what changed in each daily update.
- The validation page has a new section: every box type, filter and EQ checked against an independently built equivalent circuit solved by a circuit simulator, across 436 cases, with the netlists to download.
- Volume calculator → Car wedge (single slope): the box that sits behind a car's rear seat, with its exact inside volume (the sloped panel is wider across than it is thick), a double-baffle option, slope on the front or the back, butt-and-bevel or mitred corners with their saw angles, a live side-view drawing, Solve for any one dimension, checks with one-tap fixes, and whether the driver's motor clears the back and bottom. The cut list builds it too, with the bevels to cut. "Truncated pyramid" is now called "Tapered (all sides)"; older links still open.
- Build → Cut list → FreeCAD macro: download the box or car wedge as a FreeCAD script that builds every panel as its own solid (bevels, miters and the baffle's driver, passive radiator and port holes included) plus the air inside, and checks that volume against the app's when it runs. Cylinders, spheres and tapered boxes come out as the wall and the air inside.
- Volume calculator → 3D view: a 3D model of the box, car wedge, tube, sphere or tapered box, with the driver, port and passive radiator holes. Drag (or use the arrow keys) to turn it, pinch or scroll to zoom, jump to the 3/4, side or top view, and slide **Take apart** to pull the panels off one by one, with the inside shown as a ghost. Hover or tap a panel for its name and the size to cut it. Box panels are the ones the cut list gives. Passive radiators and ports that don't fit beside the driver go on the back (a tapered box also tries its sides), and anything that doesn't fit where it's drawn is named under the view.
- Purifi passive radiators now carry Purifi's maximum added mass (1.5× the PR's own moving mass), so the passive radiator calculator warns when a tuning needs more.
- Save & Export → LTspice netlist: download any box (sealed, ported, passive radiator or bandpass, with its filters, EQ and passive parts) as an LTspice circuit, with notes on what to plot.
- Cross-checks against REW (DSP filters, T/S fitting from impedance files), XSim (passive parts), FreeCAD (box volumes) and WinISD (slot port length), described in the validation notes.

### Fixed
- Guides: curve colours named in five picture captions (port chuffing, port tuning, Linkwitz transform, passive radiator, transmission line) now match the chart, a few numbers rounded by 0.1 match the app again, and the port chuffing example's slot now gets its own colour.
- Forum image: the response and cone excursion charts were drawn as narrow strips when they were taller than the other charts on screen (a narrow window or a phone); each chart now fills its panel at its own shape, and the chart title no longer shows the on-screen ▾.
- The menu's Roadmap link pointed to a page that no longer exists; it now opens the "What's next" list.
- Hornresp import: tapped horns with four segments now read the front tap where Hornresp has it (where the last segment starts); the export says so when a horn has more than one section after its tap.
- Hornresp export: the semi-inductance and frequency-dependent damping models are switched on in the record itself, so Hornresp opens them on, with no double-clicking; the import leaves those values out when a record has the model switched off, as Hornresp does.

### Changed
- Guides: the car subwoofer guide's charts are the app's own charts, drawn when the site is built, and its numbers and curve colours come from the same simulation, so they can't fall behind the app. More guides will follow.
- Chart legends: until you hover or tap the chart, the table shows just each curve and its peak (the columns read at the cursor appear when there is one), and long names wrap to two lines instead of being cut off.
- New look: a deeper navy background with lifted cards, cyan for everything you can tap or toggle (the logo stays orange), and the Inter typeface for crisper labels and numbers. Chart colours are unchanged. The app icons and share images match.
- Chart tabs sit on one row that scrolls sideways (with a fade where there are more), the picked chart underlined in cyan. Panel tabs, switches and chips are quieter: the selected one is tinted cyan, the rest grey. On phones the bottom bar has icons, and a chart's switches get a row of their own under its title.
- Notes about a chart (what it includes, where its settings are) moved behind an (i) button beside its title, starting with Air distortion and Max SPL.
- Charts: hover or tap and the frequency (or time) shows in a cyan tag at the top of a dashed cursor line, with a dot on every curve where it crosses. Units sit at the plot's corners (the value's above the scale, Hz beside the first frequency), phones included.
- Every chart has a legend table under it, on computers and phones alike: each box with its value at the cursor, its peak (and the frequency, in small type under it) and the chart's own columns, such as Air squeezed and Max SPL set by on Air distortion, or what limits each box on Max SPL. A line's cone and mouth fold under it (tap ▾). The hover box on computers is laid out the same way. Air distortion's peaks line above the chart moved into the table.
- The ☰ menu is shorter and never scrolls: New project, Open / Import…, Save / Export…, the site's pages, the app, and a footer of links, with icons. Ctrl/⌘+S opens Save & Export at "Save in this browser" (Enter saves); Ctrl/⌘+O opens Open / Import.
- Share opens a window instead of a menu: the live link with a Copy button, a preview of the forum image (download it or copy it straight to the clipboard), Reddit and diyAudio post text, and on phones the system share sheet. File exports (CSV, WinISD, LTspice) moved to Save & Export.
- WinISD projects: a slot port is now written as WinISD's own rectangular vent (it was a round port of the same area), and a rectangular vent in a WinISD project opens as a slot.
- The port's pipe resonance now says it's worked out from the length with end corrections, and gives WinISD's "1st port resonance" figure (physical length only, so higher) beside it, in the app and the port length calculator.
- Project files are now saved as .sbgenius instead of .json, so they're easy to tell apart. Older .json project files still open, and so does a project renamed to .txt. On a computer, the installed app opens .sbgenius files with a double-click.

## Earlier

Changes before 11 November 2026 are in the project's commit history on GitHub.
