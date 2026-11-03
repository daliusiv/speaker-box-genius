# Driver data sources and credits

Every entry in `drivers/` and `passive-radiators/` lists where its numbers came from in `sources`, with a link to the manufacturer's page or spec sheet. Thiele/Small values are factual specifications; product names and trademarks belong to their owners.

## Manufacturers who gave permission

See [`data-permissions.md`](data-permissions.md). Dayton Audio entries are imported directly from daytonaudio.com with Dayton Audio's permission.

## driver-base (CC BY 4.0)

Entries for 18 Sound, B&C Speakers, Beyma, Celestion, Eminence, Faital Pro, HOQS, Jensen, Monacor, Peerless, RCF and SB Acoustics (except entries that were already in this database) come from:

> Data from driver-base (https://github.com/JonathanDCohen/driver-base), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

driver-base compiles the values from each manufacturer's own product pages. **Changes made by Speaker Box Genius:** converted to this database's format and units; nominal size rounded to the usual inch size; Qes calculated from Qts and Qms (or Vas from Cms and Sd) where only those were published; a few values that contradict the rest dropped or corrected, with the reason in that entry's `notes`. Entries whose values disagree too much to correct were left out. The importer is `packages/db-tools/src/driverbase.ts`; each run writes a report of what was written, adjusted and skipped.

Our compilation of these entries is shared under this database's licence (CC BY-NC-SA 4.0, see [`LICENSE-DATA`](../LICENSE-DATA)); the driver-base material in it remains available under CC BY 4.0 from driver-base itself.
