## How the length is worked out

A port and the air in the box make a Helmholtz resonator: the air in the port is a mass, the air in the box is a spring, and the box tunes to the frequency where they resonate. More port area, or a smaller box, needs a longer port for the same tuning.

The calculator finds the effective length that gives your tuning, then takes off the end corrections: the air just outside each end moves with the port, so the port acts longer than it is. That's the same sum WinISD does, with its three end options:

- **One end flanged** (0.732 × diameter): the inner end free, the outer end flush with the baffle. WinISD's default, and right for most tubes.
- **Both ends flanged** (0.85): both ends flush with a wall, as a port that runs right through a thick baffle.
- **Both ends free** (0.613): a tube standing clear of walls at both ends.
- **Slot along a wall** (1.2, slot ports only): a slot made from the box's own walls. Its walls carry on past the inner end, so it tunes lower than any free-tube end correction says. Nobody can work out exactly how much, so the calculator gives a range ({{calc:wall-low}}–{{calc:wall-high}} Hz in the example below).

Flared (rounded) ends count too: the flares are wider than the tube, so a flared port is a little longer for the same tuning. The numbers are the simulator's own (same model, same air), checked against WinISD on the [validation page](/validation/).

> **Common trap:** using the box's gross volume. The port tunes the air that's left after the driver, bracing and the port itself take their share. Tick "Take the port's own volume off" if your volume doesn't allow for the port yet; the calculator settles the length and the smaller volume together.

## Worked example: a 12-inch sub in 75 litres at 25 Hz

A Dayton Audio RSS315HF-4 in {{calc:vb}} L net, tuned to {{calc:fb}} Hz, at 250 W (its cone reaches {{calc:x}} mm, inside its 14.3 mm Xmax). Five ports that all tune the box to 25 Hz:

| Port | Length | Fits straight? | Peak air speed |
|---|---|---|---|
| 7.5 cm (3″) round | {{calc:r75}} | yes | {{calc:v75}} |
| 10 cm (4″) round | {{calc:r100}} | no | {{calc:v100}} |
| 15 cm (6″) round | {{calc:r150}} | no | {{calc:v150}} |
| Two 10 cm round | {{calc:r2x100}} | no | {{calc:v2x100}} |
| 30 × 5 cm slot along a wall | {{calc:slot}} | no, but it runs along two walls | {{calc:vslot}} |

The 3-inch port is the one a quick calculator suggests because it's short and fits, and it's the one that would chuff: its air peaks at three times the 17 m/s line. Every quiet option is long: deep tuning in a big box needs a lot of port area, and port area costs length. That's why big subwoofer boxes end up with slots folded along the walls, or with [passive radiators](/guides/passive-radiator-box/) instead.

> **Rule of thumb:** check the air speed before the length. A port that fits easily is often a port that's too small.

## What the calculator can't tell you

- **How the port will really tune.** Build it, then measure the impedance: the dip between the two peaks is the real tuning. [Why ports tune away from their design, and how to fix it](/guides/port-tuning/).
- **How loud the port gets.** 17 m/s is a rule of thumb for when a port starts to chuff. Flared ends get away with more. [How big should my port be?](/guides/port-chuffing/)
- **Whether the box is right for the driver.** Open the result in the simulator to see the response, cone excursion and maximum SPL, and try other sizes.

## Related guides

- [Port chuffing: how big should my port be?](/guides/port-chuffing/)
- [Round port vs slot port](/guides/round-vs-slot-port/)
- [My port tunes higher (or lower) than designed](/guides/port-tuning/)
- [Sealed, ported or passive radiator?](/guides/sealed-vs-ported/)
