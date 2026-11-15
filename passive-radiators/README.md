# Passive radiator database

Same layout as [`drivers/`](../drivers/README.md): `passive-radiators/<brand-slug>/<model-slug>.json`, plus a `_brand.json` per brand.

- **Format:** see [`docs/examples/passive-radiators/example-audio/ex10-pr.json`](../docs/examples/passive-radiators/example-audio/ex10-pr.json) (a made-up PR).
- **Required:** `params.mms_g` (moving mass with **no** added mass), `params.sd_cm2`, the travel — `params.xmax_mm` (linear, one way) or, when the maker publishes only the mechanical limit, `params.xmech_mm` (where it bottoms out; the app labels it Xmech) — and at least one of `fs`, `vas_l` or `cms_mm_per_n` so compliance can be calculated.
- **Recommended:** `max_added_mass_g`, which lets the app warn you when a tuning needs more mass than the PR can take.

Contributions to this folder are licensed CC BY-NC-SA 4.0.
