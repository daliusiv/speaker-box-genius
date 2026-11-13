---
title: "Box losses (Ql, Qa, Qp): what values should you use?"
description: What leakage, absorption and port losses are, what values real boxes have, how much they change the response and the impedance, and how to measure your own box's losses.
path: guides/box-losses
image: chart:losses-ql10/impedance
order: 13
group: measuring
---

# Box losses (Ql, Qa, Qp): what values should you use?

Every box simulator asks for three loss figures, usually with defaults nobody explains: WinISD's are Ql 10, Qa 100, Qp 100. Forum answers range from "leave them alone" to "use 7, everyone does" to "real boxes are 20". Here's what the three numbers mean, where they come from, what difference they make, and how to find the right ones for your box.

[[Open the example (Ql 10)|losses-ql10]]

## Where the three losses come from

Richard Small's analysis of the vented box describes its losses as three Q values, each measured at the box's tuning frequency [1]:

- **QL, leakage:** air escaping from the box other than through the port: through gaps in joints and gaskets, terminal cups, a vented pole piece, a porous dust cap or surround. The driver itself is often the leakiest part.
- **QA, absorption:** energy soaked up in the box: by stuffing and damping material, and by panels that flex.
- **QP, port losses:** friction and turbulence of the air in the port.

A **lower Q means more loss.** A Q of 100 is almost lossless; a Q of 5 is very lossy. The three combine like resistors in parallel into the box's total loss, QB: 1/QB = 1/QL + 1/QA + 1/QP.

In the app the three are in **Settings** (**Leak Ql**, **Absorb Qa**, **Port Qp**); clear a field to leave that loss out altogether (it shows "None"), as textbook alignment tables do.

## What values real boxes have

In most vented boxes **leakage is the biggest of the three**, which is why simulators usually give only QL a realistic value and set the other two high [1][2]. The history of the classic starting point, **QL = 7**, goes back to Small's measurements and Beranek's calculations of box Q values in the same range [2]. Measured boxes commonly come out between about **QL = 5 and 20**: a carefully built, glued and gasketed box at the high end, a box with a leaky driver or a removable back at the low end.

| Setting | Typical range | What gives a low value |
|---|---|---|
| Ql (leakage) | 5–20 (start at 7–10) | Leaky driver (porous dust cap, vented pole), poor seals, removable panels |
| Qa (absorption) | 10–100 (100 empty, lower when stuffed) | Lots of stuffing, flexing panels |
| Qp (port) | 50–100+ | Small, rough or long ports; high air speeds |

Neville Thiele, who first set out the vented-box alignments, noted that leakage has only a small effect in vented designs, and that it can be made up by a slightly larger box and a slightly higher driver Q [3].

## How much they matter

The example: a **Dayton Audio DSA215-8** in its QB3 ported box, 16.2 L tuned to {{num:losses-ql10/1/fb}} Hz.

