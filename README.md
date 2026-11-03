# Speaker Box Genius

**A modern, zero-install, browser-based loudspeaker enclosure simulator — the WinISD replacement the DIY audio community has been waiting for.**

> 🚧 **Early preview** at **https://daliusiv.github.io/speaker-box-genius/**. The plan lives in [`docs/build-plan.md`](docs/build-plan.md).

## What it does

- **Any mix of sealed, ported and passive radiator designs** (up to 8) side by side on one set of charts
- **Excursion redlines** for the woofer *and* the passive radiators at your chosen input power
- **Port air velocity** with a chuffing warning line
- **A T/S parameter editor that never overwrites what you typed.** Lock the values you trust; the rest are derived, and contradictions are flagged
- **Real-world net volume calculator**: boxes, cylinders, spheres, truncated pyramids, minus drivers, PRs, ports, bracing and crossover boards
- **Import** WinISD `.wdr` drivers; **measure** a driver from a `.zma` / DATS impedance sweep (with added-mass Vas)
- **High-pass filter, Linkwitz Transform and EQ**, alignment presets (Qtc 0.5–0.707, QB3/B4), port fit and chuffing checks
- **Metric or imperial**, and a WinISD mode (air constants, peak/RMS port speed) for like-for-like comparisons
- **Shareable links**: the whole simulation lives in the URL. **Share** gives you a forum image plus ready-to-paste Reddit / diyAudio text, and CSV of every curve
- **A community driver database** that lives right here in the repo: about 1,340 drivers from 15 brands (sources and credits in [`docs/data-sources.md`](docs/data-sources.md))

Everything runs in your browser. No accounts, no server, works offline.

## Accuracy

Results match **WinISD** to within 0.01 dB for ported and sealed boxes, and box tuning matches exactly for passive radiator boxes. See [`docs/validation.md`](docs/validation.md) for the comparisons, all of which run as automated tests.

## Contributing

There are two ways to help:

1. **Add drivers and passive radiators.** No coding needed. Use the [new driver form](../../issues/new?template=new-driver.yml) and copy the numbers from the manufacturer's datasheet. See [`drivers/README.md`](drivers/README.md).
2. **Work on the code.** See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Development

Requires Node.js 22.6+ and pnpm 10.

```bash
pnpm install
pnpm validate:db   # check every driver / PR file
pnpm test          # engine and database tests
pnpm dev           # run the web app locally
pnpm build         # production build (what GitHub Pages serves)
```

Pushing to `main` builds and deploys to GitHub Pages automatically.

## Licence

Speaker Box Genius is **free and source-available for non-commercial use**. It is not "open source" in the OSI sense, because it doesn't allow commercial resale.

- **Code**: [PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for personal, hobby, educational or non-profit purposes. Selling it or using it in a paid product needs permission.
- **Driver database and docs**: [CC BY-NC-SA 4.0](LICENSE-DATA).

The aim is simple: it was built by the community, so it stays free for the community.
