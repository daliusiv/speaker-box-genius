# Data permissions

Manufacturers who have given permission for their published data to be used in the driver database. Keep the original emails; this file is the public record.

| Brand | Granted | By | Scope |
|---|---|---|---|
| Dayton Audio | 3 Nov 2026 | Jill Chupka, Product Coordinator (email) | Use the published Thiele/Small parameters from Dayton Audio specification sheets to expand the driver database. |
| SB Acoustics | 4 Nov 2026 | Mark Thomsen, International Sales & Marketing Manager, SB Audience / SB Acoustics (email) | Post the published specs; no export file exists, so they may be gathered with a script. |

## Requests pending

- Scan-Speak: emailed, no reply yet. Their website terms restrict copying datasheet information without written consent, so **no automated import until they reply**.
- Parts Express: emailed, no reply yet.

## Not yet contacted (drafts ready)

- Faital Pro, B&C Speakers, 18 Sound, Beyma, Tymphany/Peerless, Markaudio, Tang Band: asking for permission and a CSV or Excel export of their T/S data.
- Kicker, Skar Audio, Sundown Audio, JL Audio, Rockford Fosgate (car audio).
- Dayton Audio: the T/S values of seven passive radiators whose pages don't list them (E150HE-PR, E180HE-PR, SS8-PR, SS10-PR, SS12-PR, SS15-PR, SS18-PR).

A permission that comes with a spreadsheet is imported with `pnpm db:import-sheet`; see [`importing-a-spreadsheet.md`](importing-a-spreadsheet.md).

## Rules that apply whatever the permission

- Take numbers only, not PDFs, graphs, drawings or text.
- Link every entry to the manufacturer's page or spec sheet in `sources`.
- Never import from other aggregated databases (loudspeakerdatabase.com, speakerboxlite.com, etc.) unless they are published under a licence that allows it and is compatible with CC BY-NC-SA (CC0, CC BY, CC BY-SA, public domain), and then credit them as the licence requires. Currently: driver-base (CC BY 4.0), see [`data-sources.md`](data-sources.md).
- A brand that grants permission directly is imported from its own pages, not through driver-base.
- Act on manufacturer correction or removal requests (the `data-request` issue form) promptly, normally within 7 days.
