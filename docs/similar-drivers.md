# Similar drivers and substitutes

How the **Substitutes** table on driver pages, **Find similar drivers** in the app's driver picker and the PR finder's **Closest to …** order are worked out. The scoring is adapted from [Boxdex](https://github.com/blamas/boxdex) (MIT licence). Code: `packages/engine/src/similar.ts` (scoring, same-box check), `site/similar.ts` (driver pages), `packages/web/src/similarApp.ts` and `packages/web/src/similarPr.ts` (app).

Wording on purpose: these are drivers with *similar parameters, simulated*, not replacements. Datasheets are sometimes wrong, and a driver can differ in ways T/S parameters don't show (distortion, breakup, build). Check the fit and the box in the app before you swap.

## Stage 1: which drivers are close

**Who can be a candidate**

- Same pool: **bass** (woofer, subwoofer, mid-bass, car audio) or **mid** (midrange, full-range). Brands label the same kind of part differently, so the types are merged into pools. Drivers typed `other` get no list and are never candidates.
- Same size (`size_in`). If fewer than 5 are left, the range widens by one standard size each way (for example 10″ → 8″–12″); those rows are marked **different size**. A driver without a published size is matched by cone area (cone diameter from Sd within ±15 %).
- Not the driver itself, and not one of its own impedance or voice-coil versions (the variant families shown as "Also available" on driver pages).
- At most 3 from the driver's own brand, 10 in all. The same part sold under two brands appears once per brand.

**The distance**

A weighted mean of |log2(candidate / driver)| over the parameters both publish:

| Parameter | Weight | Note |
|---|---|---|
| Qts | 3 | |
| Fs | 2.5 | |
| Vas | 2 | |
| Xmax | 1.5 | more Xmax counts a quarter |
| Sensitivity | 1 | \|ΔdB\| / 6; more counts a quarter |
| Pe | 1 | more power handling counts a quarter |

Sensitivity is always worked out from T/S (1 W, 1 m, half space): 112.1 + 10·log10 η0, with η0 = 4π²·Fs³·Vas / (c³·Qes), so it's the same for every brand whatever their datasheet measures.

A value one of the two doesn't publish is left out and the weights renormalised; nothing is guessed. An Xmax the database flags as doubtful counts as missing.

**Tiers**: **Close** ≤ 0.15, **Usable** ≤ 0.4, **Risky** above. Without a (trusted) Xmax on both, the best tier is Usable ("Xmax not published").

**Fit** (labelled, never part of the score): cutout drop-in (within 3 mm), needs enlarging, or needs a ring; depth OK (at most 5 mm deeper) or deeper; load the same, reached by wiring a dual voice coil in series or parallel, or different. Unknown values are shown as unknown.

## Stage 2: the same box

Each of the 10 is simulated in the driver's own box (same volume, port or passive radiators and their added mass), each at its own power rating (the driver's when the candidate has none, flagged), 120 points at 2.83 V:

- ΔF3, and Δmax SPL averaged over the octave above the driver's F3 (left out when either has no Xmax: an unlimited cone would look better than it is).
- An F3 more than 15 % higher, or max SPL more than 3 dB lower, moves the candidate down one tier.

The same-box check favours the driver the box was designed for; a candidate may do better in a box of its own. The app's version uses your current box (and your edited T/S), which is the fairer test for your build.

- **Driver pages** use the page's first suggested box, show Close and Usable rows only, and say how many Risky ones were left out.
- **The app** shows all three tiers, in the box you pick, with chips to filter them. Picking a row replaces your driver (Undo brings it back).

## Passive radiators

- **Driver pages**: under the passive radiator box, the next three PRs that also work in it (the PR finder's ranking: one row per PR, each at its best count), with their added mass and a link to the app with that PR in place.
- **PR finder → Order → Closest to …** (when the design uses a database PR): every PR group that works in your box, the one in use first, then by a weighted |log2 ratio| of the group's total cone area (3), one PR's travel (2.5, more counts a quarter), the group's own moving mass before added mass (2, lighter counts a quarter) and the group's Vas (1). Same tier limits as drivers; PRs past Usable get no chip (they still work in the box).
