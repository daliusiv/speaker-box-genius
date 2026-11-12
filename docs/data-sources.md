# Driver data sources and credits

**Not affiliated with or endorsed by any manufacturer.** Brand and model names are used only to identify the products the data describes. No logos, images or datasheet text are copied.

**Corrections and removal.** Manufacturers (or anyone) can ask for data to be corrected or removed with the [data request form](https://github.com/daliusiv/speaker-box-genius/issues/new?template=data-correction.yml). Manufacturer requests are handled promptly, normally within 7 days; a removal takes the entries out of the database and the live app.

Every entry in `drivers/` and `passive-radiators/` lists where its numbers came from in `sources`, with a link to the manufacturer's page or spec sheet. Thiele/Small values are factual specifications; product names and trademarks belong to their owners.

## Manufacturers who gave permission

See [`data-permissions.md`](data-permissions.md). Dayton Audio entries are imported directly from daytonaudio.com with Dayton Audio's permission. SB Acoustics entries are imported directly from sbacoustics.com with SB Acoustics' permission (they replace the SB Acoustics entries that came from driver-base). B&C Speakers entries come from B&C's own LF driver comparison matrix (Excel), with their permission; B&C Speakers is the source of that data, and every entry links to its product page on bcspeakers.com (they also replace the driver-base entries). Purifi entries come from the product pages and datasheets on purifi-audio.com, with Purifi's permission; each links back to its Purifi product page. The maximum added mass on Purifi's passive radiators comes from Purifi by email (11 Nov 2026): total moving mass up to 2–2.5× the PR's own, so up to 1.5× its Mms can be added. REDCATT entries come from the parameter files REDCATT sent (6 Nov 2026), with REDCATT's permission; each links to its product page on redcatt.net. Where REDCATT lists no Fs or Re (four coaxial models), the value is calculated from their published Mms, Cms, Qes and Bl, and the entry's notes say so. Markaudio entries come from markaudio.com product pages and Markaudio's own spec sheets, with Markaudio's permission; each links to its product page. **They are not covered by CC BY-NC-SA 4.0** (Markaudio can't release its data under Creative Commons), so leave them out if you reuse the database; see the exceptions in [`LICENSE-DATA`](../LICENSE-DATA). SEAS entries (drivers and passive radiators) come from the datasheets on seas.no, with SEAS' permission (9 Nov 2026), read by `packages/db-tools/src/seas.ts` in the SEAS import workflow; each links to its product page on seas.no. Beyma entries (woofers, coaxials and full-range drivers) come from Beyma's own datasheets (PDFs, 10 Nov 2026), with Beyma's permission; each links to its product page on beyma.com (they replace the driver-base entries). Coaxial values are for the woofer section. **They are not covered by CC BY-NC-SA 4.0** either, so leave them out if you reuse the database; see the exceptions in [`LICENSE-DATA`](../LICENSE-DATA).

## driver-base (CC BY 4.0)

Entries for 18 Sound, Celestion, Eminence, Faital Pro, HOQS, Jensen, Monacor, Peerless and RCF (except entries that were already in this database) come from (SB Acoustics entries also came from here until 4 Nov 2026, B&C Speakers entries until 5 Nov 2026, and Beyma entries until 10 Nov 2026, when they were replaced by each manufacturer's own data):

> Data from driver-base (https://github.com/JonathanDCohen/driver-base), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**Imported version:** driver-base commit [`08ee4c5`](https://github.com/JonathanDCohen/driver-base/tree/08ee4c5319d4834f410a45da06a627bb67b519c8) (`web/drivers.json` generated 2 Nov 2026), imported 3 Nov 2026 in [PR #4](https://github.com/daliusiv/speaker-box-genius/pull/4).

driver-base compiles the values from each manufacturer's own product pages. **Changes made by Speaker Box Genius:** converted to this database's format and units; nominal size rounded to the usual inch size; Qes calculated from Qts and Qms (or Vas from Cms and Sd) where only those were published; a few values that contradict the rest dropped or corrected, with the reason in that entry's `notes`. Entries whose values disagree too much to correct were left out. The importer is `packages/db-tools/src/driverbase.ts`; each run writes a report of what was written, adjusted and skipped.

Each driver's page on the site (`/drivers/<brand>/<model>/`) credits its source the same way: the manufacturer's datasheet, or driver-base with a link to its CC BY 4.0 licence.

Our compilation of these entries is shared under this database's licence (CC BY-NC-SA 4.0, see [`LICENSE-DATA`](../LICENSE-DATA)); the driver-base material in it remains available under CC BY 4.0 from driver-base itself.
