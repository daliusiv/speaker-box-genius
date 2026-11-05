## Purifi import from a spreadsheet (2026-11-05)

Rows: 44. New: 44. Updated: 0. Adjusted: 0. Skipped: 0.

Source: T/S from Purifi's product page and datasheet on purifi-audio.com, used with Purifi's permission (5 Nov 2026); the link is the Purifi product page. See docs/data-permissions.md.

Columns read: Model → model, URL → url, Size (in) → size ×25.4, Impedance → impedance, Fs → fs, Qms → qms, Qes → qes, Qts → qts, Vas (L) → vas, Re → re, Le (mH) → le, Bl → bl, Mms (g) → mms, Cms (mm/N) → cms, Sd (cm2) → sd, Xmax (mm) → xmax, Xmech (mm) → xmech, Pe (W) → pe, Cutout (mm) → cutout, Depth (mm) → depth, Displacement (L) → displacement, Type → kind.

Columns not used: Rms (kg/s). Use --map if one of them should be.

### Adjusted (check these against the datasheet)
- none

### Skipped
- none

### Purifi entries not in the sheet (kept; check whether they're discontinued)
- passive-radiators/purifi/ptt10-0pr-na2-01.json
- passive-radiators/purifi/ptt4-0pr-na2-02.json
- passive-radiators/purifi/ptt4-0pr-nf2-01.json
- passive-radiators/purifi/ptt4-0pr-nl2-01.json
- passive-radiators/purifi/ptt5-25pr-na2-01.json
- passive-radiators/purifi/ptt5-25pr-nf2-01.json
- passive-radiators/purifi/ptt6-5pr-na2-03.json
- passive-radiators/purifi/ptt6-5pr-nf2-02.json
- passive-radiators/purifi/ptt8-0pr-na2-01.json

### New
- PTT4.0X04-NFC-01 (drivers/purifi/ptt4-0x04-nfc-01.json)
- PTT4.0X08-NFC-01 (drivers/purifi/ptt4-0x08-nfc-01.json)
- PTT4.0X04-NAC-03 (drivers/purifi/ptt4-0x04-nac-03.json)
- PTT4.0X08-NAC-03 (drivers/purifi/ptt4-0x08-nac-03.json)
- PTT4.0M04-NFC-01 (drivers/purifi/ptt4-0m04-nfc-01.json)
- PTT4.0M08-NFC-01 (drivers/purifi/ptt4-0m08-nfc-01.json)
- PTT4.0M04-NAC-03 (drivers/purifi/ptt4-0m04-nac-03.json)
- PTT4.0M08-NAC-03 (drivers/purifi/ptt4-0m08-nac-03.json)
- PTT5.25X04-NFA-01 (drivers/purifi/ptt5-25x04-nfa-01.json)
- PTT5.25X08-NFA-01 (drivers/purifi/ptt5-25x08-nfa-01.json)
- PTT5.25X04-NAA-05 (drivers/purifi/ptt5-25x04-naa-05.json)
- PTT5.25X08-NAA-05 (drivers/purifi/ptt5-25x08-naa-05.json)
- PTT5.25M04-NAA-05 (drivers/purifi/ptt5-25m04-naa-05.json)
- PTT5.25M08-NAA-05 (drivers/purifi/ptt5-25m08-naa-05.json)
- PTT6.5X04-NFA-06 (drivers/purifi/ptt6-5x04-nfa-06.json)
- PTT6.5X08-NFA-06 (drivers/purifi/ptt6-5x08-nfa-06.json)
- PTT6.5X04-NAA-08 (drivers/purifi/ptt6-5x04-naa-08.json)
- PTT6.5X08-NAA-08 (drivers/purifi/ptt6-5x08-naa-08.json)
- PTT6.5W04-NFA-06 (drivers/purifi/ptt6-5w04-nfa-06.json)
- PTT6.5W08-NFA-06 (drivers/purifi/ptt6-5w08-nfa-06.json)
- PTT6.5W04-NAA-08 (drivers/purifi/ptt6-5w04-naa-08.json)
- PTT6.5W08-NAA-08 (drivers/purifi/ptt6-5w08-naa-08.json)
- PTT6.5M04-NFA-01 (drivers/purifi/ptt6-5m04-nfa-01.json)
- PTT6.5M08-NFA-01 (drivers/purifi/ptt6-5m08-nfa-01.json)
- PTT6.5M04-NAA-08 (drivers/purifi/ptt6-5m04-naa-08.json)
- PTT6.5M08-NAA-08 (drivers/purifi/ptt6-5m08-naa-08.json)
- PTT8.0X04-NAB-01 (drivers/purifi/ptt8-0x04-nab-01.json)
- PTT8.0X08-NAB-01 (drivers/purifi/ptt8-0x08-nab-01.json)
- PTT10.0X04-NAB-01 (drivers/purifi/ptt10-0x04-nab-01.json)
- PTT10.0X08-NAB-01 (drivers/purifi/ptt10-0x08-nab-01.json)
- PTT6.5W04-NFA-01 (drivers/purifi/ptt6-5w04-nfa-01.json)
- PTT6.5W08-NFA-01 (drivers/purifi/ptt6-5w08-nfa-01.json)
- PTT6.5X04-NFA-01 (drivers/purifi/ptt6-5x04-nfa-01.json)
- PTT6.5X08-NFA-01 (drivers/purifi/ptt6-5x08-nfa-01.json)
- PTT4.0X04-NLC-02 (drivers/purifi/ptt4-0x04-nlc-02.json)
- PTT4.0X08-NLC-02 (drivers/purifi/ptt4-0x08-nlc-02.json)
- PTT4.0X04-NAC-04 (drivers/purifi/ptt4-0x04-nac-04.json)
- PTT4.0X08-NAC-04 (drivers/purifi/ptt4-0x08-nac-04.json)
- PTT4.0M04-NLC-02 (drivers/purifi/ptt4-0m04-nlc-02.json)
- PTT4.0M04-NAC-04 (drivers/purifi/ptt4-0m04-nac-04.json)
- PTT6.5X04-NLA-10 (drivers/purifi/ptt6-5x04-nla-10.json)
- PTT6.5W04-NAA-07 (drivers/purifi/ptt6-5w04-naa-07.json)
- PTT6.5M04-NAA-07 (drivers/purifi/ptt6-5m04-naa-07.json)
- PTT6.5M08-NAA-07 (drivers/purifi/ptt6-5m08-naa-07.json)

