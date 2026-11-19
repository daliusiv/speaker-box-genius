## How the box is worked out

A sealed box's air acts as a spring added to the driver's own suspension, so the box raises the resonance and the Q together: Qtc = Qts × √(1 + Vas ÷ Vb). The calculator solves that for the volume you need, then simulates the finished box with the app's own model, for the Qtc and resonance it really reads, F3 and F10, cone excursion at your power, and the output at 30 Hz.

The box is sized the way WinISD sizes it, which counts two small things the textbook formula leaves out: the 0.1 Ω of amplifier and cable in front of the coil, and the damping of the box's own air (Qa 100). So the box comes out a few per cent bigger than the plain formula gives, and it reads a hair under the Qtc you asked for (0.705 for 0.707, as in WinISD). With more than one driver the volume is for all of them together. The numbers are the simulator's own, checked against WinISD on the [validation page](/validation/).

**Qtc for my box** goes the other way: enter the net volume (after the driver, bracing and any port or crossover have taken their share) and read off what it gives.

> **Common trap:** using the box's gross volume. A sealed box's air is what's left after the driver's magnet and frame, the bracing and the crossover take their share. Enter the net volume, or the Qtc will read lower than the real box gives.

### When the box gets huge, or doesn't exist

- **Qts is too high for the Qtc.** A box only raises the Q, so a driver with a Qts of 0.5 can't make a Qtc 0.5 box, however big. The calculator says so instead of giving a volume.
- **Past 2 × Vas.** When the target is close to the driver's own Qts, the volume runs away: a Qts of 0.68 asks for over 10 × Vas to reach Qtc 0.707. The simulator's sealed preset stops at 2 × Vas and takes the Qtc that box gives (Qts × √1.5, so 0.83 for that driver). The calculator gives you the volume you asked for, and a note when it's past that line: a driver's Qts varies by 10 % or more from one sample to the next, so a box sized to a Qtc this near the Qts could miss by a long way.

## Worked example: a 12-inch sub, three Qtc targets

A Dayton Audio RSS315HF-4 (Fs 24.2 Hz, Qts 0.39, Vas 84.1 L, Xmax {{calc:xmax}} mm) at {{calc:w}} W, in the box the calculator gives for each Qtc:

| Target Qtc | 0.577 | 0.707 | 0.9 |
|---|---|---|---|
| Net box volume | {{calc:a-vb}} L ({{calc:a-ft3}} ft³) | {{calc:b-vb}} L ({{calc:b-ft3}} ft³) | {{calc:c-vb}} L ({{calc:c-ft3}} ft³) |
| Qtc it reads | {{calc:a-qtc}} | {{calc:b-qtc}} | {{calc:c-qtc}} |
| Fc | {{calc:a-fc}} Hz | {{calc:b-fc}} Hz | {{calc:c-fc}} Hz |
| F3 | {{calc:a-f3}} Hz | {{calc:b-f3}} Hz | {{calc:c-f3}} Hz |
| F10 | {{calc:a-f10}} Hz | {{calc:b-f10}} Hz | {{calc:c-f10}} Hz |
| Cone excursion at {{calc:w}} W | {{calc:a-x}} mm | {{calc:b-x}} mm | {{calc:c-x}} mm |
| Output at 30 Hz | {{calc:a-spl}} dB | {{calc:b-spl}} dB | {{calc:c-spl}} dB |

![The RSS315HF-4 in the three boxes at {{calc:w}} W: relative response, from the app.](chart:sealed-calc/response)

**F3 barely moves; F10 does.** The biggest box is nearly twice the size of the middle one and almost four times the smallest, yet F3 only goes from {{calc:c-f3}} Hz to {{calc:a-f3}} Hz. The low-Q boxes start rolling off earlier but fall more gently, so lower down they're far ahead: F10 drops from {{calc:c-f10}} Hz to {{calc:a-f10}} Hz, and the output at 30 Hz rises by {{calc:spl-gain}} dB. That's the size you pay for, and what a bigger box buys.

**The biggest box needs the most cone.** At {{calc:w}} W the Qtc 0.577 box takes the cone to {{calc:a-x}} mm, just past the {{calc:xmax}} mm Xmax; the other two stay inside. A bigger box lets the cone move further for the same power, so it needs a lower power, or a subsonic filter, before it can take the full {{calc:w}} W.

> **Rule of thumb:** look at F10, not F3, when you compare sealed boxes. F3 hides how much deep bass a box keeps.

## What the calculator can't tell you

- **How the box sounds in a room.** A room adds bass below its lowest mode, so a gently rolling-off box and a peaked one can end up closer than the curves suggest. [What Qtc does in a room](/guides/sealed-qtc/).
- **How stuffing and leaks change it.** Stuffing makes the box act bigger, and leaks and absorption damp it; the simulator models all three, so open the box there to try them.
- **Whether sealed is the right box.** The same driver in a ported or passive radiator box plays louder near the tuning, in a bigger box. [Compare them](/guides/sealed-vs-ported/).

## Related guides

- [Sealed box Qtc: 0.5, 0.707 or 1.1, and what you'll hear](/guides/sealed-qtc/)
- [Sealed, ported or passive radiator?](/guides/sealed-vs-ported/)
- [Thiele/Small parameters explained](/guides/thiele-small-parameters/)
