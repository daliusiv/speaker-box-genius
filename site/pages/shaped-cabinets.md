---
title: "Non-rectangular speaker cabinets: cylinders, spheres and tapered boxes"
description: How to get the true net volume of a Sonotube, a sphere or a tapered (truncated pyramid or wedge) cabinet, what the shape changes and what it doesn't, with one 83.5 L sub built four ways that you can open and change.
path: guides/shaped-cabinets
image: shaped-cabinets.png
order: 26
group: start
---

# Non-rectangular speaker cabinets: cylinders, spheres and tapered boxes

A box simulator only needs one number from your cabinet: the **net internal volume**, the air left after the walls, the driver, the port and the bracing. For a rectangular MDF box that's easy. For a Sonotube, a sphere or a tapered wedge, it's where builds usually go wrong. Sonotube is sold by its inside diameter, its end caps are much thicker than the tube, a sloping wall is wider across than the board is thick, and the usual frustum formula doesn't work on a wedge. This guide works through all of it on one sub built four ways, and shows what the shape changes and what it doesn't.

[[Open the box|shape-box]] [[Open the Sonotube|shape-tube]] [[Open the sphere|shape-sphere]] [[Open the tapered box|shape-wedge]]

## The short answer

- **For the bass, only the net volume matters.** Box, tube, sphere or wedge with the same net volume and port give the same simulated response. The shape matters for how the cabinet is built, how much room it takes and where its internal standing waves fall.
- **Get the inside right:**
  - **Sonotube** is sold by its **inside** diameter, and the end caps are usually two layers of MDF while the tube wall is about 6 mm. Enter the outside diameter and both thicknesses.
  - **Sloping walls** are wider across than the board is thick (18 mm at 45° takes 25.5 mm), and the inside of a steep pyramid closes before its top.
  - **A wedge** (top and bottom different shapes) needs the prismoidal formula. The common frustum formula is up to 33% low.
- **Shape moves standing waves; it doesn't remove them.** A sphere's lowest is 32% higher than a box of the same inside length would have; a long tube's is along its length. Non-parallel walls shift and spread them [7][8].
- **In the app:** **Build → Volume calculator** handles all four shapes (and the car wedge, below), takes off everything inside, sizes the cabinet for a target volume and feeds the result straight into the design.

## The example: one sub, four cabinets

The [port chuffing guide](/guides/port-chuffing/)'s sub: a **Dayton Audio RSS315HF-4** 12″ in Keele's flat alignment, **83.5 L tuned to 23.8 Hz**, with a 10 cm flared port 45.5 cm long, at 300 W behind a 20 Hz high-pass filter. The volume calculator sized each cabinet to 83.5 L net with **Size the box**:

![The same 83.5 L sub as a golden-ratio box, a 14″ Sonotube, a sphere and a tapered box, drawn to scale, with the room each takes, its footprint and its lowest standing wave.](img/shaped-cabinets.png)

| | Box | 14″ Sonotube | Sphere | Tapered box |
|---|---|---|---|---|
| Outside (cm) | 49.3 × 79.7 × 30.4 | Ø 36.8, 98.5 long | Ø 58.7 | base 53.2 × 53.2, top 31.9 × 31.9, 63.9 tall |
| Walls (mm) | 18 MDF, plus 3% bracing | 6 tube, 38 end caps | 15 shell | 18 MDF, plus 3% bracing |
| Gross internal (L) | 93.20 | 90.48 | 90.48 | 93.28 |
| − driver + port + bracing (L) | 3.01 + 4.02 + 2.80 | 3.01 + 4.02 | 3.01 + 4.02 | 3.01 + 4.02 + 2.80 |
| **Net (L)** | **83.4** | **83.5** | **83.5** | **83.5** |
| Takes up, outside (L) | 119 | 97 | 106 | 118 |
| Floor space (m²) | 0.15 | 0.11 | 0.27 | 0.28 |
| Longest straight run inside (cm) | 76.1 | 90.9 | 55.7 | 60.3 |
| Lowest standing wave (Hz) | 226 | 189 | 409 | ~285 |
| **Tuning, Fb (Hz)** | **23.8** | **23.8** | **23.8** | **23.8** |
| **F3, −3 dB (Hz)** | **24.4** | **24.4** | **24.4** | **24.4** |

The driver's displacement (3.01 L) is the app's estimate from its 282 mm cutout and 146 mm depth; the port tube takes 4.02 L with 3 mm walls.