### Updated
- none


## Purifi passive radiators (2026-11-05)

Rows: 9. New: 9. Updated: 0. Adjusted: 9. Skipped: 0.

Source: T/S from Purifi's product page and datasheet on purifi-audio.com, used with Purifi's permission (5 Nov 2026); the link is the Purifi product page. See docs/data-permissions.md.

Columns read: Model → model, URL → url, Size (in) → size ×25.4, Fs → fs, Qms → qms, Vas (L) → vas, Mms (g) → mms, Cms (mm/N) → cms, Sd (cm2) → sd, Xmech (mm) → xmech, Max added mass (g) → added_mass.

Columns not used: Rms (kg/s). Use --map if one of them should be.

### Adjusted (check these against the datasheet)
- PTT4.0PR-NF2-01 (passive-radiators/purifi/ptt4-0pr-nf2-01.json) — Xmax is the published mechanical limit (Xmech 14 mm); there's no separate linear figure.
- PTT4.0PR-NA2-02 (passive-radiators/purifi/ptt4-0pr-na2-02.json) — Xmax is the published mechanical limit (Xmech 14 mm); there's no separate linear figure.
- PTT4.0PR-NL2-01 (passive-radiators/purifi/ptt4-0pr-nl2-01.json) — Xmax is the published mechanical limit (Xmech 14 mm); there's no separate linear figure.
- PTT5.25PR-NF2-01 (passive-radiators/purifi/ptt5-25pr-nf2-01.json) — Xmax is the published mechanical limit (Xmech 14 mm); there's no separate linear figure.
- PTT5.25PR-NA2-01 (passive-radiators/purifi/ptt5-25pr-na2-01.json) — Xmax is the published mechanical limit (Xmech 14 mm); there's no separate linear figure.
- PTT6.5PR-NF2-02 (passive-radiators/purifi/ptt6-5pr-nf2-02.json) — Xmax is the published mechanical limit (Xmech 15 mm); there's no separate linear figure.
- PTT6.5PR-NA2-03 (passive-radiators/purifi/ptt6-5pr-na2-03.json) — Xmax is the published mechanical limit (Xmech 15 mm); there's no separate linear figure.
- PTT8.0PR-NA2-01 (passive-radiators/purifi/ptt8-0pr-na2-01.json) — Xmax is the published mechanical limit (Xmech 15 mm); there's no separate linear figure.
- PTT10.0PR-NA2-01 (passive-radiators/purifi/ptt10-0pr-na2-01.json) — Xmax is the published mechanical limit (Xmech 25 mm); there's no separate linear figure.

### Skipped
- none

