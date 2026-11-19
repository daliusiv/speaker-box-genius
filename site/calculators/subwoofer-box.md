## How the three boxes are picked

Each box is sized by a fixed rule from your driver's Thiele/Small parameters, then simulated at your amplifier's power. The boxes are the ones the simulator's one-click presets give, so opening one in the simulator shows the same numbers.

**Ported**

- **Balanced** is QB3, the flat vented alignment, sized as WinISD's wizard sizes it. It needs a driver with a Qts up to about 0.62.
- **Compact** is BB4, the boom box: tuned to the driver's Fs in a smaller box, with a peak of a decibel or so before it rolls off.
- **Deep** is the balanced box made half as big again and tuned to the lowest F3 it reaches without a peak of more than 0.5 dB. Tune it lower than that and the response sags above the tuning, so F3 rises again.

**Sealed**

- **Balanced** is a Qtc of 0.707, the flat sealed alignment.
- **Compact** is a Qtc of 0.9: a smaller box, with a bump of bass above the roll-off.
- **Deep** is a Qtc of 0.577, a bigger box with a gentler roll-off and the least overshoot.
- No sealed box is bigger than twice the driver's Vas: past that it adds little bass. A driver whose Qts is close to the target Qtc hits that limit, and the card says what Qtc the capped box gives instead.

Each port is the simplest that fits straight inside the box and stays under the chuffing line at the driver's power rating, or the quietest one if none does: a round tube, two tubes, a flared tube or a slot. If a box can't be made (a Qts too high for QB3, or no BB4 for the driver), its card says why.

> **Common trap:** reading the litres as the outside size. Every volume here is net: after the driver, the bracing and the port. The [port length calculator](/calculators/port-length/) can take the port's own volume off, and the simulator's volume calculator does the driver and bracing.

## Worked example: a 12-inch sub at {{calc:w}} W

A Dayton Audio RSS315HF-4 (Fs 24.2 Hz, Qts 0.39, Vas 84.1 L, Xmax {{calc:xmax}} mm) at {{calc:w}} W, ported. The calculator's three boxes:

| Box | Net volume | Tuning | F3 | Output at 30 Hz | Cone | Port air |
|---|---|---|---|---|---|---|
| Compact (BB4) | {{calc:p-compact-vb}} L ({{calc:p-compact-ft}} ft³) | {{calc:p-compact-fb}} Hz | {{calc:p-compact-f3}} Hz | {{calc:p-compact-spl}} dB | {{calc:p-compact-x}} mm | {{calc:p-compact-air}} m/s |
| Balanced (QB3) | {{calc:p-balanced-vb}} L ({{calc:p-balanced-ft}} ft³) | {{calc:p-balanced-fb}} Hz | {{calc:p-balanced-f3}} Hz | {{calc:p-balanced-spl}} dB | {{calc:p-balanced-x}} mm | {{calc:p-balanced-air}} m/s |
| Deep | {{calc:p-deep-vb}} L ({{calc:p-deep-ft}} ft³) | {{calc:p-deep-fb}} Hz | {{calc:p-deep-f3}} Hz | {{calc:p-deep-spl}} dB | {{calc:p-deep-x}} mm | {{calc:p-deep-air}} m/s |

![Relative response of the three ported boxes at {{calc:w}} W: Compact (orange), Balanced (light orange) and Deep (dark orange). Deep reaches lowest, with F3 at {{calc:p-deep-f3}} Hz against {{calc:p-balanced-f3}} Hz for Balanced.](chart:subwoofer-example/response)

What the table says:

- **Balanced is the one to start from.** Its F3 is {{calc:p-balanced-f3}} Hz, {{calc:p-balanced-fb}} Hz tuning, and it is {{calc:p-balanced-spl}} dB at 30 Hz, the loudest of the three there.
- **Compact costs {{calc:gap-compact}} Hz of F3** for a box of {{calc:p-compact-vb}} L against {{calc:p-balanced-vb}} L, and plays {{calc:gain-compact}} dB less at 30 Hz. Its response peaks a little above its roll-off, which is the price of the smaller box.
- **Deep goes lowest** ({{calc:p-deep-f3}} Hz) but needs {{calc:p-deep-vb}} L, half as big again, and plays {{calc:gain-deep}} dB less at 30 Hz than Balanced: what the bigger box adds is further down.
- **Every port chuffs.** At {{calc:w}} W every port that fits straight inside a 12-inch sub's box, tuned this low, is over the 17 m/s line: a round tube, two tubes, a flared tube or a slot. A port big enough to stay quiet is too long to fit. Open the box in the simulator or use the [port length calculator](/calculators/port-length/) to try a slot along a wall or two ports, or use [passive radiators](/calculators/passive-radiator/), which have no air speed to worry about.

The same driver sealed, at the same power:

| Box | Net volume | Qtc | F3 | Output at 30 Hz | Cone |
|---|---|---|---|---|---|
| Compact | {{calc:s-compact-vb}} L ({{calc:s-compact-ft}} ft³) | {{calc:s-compact-qtc}} | {{calc:s-compact-f3}} Hz | {{calc:s-compact-spl}} dB | {{calc:s-compact-x}} mm |
| Balanced | {{calc:s-balanced-vb}} L ({{calc:s-balanced-ft}} ft³) | {{calc:s-balanced-qtc}} | {{calc:s-balanced-f3}} Hz | {{calc:s-balanced-spl}} dB | {{calc:s-balanced-x}} mm |
| Deep | {{calc:s-deep-vb}} L ({{calc:s-deep-ft}} ft³) | {{calc:s-deep-qtc}} | {{calc:s-deep-f3}} Hz | {{calc:s-deep-spl}} dB | {{calc:s-deep-x}} mm |

A sealed box gives up about {{calc:gap-sealed}} Hz of F3 against the balanced ported one, with no port to chuff. The sealed boxes' F3 barely moves with size: the Deep box's {{calc:s-deep-vb}} L buys {{calc:gain-sealed}} dB at 30 Hz over Balanced, not a lower F3. And at {{calc:w}} W the Deep sealed box's cone reaches {{calc:s-deep-x}} mm, past the {{calc:xmax}} mm Xmax: the calculator flags it.

> **Rule of thumb:** pick the box, then check the port and the cone. A bigger box and a lower tuning move air, and they need the port area or the excursion to match.

## What the calculator can't tell you

- **Your box, built.** The numbers are for the net volume and port given. [Why ports tune away from their design, and how to fix it](/guides/port-tuning/).
- **The room or the car.** The curves are free-field, half-space. In a car the cabin lifts the bass, which suits a smaller box: see the [car subwoofer guide](/guides/car-subwoofer/).
- **Whether one sub is enough.** [One 15″ or two 10s?](/guides/one-15-vs-two-10s/)
- **Everything else the simulator does.** Open a box there to see cone excursion, maximum SPL, group delay and stuffing.

## Related guides

- [Sealed, ported or passive radiator: which box for your driver?](/guides/sealed-vs-ported/)
- [Port chuffing: how big should my port be?](/guides/port-chuffing/)
- [Car subwoofer box](/guides/car-subwoofer/)
- [One 15″ or two 10s?](/guides/one-15-vs-two-10s/)
