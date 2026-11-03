# Driver database

One JSON file per driver, grouped by brand:

```
drivers/
└─ <brand-slug>/
   ├─ _brand.json          { "name": "…", "website": "…" }
   └─ <model-slug>.json
```

The file path is the driver's permanent ID (e.g. `dayton-audio/rss265hf-4`), so don't rename files once they're merged.

- **Format:** see [`docs/examples/drivers/example-audio/ex10-4.json`](../docs/examples/drivers/example-audio/ex10-4.json) (a made-up driver).
- **Field definitions:** `packages/schema/src/index.ts`. Units are part of each field name (`vas_l` = litres, `sd_cm2` = cm², `xmax_mm` = mm one-way).
- **Required:** brand, model, type, nominal_ohms, `ts.fs`, `ts.qms`, `ts.qes`, `ts.vas_l`, `ts.re`, `ts.sd_cm2`, at least one source, and status.
- **Dual voice coil drivers:** add `"voice_coils": 2` and `"ts_wiring": "series"` or `"parallel"`, meaning how the coils were wired when the published T/S values were measured. `nominal_ohms` and `ts.re` are for that wiring. Datasheets often don't say. If they don't, Re gives it away: about 2× the per-coil impedance means series, about ½ means parallel.
- **Check your entry:** `pnpm validate:db`. CI runs the same check on every pull request, including a cross-check that the parameters agree with each other.

Contributions to this folder are licensed CC BY-NC-SA 4.0. See [`LICENSE-DATA`](../LICENSE-DATA) and [`CONTRIBUTING.md`](../CONTRIBUTING.md).