### Purifi entries not in the sheet (kept; check whether they're discontinued)
- drivers/purifi/ptt10-0x04-nab-01.json
- drivers/purifi/ptt10-0x08-nab-01.json
- drivers/purifi/ptt4-0m04-nac-03.json
- drivers/purifi/ptt4-0m04-nac-04.json
- drivers/purifi/ptt4-0m04-nfc-01.json
- drivers/purifi/ptt4-0m04-nlc-02.json
- drivers/purifi/ptt4-0m08-nac-03.json
- drivers/purifi/ptt4-0m08-nfc-01.json
- drivers/purifi/ptt4-0x04-nac-03.json
- drivers/purifi/ptt4-0x04-nac-04.json
- drivers/purifi/ptt4-0x04-nfc-01.json
- drivers/purifi/ptt4-0x04-nlc-02.json
- drivers/purifi/ptt4-0x08-nac-03.json
- drivers/purifi/ptt4-0x08-nac-04.json
- drivers/purifi/ptt4-0x08-nfc-01.json
- drivers/purifi/ptt4-0x08-nlc-02.json
- drivers/purifi/ptt5-25m04-naa-05.json
- drivers/purifi/ptt5-25m08-naa-05.json
- drivers/purifi/ptt5-25x04-naa-05.json
- drivers/purifi/ptt5-25x04-nfa-01.json
- drivers/purifi/ptt5-25x08-naa-05.json
- drivers/purifi/ptt5-25x08-nfa-01.json
- drivers/purifi/ptt6-5m04-naa-07.json
- drivers/purifi/ptt6-5m04-naa-08.json
- drivers/purifi/ptt6-5m04-nfa-01.json
- drivers/purifi/ptt6-5m08-naa-07.json
- drivers/purifi/ptt6-5m08-naa-08.json
- drivers/purifi/ptt6-5m08-nfa-01.json
- drivers/purifi/ptt6-5w04-naa-07.json
- drivers/purifi/ptt6-5w04-naa-08.json
- drivers/purifi/ptt6-5w04-nfa-01.json
- drivers/purifi/ptt6-5w04-nfa-06.json
- drivers/purifi/ptt6-5w08-naa-08.json
- drivers/purifi/ptt6-5w08-nfa-01.json
- drivers/purifi/ptt6-5w08-nfa-06.json
- drivers/purifi/ptt6-5x04-naa-08.json
- drivers/purifi/ptt6-5x04-nfa-01.json
- drivers/purifi/ptt6-5x04-nfa-06.json
- drivers/purifi/ptt6-5x04-nla-10.json
- drivers/purifi/ptt6-5x08-naa-08.json
- drivers/purifi/ptt6-5x08-nfa-01.json
- drivers/purifi/ptt6-5x08-nfa-06.json
- drivers/purifi/ptt8-0x04-nab-01.json
- drivers/purifi/ptt8-0x08-nab-01.json

### New
- PTT4.0PR-NF2-01 (passive-radiators/purifi/ptt4-0pr-nf2-01.json)
- PTT4.0PR-NA2-02 (passive-radiators/purifi/ptt4-0pr-na2-02.json)
- PTT4.0PR-NL2-01 (passive-radiators/purifi/ptt4-0pr-nl2-01.json)
- PTT5.25PR-NF2-01 (passive-radiators/purifi/ptt5-25pr-nf2-01.json)
- PTT5.25PR-NA2-01 (passive-radiators/purifi/ptt5-25pr-na2-01.json)
- PTT6.5PR-NF2-02 (passive-radiators/purifi/ptt6-5pr-nf2-02.json)
- PTT6.5PR-NA2-03 (passive-radiators/purifi/ptt6-5pr-na2-03.json)
- PTT8.0PR-NA2-01 (passive-radiators/purifi/ptt8-0pr-na2-01.json)
- PTT10.0PR-NA2-01 (passive-radiators/purifi/ptt10-0pr-na2-01.json)

### Updated
- none


## Where the values came from

Purifi has no CSV or Excel export, so each row was read from the product's page on purifi-audio.com (the transducer catalogue, 3 pages) and checked against the datasheet linked from it. OEM-only models without a shop page link to https://purifi-audio.com/oem-transducers. Nothing came from retailers or other databases.

Where the page and the datasheet disagreed, the datasheet was used:

| Model | Value | Page | Datasheet |
|---|---|---|---|
| PTT4.0PR-NF2-01 | Qms | 7.1 | 7.0 (v1.02, Apr 2023) |
| PTT4.0PR-NA2-02 | Qms | 5.9 | 6.0 (v0.96, Apr 2023) |
| PTT5.25X04-NFA-01 | Xmech | ±14.0 mm | ±14.5 mm (v1.10, Feb 2023) |
| PTT10.0PR-NA2-01 | Vas | 80.8 L | 82 L (v1.00, Aug 2024) |
| PTT5.25M04-NAA-05 | Cutout | 101 mm | 121 mm (like the other 5.25" drivers) |

Other notes:
- PTT10.0X04/X08: power from the page (450 W); the datasheets say "TBD". Power is left out where Purifi says TBD (4.0M, 8.0X08, two OEM 4.0M models).
- PTT5.25X08-NAA-05: the datasheet's summary (fs 29 Hz, Vas 12 L) differs from its own table (fs 30 Hz, Vas 12.4 L); the table (which matches the page) was used.
- Older 6.5" NFA-01 pages: nominal impedance taken from the model code (04 = 4 Ω, 08 = 8 Ω) where the page left it blank.
- Passive radiators: Purifi gives the maximum mechanical excursion only, used as Xmax (noted on each entry); no maximum added mass is published (M6 mass plug).
- Not imported: PTT6.5PR-NF1-01 and PTT4.0W04 (no Purifi page), and OEM variants whose datasheets wouldn't download (several are renamed shop models with the same T/S).
