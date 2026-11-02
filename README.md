# Speaker Box Genius

**A modern, zero-install, browser-based loudspeaker enclosure simulator — the WinISD replacement the DIY audio community has been waiting for.**

> 🚧 **Early development.** The plan lives in [`docs/build-plan.md`](docs/build-plan.md). The app is not usable yet — watch the repo or join in.

## What it will do

- **Sealed, ported, single and dual passive radiator** designs side by side on one chart
- **Excursion redlines** for the woofer *and* the passive radiators at your chosen input power
- **Port air velocity** with a chuffing warning line
- **A T/S parameter editor that never overwrites what you typed.** Lock the values you trust; the rest are derived, and contradictions are flagged
- **Real-world net volume calculator**: boxes, cylinders, spheres, truncated pyramids, minus drivers, PRs, ports, bracing and crossover boards
- **Import** WinISD `.wdr` drivers, DATS exports and `.zma` impedance files
- **Shareable links**: the whole simulation lives in the URL. Paste it on diyAudio or Reddit instead of five blurry screenshots
- **A community driver database** that lives right here in the repo

Everything runs in your browser. No accounts, no server, works offline.

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
