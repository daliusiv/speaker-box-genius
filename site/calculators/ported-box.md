## How the box is worked out

Pick a driver and the calculator offers the vented alignments that suit it, each a box volume and a tuning:

- **QB3** (quasi-Butterworth third order): the smallest box that stays flat. WinISD's wizard sizes it for Qts up to about 0.62, and the calculator does the same sum, with the 0.1 Ω amplifier resistance WinISD adds to the driver's own.
- **C4** (Chebyshev): about the same box, tuned a little lower, with a small ripple above the roll-off in exchange for a little more extension. Flat versions are called SC4.
- **BB4** (boom box): tuned to the driver's Fs, in a smaller box, with a peak before the roll-off. The flat version is SBB4.

Only the families the driver gets are shown. Hover a chip for what it does. **Other…** takes your own net volume and tuning instead. The sums are the simulator's own, checked against WinISD's wizard for 19 drivers on the [validation page](/validation/).

Then the port. The calculator tries the ports a box this size can hold straight, simplest first: one round tube, two tubes, a flared tube, a slot along a wall. It takes the first one whose air speed stays under {{calc:limit}} m/s at the power you set, or the quietest if none does. The same pick is what **Size all boxes** makes in the simulator. The air speed and the cone's excursion are the simulator's peak values above the box's F3 (at least 20 Hz), for one driver or the number you give.

**Fine-tune the port** opens the [port length calculator](/calculators/port-length/) with this box, tuning, port and driver filled in, to try other sizes, slots and end corrections. **Open this box in the simulator** carries the box and its port into the app. A sealed box needs no port: see the [sealed box calculator](/calculators/sealed-box/).

> **Common trap:** an air speed over {{calc:limit}} m/s is a rule of thumb for chuffing, not a wall. Flared ends get away with more, and a port only chuffs on the notes that make it move. But a port that fits easily is often a port that is too small for the power.

## Worked example: a 12-inch sub at {{calc:w}} W

A Dayton Audio RSS315HF-4 (Xmax {{calc:xmax}} mm) at {{calc:w}} W, in the three boxes the calculator offers it, each with the port it picks:

| Alignment | Box | F3 | Port | Port air speed | Cone excursion |
|---|---|---|---|---|---|
| QB3 | {{calc:qb3-vb}} at {{calc:qb3-fb}} | {{calc:qb3-f3}} | {{calc:qb3-port}} | {{calc:qb3-v}} | {{calc:qb3-x}} |
| C4 | {{calc:c4-vb}} at {{calc:c4-fb}} | {{calc:c4-f3}} | {{calc:c4-port}} | {{calc:c4-v}} | {{calc:c4-x}} |
| BB4 | {{calc:bb4-vb}} at {{calc:bb4-fb}} | {{calc:bb4-f3}} | {{calc:bb4-port}} | {{calc:bb4-v}} | {{calc:bb4-x}} |

![The relative response of the three boxes at {{calc:w}} W: QB3 and C4 almost on top of each other, BB4 smaller and rolling off higher.](chart:ported-box-example/response)

QB3 and C4 are the same box for practical purposes: the C4's ripple is {{calc:c4-db}} dB, too small to hear, and the two curves overlap. BB4 is nearly a quarter smaller, but it gives up bass: its F3 is {{calc:bb4-f3}}, against {{calc:qb3-f3}} for QB3, and it peaks a little before the roll-off.

The cone is fine in all three, inside its {{calc:xmax}} mm Xmax. The ports are not: all three are over the line. The quietest port that fits straight in the QB3 box is a flared {{calc:qb3-port}} one, and its air still reaches {{calc:qb3-v}}, well over the {{calc:limit}} m/s line. A 10 cm tube would be quieter but is too long to fit straight in a box this size, as the [port length calculator](/calculators/port-length/) shows. Deep tuning in a big box needs a lot of port area, and port area costs length.

So at {{calc:w}} W this box wants a different answer from a short round port: a slot folded along the walls, two ports, a [passive radiator](/guides/passive-radiator-box/), or less power. Try them on the port length page with **Fine-tune the port**.

> **Rule of thumb:** a port that fits easily is often a port that is too small. Check the air speed before you cut the hole.

## What the calculator can't tell you

- **How the port will really tune.** Build it, then measure the impedance: the dip between the two peaks is the real tuning. [Why ports tune away from their design, and how to fix it](/guides/port-tuning/).
- **How loud the port gets.** {{calc:limit}} m/s is a rule of thumb for when a port starts to chuff. [How big should my port be?](/guides/port-chuffing/)
- **Whether this box is the right kind for you.** [Sealed, ported or passive radiator: which box for your driver?](/guides/sealed-vs-ported/) Open the box in the simulator for the response, maximum SPL, group delay and the rest.

## Related guides

- [Port chuffing: how big should my port be?](/guides/port-chuffing/)
- [Sealed, ported or passive radiator: which box for your driver?](/guides/sealed-vs-ported/)
- [Round port vs slot port](/guides/round-vs-slot-port/)
- [My port tunes higher (or lower) than designed](/guides/port-tuning/)