What the table shows:
- **The bass is identical.** Same net volume, same port, same tuning and F3. That's the lumped model every box simulator uses (WinISD, Hornresp, this app), and it holds while the cabinet is small next to the wavelength: a 24 Hz wave is 14 m long.
- **The tube takes the least room** (97 L against 119 L for the box) because its wall is thin and it needs no bracing, and it has the smallest footprint.
- **The sphere has the highest standing wave but the least room for a port.** Its 45.5 cm port only just fits along the diameter, with the app's one-port-diameter clearance to the far wall.

## Shape by shape

### Cylinder (Sonotube)

The inside volume is `V = π r² L`, with r the *inside* radius and L the length *between the end caps*. Three things trip people up:

1. **Sonotube is sold by its inside diameter.** A 14″ tube is 14″ (35.6 cm) *inside*, at least [2][3]. The app asks for the outside diameter, so add twice the wall: 35.6 + 2 × 0.6 = 36.8 cm here.
2. **The end caps aren't the tube wall.** Builders typically use two layers of 18–19 mm MDF for each cap [4][5]; the tube wall is about 6 mm [6]. The calculator has a separate **End caps** field for them.
3. **Caps inside the tube shorten it.** Measure the outside length from cap to cap; the calculator takes both caps off.

Getting it wrong by one of these is about 7% of the volume on this tube:

| Entered as | The calculator says | The simulation tunes to |
|---|---|---|
| As built: Ø 36.8 cm, 6 mm wall, 38 mm caps | 83.5 L | 23.8 Hz |
| One thickness (6 mm) for the tube and caps | 89.8 L | 22.9 Hz |
| The nominal 14″ (35.6 cm) typed as the outside | 77.5 L | 24.7 Hz |

> **The tube you build doesn't change.** In both wrong cases it's still 83.5 L and tunes to 23.8 Hz. It's the simulation, and anything you size from it, that's off.

A tube needs little or no bracing. The pressure inside pulls the wall in tension around its circumference, where a flat panel would bow [9][10]. The **end caps** are the flat panels in a tube sub, and the place builders report vibration [5].

**Sizing:** tubes come in set diameters, so **Size the box** on a cylinder keeps the diameter and finds the length. (Choose **Keep the current proportions** to scale both.)

### Sphere

`V = (4/3) π r³`, with r the inside radius: the outside radius less the shell. A sphere has the smoothest edge diffraction of any shape: Olson's 1951 measurements of twelve cabinet shapes found the sphere's response the smoothest [11] (see [baffle step loss](/guides/baffle-step/) for what a flat front panel does instead). Building one is harder:
- **A flat for the driver.** The driver needs a flat mounting ring, which takes a little volume; put it in **Other**.
- **The port.** The longest straight run is the inside diameter, and a long port has to pass through the middle. Here 45.5 cm of port in a 55.7 cm sphere only just fits; a bigger port or lower tuning won't.
- **Footprint.** A 58.7 cm ball needs a stand and covers more floor than the box.

### Tapered box (truncated pyramid or wedge)

Enter the bottom and top width and depth and the height. Two shortcuts give the wrong answer:

![Error of two shortcuts against the exact inside volume, by the size of the top as a percentage of the bottom: taking 18 mm walls off as if they were upright (orange) is up to 19% high for a near-pyramid; the similar-bases frustum formula on a wedge (blue) is up to 33% low.](img/shaped-cabinets-shortcuts.png)

1. **The frustum formula.** `V = h/3 (A₁ + A₂ + √(A₁A₂))` is exact only when the top and bottom are similar rectangles, the same shape scaled [13]. A wedge, where only the depth tapers, isn't. The formula that works for any rectangular top and bottom is the **prismoidal formula** [12][13]:
   - `V = h/6 (A₁ + 4M + A₂)`, where M is the area halfway up.
   - For a wedge 60 × 60 cm at the bottom, 50 cm tall, closing to a 60 cm edge at the top (a floor-monitor shape), the frustum formula gives 60 L; the true volume is 90 L, so the formula is **33% low**. With a top half as deep, it's still 1.9% low.
