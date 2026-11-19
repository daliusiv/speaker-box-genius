## How it's worked out

Enter the cabinet's **outside** sizes and the board's thickness: the calculator takes the walls off every side to get the gross inside volume, then takes off everything that sits inside, with the same code as the simulator's **Build → Box** card.

- **Box:** (W − 2t) × (H − 2t) × (D − 2t), t the wall thickness.
- **Cylinder:** π r² L, with r the outside radius less the tube wall and L the outside length less both **End caps**. Caps are often much thicker than the tube (two layers of MDF on a 6 mm Sonotube), so they have their own field; empty means the same as the walls.
- **Sphere:** 4/3 π r³, with the inside radius.
- **Car wedge:** one sloped panel. A sloping board is wider across the horizontal than it is thick, by 1 ÷ sin θ (θ the slope from the bottom), so the calculator works out the inside profile exactly and multiplies it by the inside width. The usual shortcut, (W − 2t)(H − 2t)(average depth − 2t), reads a little high: for an 80 × 38 cm wedge, 40 cm deep at the bottom and 25 cm at the top, in 18 mm MDF (a {{calc:w-slope}}° slope), the exact inside is {{calc:w-gross}} L and the shortcut gives {{calc:w-shortcut}} L. A **Lip height** is an upright strip under the slope; **Sloped panel** is for a double baffle.
- **Tapered:** sloped on all four sides, the walls taken square to each face. Its volume comes from the prismoidal formula, h/6 (A₁ + 4M + A₂), which is exact for any rectangular top and bottom. The frustum formula you'll often see, h/3 (A₁ + A₂ + √A₁A₂), only works when the top and bottom are the same shape scaled, so on a wedge it can be a third low: [non-rectangular cabinets](/guides/shaped-cabinets/) shows why.

Then the parts inside come off: each driver's displacement (from the datasheet, or when the database has none, a third of the cylinder its cutout and mounting depth make, marked as an estimate), each passive radiator, the port tubes with their walls (a slot's walls on all four sides), the bracing as a share of the gross, and anything else such as a crossover board or plate amp.

**Box size for a net volume** goes the other way: enter the net volume you want and the calculator finds the outside sizes, with the walls and parts taken off, and fills them in. A box can keep its proportions or take the golden ratio (which spreads its standing waves); a tube keeps its diameter (tubes come in set sizes) and finds its length; a car wedge can scale as a whole, or lock every size but one and solve for that.

> **Common trap:** taking stuffing off. Polyfill takes up only about 1% of the box, and it makes the box act bigger, not smaller. The simulator sets it on each box; see [box stuffing](/guides/box-stuffing/).

The **longest inside** run is how long a straight port can be; the **lowest standing wave** is half a wavelength across it (higher for a sphere or across a tube). Below it, only the net volume matters to the bass.

## Worked example: the 83.5 L sub as a Sonotube

The [non-rectangular cabinets](/guides/shaped-cabinets/) guide's sub, a Dayton Audio RSS315HF-4 12″ with a {{calc:pdia}} cm port {{calc:pl}} cm long, built in a 14″ Sonotube: {{calc:dia}} cm outside (Sonotube is sold by its inside diameter, so add twice the {{calc:wall}} mm wall), {{calc:len}} cm long, with {{calc:cap}} mm end caps. The database has the driver's 282 mm cutout and 146 mm depth but no displacement, so it's estimated at {{calc:dd}} L. Beside it, the same {{calc:target}} L net as a golden-ratio box in 18 mm MDF with 3% bracing, sized by **Box size for a net volume**:

| | 14″ Sonotube | Golden-ratio box |
|---|---|---|
| Outside (cm) | Ø {{calc:dia}}, {{calc:len}} long | {{calc:b-size}} |
| Gross internal | {{calc:t-gross}} L | {{calc:b-gross}} L |
| − Driver | {{calc:t-driver}} L | {{calc:b-driver}} L |
| − Port tube ({{calc:pwt}} mm wall) | {{calc:t-port}} L | {{calc:b-port}} L |
| − Bracing | none | {{calc:b-bracing}} L |
| **Net** | **{{calc:t-net}} L** | **{{calc:b-net}} L** |

The tube's longest inside run is {{calc:t-longest}} cm, between the end caps, so its lowest standing wave is about {{calc:t-mode}} Hz, far above the 24 Hz the sub plays. Both cabinets tune to the same 23.8 Hz with that port: for the bass, only the net volume matters. The shape changes how much room the cabinet takes, how it's built and where its standing waves fall.

> **Rule of thumb:** a 12″ driver takes 2–4 L and a 10 cm port about 4 L, so in a small box the parts can be a tenth of the air. Take them off before you size the port.

## What the calculator can't tell you

- **Whether the box suits your driver.** For that, the [sealed box](/calculators/sealed-box/), [ported box](/calculators/ported-box/) or [subwoofer box](/calculators/subwoofer-box/) calculator gives the net volume to aim for.
- **The port's length for a tuning.** The [port length calculator](/calculators/port-length/) works it out for the net volume you get here.
- **Saw angles, cut lists and a 3D view.** Open the box in the simulator: its Build tab has them for every shape, and a FreeCAD export.

## Related guides

- [Non-rectangular speaker cabinets: cylinders, spheres and tapered boxes](/guides/shaped-cabinets/)
- [Polyfill and box stuffing: does it really make a box bigger?](/guides/box-stuffing/)
- [My port tunes higher (or lower) than designed: why, and how to fix it](/guides/port-tuning/)
- [Car subwoofer box design: sealed or ported?](/guides/car-subwoofer/)
