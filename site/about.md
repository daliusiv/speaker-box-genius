# About Speaker Box Genius

Speaker Box Genius is a free loudspeaker box simulator that runs in your browser: sealed, ported, passive radiator, bandpass and transmission line boxes, with the cone's travel, the port's air speed and the amplifier's power on the same charts. It's meant as a modern WinISD: nothing to install, works on a phone, and a design is a link you can post.

It's built by one person, [daliusiv](https://github.com/daliusiv), in the open on [GitHub](https://github.com/daliusiv/speaker-box-genius), and checked against WinISD and Hornresp in every build: see the [validation page](/validation/).

There are no accounts, adverts or paid tiers. See [Privacy](/privacy/) for what the site does and doesn't collect.

## The licence, in plain words

The legal texts are in the repository: [LICENSE](https://github.com/daliusiv/speaker-box-genius/blob/main/LICENSE) for the code, [LICENSE-DATA](https://github.com/daliusiv/speaker-box-genius/blob/main/LICENSE-DATA) for the driver database and docs, and [CLA.md](https://github.com/daliusiv/speaker-box-genius/blob/main/CLA.md) for contributions. This page explains them; where it and they differ, they win.

**Can I use it?** Yes, free, for personal, hobby, educational and non-profit use: designing your own speakers, teaching, a club or a forum build. That covers almost everyone who uses the site.

**What isn't allowed without asking?** Selling the software, putting it (or a copy of it) behind a paywall, or building it into a paid product or service. If that's what you want to do, [open an issue](https://github.com/daliusiv/speaker-box-genius/issues) and ask.

**Can I read, change and share the code?** Yes, for non-commercial purposes, under [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/). You can run your own copy, fix it, extend it and share your changes on the same terms.

**So is it open source?** Not in the strict (OSI) sense, because open-source licences such as MIT also allow commercial resale, and this one doesn't. It's *source-available*: all the code and data are public, and free for non-commercial use. The reason is simple: the community built it, so it should stay free for the community, and nobody should be able to take it and sell it back to them.

**What about the driver database?** It's under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): copy it and build on it, non-commercially, with credit, and share what you make on the same terms. A few manufacturers allowed their data to be used here but not under Creative Commons; their entries are listed in LICENSE-DATA and can't be reused elsewhere.

**Why is there a contributor agreement (CLA)?** People who contribute code or docs sign it once, with a comment on their first pull request. Adding a driver doesn't need it. In short:

- you keep the copyright in what you contribute;
- you give the maintainer a broad licence to it, including the right to offer the project under other terms, such as allowing a company's use, or moving to a different licence later;
- in return, everything contributed stays available to everyone under the project's free non-commercial licence, or under one that gives the public more freedom, never less.

That's what keeps the project free while still letting the maintainer say yes to good uses the non-commercial licence doesn't cover.

## Credits

- **Driver data** from the manufacturers who gave permission (Dayton Audio, SB Acoustics, B&C Speakers, Purifi, Markaudio and REDCATT), and from [driver-base](https://github.com/JonathanDCohen/driver-base) (CC BY 4.0) for other brands. Each entry links to its source; the full list is in [Driver data credits](https://github.com/daliusiv/speaker-box-genius/blob/main/docs/data-sources.md).
- **WinISD** (LinearTeam) and **Hornresp** (David McBean) are the references the app is checked against. Speaker Box Genius isn't affiliated with either.
- **OpenISD** (MIT licence) for its project file format, which the app can open.
- Not affiliated with or endorsed by any manufacturer. Product names and trademarks belong to their owners.

## Contact

Questions, bugs and ideas: [open an issue on GitHub](https://github.com/daliusiv/speaker-box-genius/issues). Data corrections and removals: the [data request form](https://github.com/daliusiv/speaker-box-genius/issues/new?template=data-correction.yml).
