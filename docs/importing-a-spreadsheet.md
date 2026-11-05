# Importing a manufacturer's spreadsheet

When a manufacturer gives written permission and sends their T/S data as a file (Excel or CSV), it goes into the database in one data-only pull request. This page is the checklist.

## Before importing

1. **Permission in writing.** The email must allow the data to be published in this database under its licence (CC BY-NC-SA 4.0, see [`LICENSE-DATA`](../LICENSE-DATA)). Keep the email; add a row to [`data-permissions.md`](data-permissions.md) with the date, who granted it and the scope.
2. **The file stays private.** Don't commit the spreadsheet. Only the numbers go in, one JSON per driver.
3. **A link for every entry.** Each entry's `sources` links to the manufacturer's product page or datasheet. If the sheet has no URL column, pass a `--url` template (below).

## Running it

```
pnpm db:import-sheet --brand "Faital Pro" --file ~/Downloads/faital-ts.xlsx --date 2026-11-12 --dry-run
```

Read the report (written to `<brand>-import-report.md`), fix anything with `--map`, then run it again without `--dry-run`.

| Option | Use |
|---|---|
| `--brand NAME` | Brand as it should appear. Existing brands keep their folder (`Faital Pro` → `drivers/faital-pro/`). |
| `--file PATH` | `.xlsx`, `.csv`, `.tsv` or `.txt`. Old `.xls` files need saving as `.xlsx` first. |
| `--date YYYY-MM-DD` | When the file was received (goes in `sources[].retrieved`). |
| `--url TEMPLATE` | Product page for rows without a URL column. `{model}` and `{slug}` are filled in, e.g. `https://www.example.com/products/{slug}`. |
| `--sheet NAME` | Worksheet to read (default: the first). |
| `--header-row N` | The row with the column names, if it isn't found automatically. |
| `--map "Header=field[:unit]"` | Name a column the importer doesn't recognise, e.g. `--map "Resonanzfrequenz=fs"` or `--map "Hub=xmax:mm"`. Fields: `model url kind size impedance fs qts qes qms vas cms re le bl mms sd xmax xmech pe cutout depth displacement added_mass coils wiring`. |
| `--kind passive-radiator` | The whole sheet is passive radiators (otherwise rows are sorted by a type column). |
| `--type car-audio` | Force the driver type, e.g. for a car-audio brand. |
| `--dvc-wiring series\|parallel` | How dual voice coil values were measured, when the sheet doesn't say. Without it, DVC rows are skipped. |
| `--decimal-comma` | Numbers like `0,43`. Detected automatically for semicolon-separated files. |
| `--note TEXT` | Source note on every entry (a sensible default names the brand and the permission). |
| `--website URL --country CC` | For a brand that's new to the database. |

What it understands without help: common column names in English (Fs, Qts, Vas, Re, Le, BL/BxL/force factor, Mms, Sd/effective area, Xmax, AES power, cutout, depth, nominal impedance and diameter); units in brackets, in a units row under the headers, or in the cells (L, ft³, cm², in², m², mm, in, g, kg, mH, µH, mm/N); title rows above the table; program/peak power and Vd columns, which it ignores.

## What the importer checks

Every row goes through the same checks and repairs as the driver-base import (`convertRecord` in `driverbase.ts`): Qes from Qts and Qms, Vas from Cms, Vas published in cubic feet, Sd that can't fit the frame, values that disagree with each other, implausible cutouts and depths. Anything changed is written in the entry's `notes` and listed under **Adjusted** in the report; anything it can't fix is **Skipped** with the reason.

Tweeters and compression drivers are skipped. Passive radiators need Mms, Sd and Xmax (Mms is worked out from Fs and Cms if needed; Xmech is used when there's no Xmax, and the notes say so).

## Existing entries

- A model already in the database is **overwritten in the same file**, so its ID and every shared link stay the same. Contributed displacement, measurements and `verified` status are kept.
- The report lists values the old entry had that the sheet doesn't, and the brand's entries the sheet didn't cover (often discontinued models). Those are kept; decide case by case.

## After importing

1. Add the brand to `DIRECT_BRANDS` in `packages/db-tools/src/driverbase.ts`, so a driver-base re-import skips it.
2. Mention the brand in [`data-sources.md`](data-sources.md) under "Manufacturers who gave permission".
3. `pnpm validate:db` and `pnpm test`.
4. Open **one data-only pull request** (`drivers/`, `passive-radiators/`, the docs above), with the report as its description. Data-only PRs don't need the CLA.

## What not to do

- **Don't bulk-copy other databases.** Individual T/S numbers are facts, but a compiled database is protected in the UK and EU by database right, whoever compiled it. Only import other compilations whose licence allows it (see [`data-permissions.md`](data-permissions.md)).
- **No permission, no bulk import.** Without a manufacturer's permission, entries are added one at a time from their datasheets, each with its link (the new-driver form does this).