| Ql (Qa, Qp 100) | F3 | Response at 40 Hz | Impedance peaks |
|---|---|---|---|
| 100 (no leakage) | {{num:losses-ql100/1/f3}} Hz | {{num:losses-ql100/1/rel@40}} dB | {{num:losses-ql100/1/zlo}} Ω and {{num:losses-ql100/1/zpk}} Ω |
| 20 | {{num:losses-ql20/1/f3}} Hz | {{num:losses-ql20/1/rel@40}} dB | {{num:losses-ql20/1/zlo}} Ω and {{num:losses-ql20/1/zpk}} Ω |
| 10 (WinISD's default) | {{num:losses-ql10/1/f3}} Hz | {{num:losses-ql10/1/rel@40}} dB | {{num:losses-ql10/1/zlo}} Ω and {{num:losses-ql10/1/zpk}} Ω |
| 7 (the classic value) | {{num:losses-ql7/1/f3}} Hz | {{num:losses-ql7/1/rel@40}} dB | {{num:losses-ql7/1/zlo}} Ω and {{num:losses-ql7/1/zpk}} Ω |
| 5 | {{num:losses-ql5/1/f3}} Hz | {{num:losses-ql5/1/rel@40}} dB | {{num:losses-ql5/1/zlo}} Ω and {{num:losses-ql5/1/zpk}} Ω |
| 3 | {{num:losses-ql3/1/f3}} Hz | {{num:losses-ql3/1/rel@40}} dB | {{num:losses-ql3/1/zlo}} Ω and {{num:losses-ql3/1/zpk}} Ω |

![Impedance with Ql 10: two peaks ({{num:losses-ql10/1/zlof}} Hz and {{num:losses-ql10/1/zpkf}} Hz) and the dip at the tuning between them.](chart:losses-ql10/impedance)

![The same box with Ql 5: the dip stays at the tuning, but both peaks come down.](chart:losses-ql5/impedance)

Going from a nearly perfect box (Ql 100) to a typical one (Ql 7–10) raises the F3 by {{diff:losses-ql10/1/losses-ql100/1/f3:0}}–{{diff:losses-ql7/1/losses-ql100/1/f3:0}} Hz and costs about {{diff:losses-ql100/1/losses-ql7/1/rel@40:0}} dB around the tuning. Even a leaky box (Ql 5) keeps its tuning frequency. Losses change **how much** the port helps, not **where** it tunes.

The other two losses, for comparison (with Ql 10):

| Losses | F3 | What changes |
|---|---|---|
| Ql 10, Qa 100, Qp 100 | {{num:losses-ql10/1/f3}} Hz | The reference |
| Absorption Qa 10 (heavily stuffed) | {{num:losses-qa10/1/f3}} Hz | The upper impedance peak drops sharply (to {{num:losses-qa10/1/zpk}} Ω) |
| Port Qp 10 (a lossy port) | {{num:losses-qp10/1/f3}} Hz | The lower impedance peak drops (to {{num:losses-qp10/1/zlo}} Ω); less port output |

## How to measure your box's losses

The losses show up most clearly in the **impedance** curve: more loss means **lower peaks**, while the dip stays at the tuning. Small described a full method for working out QL, QA and QP from impedance measurements [4]. In practice, there's an easier way with a simulator:

1. Measure your box's impedance (DATS, REW, ARTA or similar) at a low level, after measuring the driver's own T/S parameters.
2. Load the measurement into the app with the **Measured** card (`.zma`), and look at the **Impedance** chart.
3. Adjust **Leak Ql** in **Settings** until the simulated peaks are the same height as the measured ones. If the upper peak is too high and the lower one about right, lower **Absorb Qa** instead; if it's the lower peak, lower **Port Qp**.
4. Keep those values for that box: the simulation now includes its real losses.

Fit the driver's parameters first: an error in the driver's Qms looks just like box losses on an impedance curve.

## Sealed boxes

A sealed box can't use a port's resonance, so its losses matter less, but they're not zero: leakage lowers its output at the bottom a little. In the app the same Ql applies: for the DSA215-8's sealed box, Ql 10 instead of 100 moves the F3 from {{num:losses-sealed-ql100/1/f3:0}} Hz to {{num:losses-sealed-ql10/1/f3:0}} Hz. Stuffing in a sealed box mostly makes it act a little larger (and raises its losses), which is why stuffed sealed boxes are often simulated as larger than they are. How much larger, and how to model and measure it, is in the [box stuffing guide](/guides/box-stuffing/).

VituixCAD's Qa also makes the box act larger (+1.4 % at Qa 100, +11.3 % at Qa 10). Settings → Box losses → Absorption, or Settings → Match → VituixCAD, does the same.

## What to use

- **Designing, before you build:** Ql **7–10**, Qa and Qp **100**. That's the conservative middle of the range, and WinISD's default, so results compare.
- **A heavily stuffed box:** lower Qa (20–50); see the [box stuffing guide](/guides/box-stuffing/).
- **Checking a built box:** measure the impedance and fit the losses as above.
- **Comparing with WinISD:** keep its defaults, 10 / 100 / 100.

[[Open the example with Ql 10|losses-ql10]] [[Open it with Ql 5|losses-ql5]]

## Sources

1. R. H. Small, "Vented-Box Loudspeaker Systems, Part I: Small-Signal Analysis", *J. Audio Eng. Soc.* 21 (5), 363–372, June 1973: the QL, QA and QP losses and their effect on response and efficiency. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=1967).
2. Claus Futtrup (SEAS), [Designing Loudspeaker Boxes](https://www.cfuttrup.com/blogspot/Book_05_Futtrup.pdf): the history of QL = 7 as a starting value, Beranek's box Q calculations, and leakage in the drivers themselves.
3. Neville Thiele, [The loudspeaker parameters and their evolution](https://www.ioa.org.uk/system/files/proceedings/n_thiele_the_loudspeaker_parameters_and_their_evolution.pdf), *Proceedings of the Institute of Acoustics* 31 (4), 2009: QL has a small effect in vented designs, remedied by a somewhat larger box and slightly higher QT.
4. R. H. Small, "Vented-Box Loudspeaker Systems, Part IV: Appendices", *J. Audio Eng. Soc.* 21 (8), 635–639, October 1973: evaluating leakage, absorption and vent losses from impedance measurements. [AES E-Library](https://aes2.org/publications/elibrary-page/?id=1941).
5. Speaker Box Genius [validation against WinISD](https://speakerboxgenius.com/validation/#winisd-ported-ql7), including a ported box with leakage Ql 7.
