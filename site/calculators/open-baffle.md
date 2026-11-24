## How it's worked out

Below its peak an open baffle is a dipole: the back of the cone, out of phase with the front, reaches the listener round the board's edges and cancels the bass, 6 dB more for each octave down. The shorter that path round the board (the path D), the higher the bass starts to go. Above the peak the two waves add and cancel in turn, so the response ripples, with its first null near where the path is a whole wavelength.

The calculator uses the simulator's own open baffle model. A flat board's edges are rows of edge sources, summed to every order and taken over the cone's real size, checked against boundary-element solutions of 23 thin and 9 thick boards (see the [validation page](/validation/)). A frame adds the duct its depth makes behind the driver, with its quarter-wave resonance, and the sound comes round the frame as a block, checked against boundary-element solutions of seven frames. With a driver, the numbers come from a run of the full simulator, the same as the Open baffle card in the app.

The Dipole EQ is the app's own (**Boxes → Open baffle → Dipole EQ**): a 6 dB/octave low shelf that lifts the bass the dipole loses, and a cut at the peak, fitted to this board's response against the same driver in a wall. Then it's turned down until the cone stays within Xmax at your power.

**Board for a peak at …** goes the other way: enter the dipole peak you want (about twice your crossover frequency, so the peak sits above the band the driver plays) and the board's shape. It gives the width and height of a flat board with that peak, with the driver centred across and half or a third of the way up.

## Worked example: two 12-inch drivers on a 45 × 100 cm board

The app's default open baffle (45 cm wide, 100 cm tall, the driver centred across and 35 cm up), at 1 W, with two 12-inch drivers from the database:

| | SB Acoustics SB34NRX75-16 | Dayton Audio RSS315HF-4 |
|---|---|---|
| Qts, Fs | {{calc:p-qts}}, {{calc:p-fs}} Hz | {{calc:r-qts}}, {{calc:r-fs}} Hz |
| Suits | {{calc:p-suits}} | {{calc:r-suits}} |
| Dipole peak / first null | {{calc:p-peak}} Hz / {{calc:p-null}} Hz | {{calc:r-peak}} Hz / {{calc:r-null}} Hz |
| F3 without EQ | {{calc:p-f3}} Hz | {{calc:r-f3}} Hz |
| Bass at 40 Hz below the same driver in a wall | {{calc:p-loss}} dB | {{calc:r-loss}} dB |
| Dipole EQ shelf | {{calc:p-shelf}} | {{calc:r-shelf}} |
| F3 with the Dipole EQ | {{calc:p-f3eq}} Hz | {{calc:r-f3eq}} Hz |
| Bass at 40 Hz with the EQ | {{calc:p-losseq}} dB below | {{calc:r-losseq}} dB below |
| Cone excursion at 1 W with the EQ | {{calc:p-x}} mm of {{calc:p-xmax}} mm | {{calc:r-x}} mm of {{calc:r-xmax}} mm |

![The SB Acoustics SB34NRX75-16 on the 45 × 100 cm board at 1 W: open baffle, with the Dipole EQ, and the same driver in a wall. Relative response, from the app.](chart:ob-calc/response)

**The board sets the peak, the driver sets the bass.** The same board gives both drivers the same path and nearly the same peak and null. What differs is the bass below it: the SB34NRX75-16 has a fairly high Qts and a low Fs, so its own rise towards resonance lands in the bass and makes up part of what the dipole loses: it suits an open baffle with no EQ. The RSS315HF-4 has a low Qts, and on an open baffle it needs the shelf and the cone travel to take it.

**The EQ costs travel.** Every dB of shelf asks for more cone movement at the bottom, which is why the Dipole EQ is turned down until the cone stays within Xmax: at a higher power you get less shelf. Try your amplifier's power to see how much is left.

> **Rule of thumb:** a bigger board moves the peak down but does little for the deep bass. Below the peak an open baffle falls 6 dB per octave whatever its size; EQ and cone area are what win the bass back.

## What the calculator can't tell you

- **How it sounds in your room.** A dipole sends no sound to the sides and excites a room's modes less, and the wall behind it adds its own reflection. Place it at least a metre from the wall behind and try it there.
- **The baffle's other effects.** The calculator shows the response straight ahead. Open the board in the simulator for the impedance, cone excursion at any power and maximum SPL.
- **A measured board.** Every check so far is against boundary-element solutions on axis, not a measurement; H-frames' peaks come out 3–8 % high.

## Related guides

- [Open baffle speakers: board size, woofer choice and what the EQ really costs](/guides/open-baffle/)
- [Infinite baffle subwoofers](/guides/infinite-baffle/)
- [Baffle step: why your speaker sounds thin](/guides/baffle-step/)
- [Thiele/Small parameters explained](/guides/thiele-small-parameters/)
