## How the added mass is worked out

A passive radiator is a port with a spring: a cone with no motor, whose mass resonates against the box air and its own suspension. The box tunes to that resonance, so the tuning is set by three things: the box volume, the PR's moving mass and its suspension (its Vas). You can't change the box once it's built or the PR's suspension, so you tune with mass. Most PRs come with a threaded bolt or a set of disks for it.

The calculator finds the moving mass that puts the resonance on your tuning, then takes off the PR's own Mms: what's left is the mass to add. It's the same model as a PR design in the simulator, which matches WinISD's PR boxes within 0.01 dB on the [validation page](/validation/).

Two numbers come with it:

- **Tuning with no added mass.** The highest these PRs can tune this box. If your target is above it, no mass will get you there: the PR is too heavy (or too soft) for this box. Use more PRs, a smaller box, or a lighter PR.
- **Displacement at Xmax** (Sd × Xmax). How much air the PRs can move before they run out of travel. Near the tuning most of the sound comes from the PRs, so they have to move more air than the cone does.

> **Common trap:** splitting the added mass by the number of PRs. Two PRs need *more* mass each than one, not half: the box air is shared, so each PR sees a stiffer spring. The calculator's "per PR" figure already allows for it.

## Worked example: a 12-inch sub in 75 litres at 25 Hz

A Dayton Audio RSS315HF-4 (Xmax {{calc:xmax}} mm) in {{calc:vb}} L net, tuned to {{calc:fb}} Hz, at {{calc:w}} W. The same box as the [port length calculator's](/calculators/port-length/) example, where every quiet port was too long to fit straight. Six ways to do it with 12-inch PRs:

| PRs | Added mass each | × own mass | Displacement vs the cone | PR travel when the cone hits Xmax | F3 |
|---|---|---|---|---|---|
| 1 × Dayton RSS315-PR | {{calc:rss1-mass}} | {{calc:rss1-ratio}} | {{calc:rss1-vd}} | {{calc:rss1-use}} | {{calc:rss1-f3}} |
| 2 × Dayton RSS315-PR | {{calc:rss2-mass}} | {{calc:rss2-ratio}} | {{calc:rss2-vd}} | {{calc:rss2-use}} | {{calc:rss2-f3}} |
| 1 × Dayton DS315-PR | {{calc:ds1-mass}} | {{calc:ds1-ratio}} | {{calc:ds1-vd}} | {{calc:ds1-use}} | {{calc:ds1-f3}} |
| 2 × Dayton DS315-PR | {{calc:ds2-mass}} | {{calc:ds2-ratio}} | {{calc:ds2-vd}} | {{calc:ds2-use}} | {{calc:ds2-f3}} |
| 4 × Dayton DS315-PR | {{calc:ds4-mass}} | {{calc:ds4-ratio}} | {{calc:ds4-vd}} | {{calc:ds4-use}} | {{calc:ds4-f3}} |
| 1 × SB Acoustics SB34NRX-00 | {{calc:sb1-mass}} | {{calc:sb1-ratio}} | {{calc:sb1-vd}} | {{calc:sb1-use}} | {{calc:sb1-f3}} |

What the table says:

- **One RSS315-PR keeps up, just.** It reaches {{calc:rss1-use}} of its travel when the cone reaches Xmax: inside its limit, but past the 75 % where a PR's suspension starts to stiffen. Two of them use half their travel and go deeper, for the price and room of a second PR.
- **The cheaper DS315-PR runs out first.** One hits its Xmax with the cone at less than half of its own. Two still run out first, and four keep up only with {{calc:ds4-ratio}} its own mass hung on each cone, which the calculator flags (more than 3 × is asking a suspension to carry a lot). No number of DS315-PRs up to six passes both tests in this box.
- **The SB34NRX-00 is too heavy for this box.** With no added mass it already tunes to {{calc:sb1-bare}}, below the 25 Hz target, and mass can only lower it. It suits a bigger box or a lower tuning.

> **Rule of thumb:** "PR displacement twice the driver's" is a starting point, not a test. One RSS315-PR passes at {{calc:rss1-vd}} the cone's displacement; two DS315-PRs, with about the same, run out first. Near the tuning the PRs move several times the cone's air, and how many times depends on the PR's own suspension and mass, which the rule of thumb doesn't see. The simulation does.

## What the calculator can't tell you

- **How the box will really tune.** PR datasheets vary, and Vas and Mms are hard to measure. Build it, then measure the impedance: the dip between the two peaks is the real tuning. Add or remove mass to move it.
- **Whether the PRs fit.** A box this size has faces about 42 cm across inside: room for one 12-inch PR on each big face, not four on one. The simulator's volume calculator and build sheet check it.
- **How loud it goes, and how it sounds.** Open the result in the simulator to see the response, both excursions, the PR's own notch below the tuning and the maximum SPL, and to try a port or a sealed box of the same size.

## Related guides

- [How to design a passive radiator box](/guides/passive-radiator-box/)
- [Sealed, ported or passive radiator?](/guides/sealed-vs-ported/)
- [Port length calculator](/calculators/port-length/)
- [Car subwoofer box design](/guides/car-subwoofer/)
