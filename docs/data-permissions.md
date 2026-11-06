# Data permissions

Manufacturers who have given permission for their published data to be used in the driver database. Keep the original emails; this file is the public record.

| Brand | Granted | By | Scope |
|---|---|---|---|
| Dayton Audio | 3 Nov 2026 | Jill Chupka, Product Coordinator (email) | Use the published Thiele/Small parameters from Dayton Audio specification sheets to expand the driver database. |
| SB Acoustics | 4 Nov 2026 | Mark Thomsen, International Sales & Marketing Manager, SB Audience / SB Acoustics (email) | Post the published specs; no export file exists, so they may be gathered with a script. |
| B&C Speakers | 5 Nov 2026 | B&C Speakers S.p.A., Techadvice (email, techadvice@bcspeakers.com) | Publish the T/S parameters of their transducers in this free, non-commercial database, provided B&C Speakers is clearly identified as the source and each entry links to its product page on bcspeakers.com. They pointed to the LF Drivers and Coaxial "Comparison Matrix" Excel file as the source. |
| Purifi | 5 Nov 2026 | Claus Neesgaard, Purifi (email, cnn@purifi-audio.com) | Use their Thiele/Small parameters in Speaker Box Genius: anything available on their website may be used with a reference back to Purifi. They have no CSV or Excel export, so the values come from the product pages and datasheets on purifi-audio.com, and every entry links to its product page. |
| REDCATT | 6 Nov 2026 | Adrian B., REDCATT (email, info@redcatt.net) | Publish the Thiele/Small parameters of REDCATT drivers under CC BY-NC-SA 4.0, credited to REDCATT with a link to each product page. They sent the full parameter set (CSV and JSON, snapshot of 6 Nov 2026) and pointed to their public JSON API (redcatt.net/api/v1/products) for updates. |

## Requests pending

- Scan-Speak: emailed, no reply yet. Their website terms restrict copying datasheet information without written consent, so **no automated import until they reply**.
- Parts Express: emailed, no reply yet.
- Faital Pro, 18 Sound, Beyma, Peerless (Tymphany), Markaudio, Tang Band: emailed 5 Nov 2026 asking for permission and a CSV or Excel export of their T/S data.
- Kicker, Skar Audio, Sundown Audio, Rockford Fosgate (car audio): emailed 5 Nov 2026.
- Wavecor, Visaton, SEAS, PRV Audio, Morel, Sica, Eton, Accuton, HiVi, Fountek: emailed 5 Nov 2026. Visaton's and Accuton's website terms require prior written consent, so **nothing from them until they reply**.
- GRS and the US Dynavox range are sold by Parts Express and covered by that request.

## Not yet contacted

- JL Audio: no contact route found yet.

A permission that comes with a spreadsheet is imported with `pnpm db:import-sheet`; see [`importing-a-spreadsheet.md`](importing-a-spreadsheet.md).

## Rules that apply whatever the permission

- Take numbers only, not PDFs, graphs, drawings or text.
- Link every entry to the manufacturer's page or spec sheet in `sources`.
- Never import from other aggregated databases (loudspeakerdatabase.com, speakerboxlite.com, etc.) unless they are published under a licence that allows it and is compatible with CC BY-NC-SA (CC0, CC BY, CC BY-SA, public domain), and then credit them as the licence requires. Currently: driver-base (CC BY 4.0), see [`data-sources.md`](data-sources.md).
- A brand that grants permission directly is imported from its own pages, not through driver-base.
- Act on manufacturer correction or removal requests (the `data-request` issue form) promptly, normally within 7 days.