2. **Taking the walls off as if they were upright.** A board leaning at an angle θ is `t / cos θ` wide across: 18 mm MDF at 45° takes 25.5 mm, and at the example's 9.5° slope, 18.25 mm. The inside bottom and top also sit 18 mm in from the outside ones, where the outside is already narrower or wider. For gentle tapers the shortcut's error is small (0.5% on the example's tapered box), but for a steep one it isn't:
   - A 50 × 50 cm, 40 cm tall pyramid in 18 mm MDF: the upright-wall shortcut gives 26.1 L; the true inside is 22.0 L, so the shortcut is **19% high**.
   - The app works out the true inside, and stops where a steep pyramid's inside closes before its top.

**One sloped face or two:** the outside of a wedge sloped only at the front holds the same as one sloped evenly front and back with the same top and bottom (Cavalieri's principle), but the inside doesn't quite: one steep wall takes more across than two gentle ones. For a box with one sloped panel use the **Car wedge** shape below; the tapered shape reads it about 0.2% high.

### Car wedge (single slope)

The box that sits behind a car's rear seat: upright back, flat top and bottom, and one sloped panel, usually the baffle. Enter the width, the height, the depth along the bottom (the long one) and along the top (or the slope angle instead). The sloped panel, t thick, takes `t / sin θ` across the horizontal, θ its slope from horizontal, so the inside is exactly

`V = (W − 2t)(H − 2t) · [(D_top + D_bottom)/2 − t − t_baffle / sin θ]`

For an 800 mm wide, 380 mm tall wedge, 400 mm deep at the bottom and 250 mm at the top, in 18 mm MDF, that's **75.60 L**. The usual shortcut, `(W − 2t)(H − 2t)(D_avg − 2t)`, gives 75.95 L, **0.47% high**; on a double baffle or a steeper slope the gap grows. The calculator also gives the saw angles (one bevel of 90° − θ for butt joints, 21.5° here), draws the side view, solves any one dimension for a target volume, and checks that the driver's motor clears the back and the bottom (it needs the driver's mounting depth). The slope can go on the back instead, with an upright baffle.

## Standing waves: what the shape changes

Inside any cabinet the air has its own resonances, from about half a wavelength across the longest inside dimension upwards. They don't affect the bass the simulator shows; they matter in a woofer's upper range, where they can leak out through the cone, the walls or the port.

| Shape | Lowest standing wave | Here |
|---|---|---|
| Box | `c / 2L`, L the longest inside dimension | 226 Hz (76.1 cm tall) |
| Cylinder | `c / 2L` along it, or `1.841 c / (π D)` across it [15], whichever is lower | 189 Hz along; 565 Hz across |
| Sphere | `2.082 c / (π D)` [14] | 409 Hz (55.7 cm inside) |
| Tapered box | about `c / 2L` for its longest run; the taper moves them | ~285 Hz |

c is the speed of sound (343 m/s at 20 °C), L and D the inside length and diameter in metres.

So:
- **A sphere's lowest mode is 32% higher** than half a wavelength across its diameter, because the wave has to go round as well as across. The app's port checks use each shape's own lowest mode.
- **A long tube rings along its length.** A sub crossed over at 80–100 Hz is well clear, but a tube used for a midbass isn't.
- **Non-parallel walls don't remove standing waves.** They change their frequencies and spread them out, which can lower the peaks, but every enclosed space has resonances [7][8]. Damping material on the walls is what lowers them.

The port's own pipe resonance (here 346 Hz) and the cabinet's lowest mode are both on the port's **Pipe resonance** chip in the app, with a warning when they land close together (see [round vs slot port](/guides/round-vs-slot-port/)).

## Doing it in the app

![The volume calculator for the Sonotube: 36.8 cm outside, 98.5 cm long, 6 mm wall, 38 mm end caps, the driver and port taken off: 83.45 L net.](img/shaped-cabinets-app.png)

1. **Build → Volume calculator → Used by:** pick the design. Its volume now follows the calculator.
2. **Shape:** pick Box, Car wedge (single slope), Cylinder (sonotube), Sphere or Tapered (all sides), then enter the **outside** sizes.
3. **Walls:** enter the wall thickness. For a tube, also enter **End caps** (it follows the wall until you change it).
4. **Takes up space inside:** check the driver's displacement (from the database, or estimated), **Bracing** and **Other**. The design's ports or passive radiators are taken off automatically; **Port wall** and **Each PR** only show when it has them.
5. **Size the box → Target:** enter the net volume you want and press **Size the box**. A box can use golden-ratio proportions; a tube keeps its diameter and finds its length.
6. **3D view** (for a car wedge, **3D** above its drawing): turn the cabinet round and slide **Take apart** to see how its pieces go together (a tube's end caps lift off, a sphere's halves part, a tapered box's walls come off square to their faces). Tap a piece for its size.
7. **Boxes → the design's port:** **Port too long to fit** uses the shape's longest straight run, and **Pipe resonance** shows the cabinet's lowest standing wave.

The **Cut list** builds boxes and car wedges (with the wedge's bevel or miter angles on each panel). **FreeCAD macro** downloads any of the shapes as a FreeCAD script: the panels (or the tube, caps or shell) as solids and the air inside, whose volume the script checks against the app's.

## The forum claims, checked

| Claim | Verdict |
|---|---|
| "The shape changes the bass" | **No.** Not in the simulation: below the cabinet's first standing wave, only the net volume and the port matter. The four cabinets here all tune to 23.8 Hz with F3 24.4 Hz. |
| "Sonotube volume is `π r² L`" | **Yes,** with the *inside* radius (the tube's nominal size) and the length *between* the end caps. |
| "A tube needs no bracing" | **Mostly.** The wall works in tension. The flat end caps are what flex; make them thick [5][9]. |
| "Frustum volume is `h/3 (A₁ + A₂ + √A₁A₂)`" | **Only for similar top and bottom.** On a wedge it's up to 33% low; use `h/6 (A₁ + 4M + A₂)` [12][13]. |
| "Non-parallel walls eliminate standing waves" | **No.** They move and spread them [7][8]. |
| "A sphere is the ideal shape" | **For sound, nearly; for building, no.** It has the smoothest diffraction [11] and the highest lowest mode, but it's the hardest to build, needs a flat for the driver and has the least room for a port. |

## Sources

1. This guide's numbers are the app's own (`site/guideNumbers.test.ts` checks them). Driver parameters: [Dayton Audio RSS315HF-4](https://www.daytonaudio.com/product/121/rss315hf-4-12-reference-hf-subwoofer-4-ohm), used with Dayton Audio's permission.
2. Sonoco, [Sonotube FAQ](https://www.sonoco.com/sites/default/files/2023-03/Sonotube_FAQ_Final.pdf): Sonotube diameters are nominal; the inside diameter is at least the stated size.
3. Sonoco, [Sonotube Finish Free forms guide specification](https://www.buildsite.com/pdf/sonoco/Sonotube-Finish-Free-Concrete-Forms-Guide-Specifications-2979204.pdf): forms are specified by inside diameter.
4. CarAudio.com, [Using Sonotube for sub building](https://www.caraudio.com/threads/using-sonotube-for-sub-building.386104/): volume from the tube radius and length; end caps commonly two glued layers of 3/4″ MDF; peel the inner liner before gluing the caps.
5. diyAudio, [Sonotube end cap thickness](https://www.diyaudio.com/community/threads/sonotube-end-cap-thickness.47529): three-layer MDF caps on an 18″ tube still vibrated more than the tube wall.
6. Home Theater Forum, [Sono end caps](https://www.hometheaterforum.com/community/threads/sono-end-caps.52792/): a cardboard tube about 1/4″ thick; the curved wall resists the inside pressure.
7. Acoustic Sciences Corp., [Audio room misconceptions and realities](https://www.acousticsciences.com/asc-newsletter/audio-room-misconceptions-and-realities/): changing the angle of walls doesn't eliminate resonance; non-parallel walls mainly reduce flutter echo.
8. diyAudio, [non-parallel walls and standing waves](https://www.diyaudio.com/community/goto/post?id=7919992): non-parallel walls spread modes in position and frequency and lower their level, but don't remove them.
9. Audioholics forum, [cylinder vs box strength](https://forums.audioholics.com/forums/goto/post?id=1279304): a cylinder's wall is only stretched in tension, where a flat wall of the same material bulges.
10. Home Theater Forum, [SVS on cylinder subwoofers](https://www.hometheaterforum.com/community/threads/help-with-a-subwoofer.181226/page-3): the cylinder's geometry resists flexing and holds high pressure, so bracing isn't needed.
11. Stereophile, [Cutting Corners](https://www.stereophile.com/reference/704cutting/index.html): Olson's measurements of twelve enclosure shapes; the sphere's response is the smoothest. H. F. Olson, "Direct Radiator Loudspeaker Enclosures", 1951; [*J. Audio Eng. Soc.* 17 (1), 1969](https://aes2.org/publications/elibrary-page/?id=1609).
12. Eric W. Weisstein, [Prismatoid](https://mathworld.wolfram.com/Prismatoid.html), MathWorld: V = h/6 (A₁ + 4M + A₂).
13. The Math Doctors, [Looks like a frustum, but…](https://www.themathdoctors.org/looks-like-a-frustum-but/): the frustum formula applies only when the bases are similar; the prismoidal formula for rectangular tops and bottoms of any proportion.
14. [Acoustic modes of a rigid spherical cavity](https://chiragokani.github.io/class/quals/10-13.pdf), worked solution following Blackstock, *Fundamentals of Physical Acoustics*: the lowest non-zero mode at ka = 2.082.
15. [The optimal design for cylindrical tubes used as acoustic stethoscopes](https://arxiv.org/pdf/2008.09981), arXiv 2008.09981: the first transverse mode of a rigid round tube at f = 1.841 c / (2π a).
