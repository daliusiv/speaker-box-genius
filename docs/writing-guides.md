# Writing a guide

Every guide on the site follows these rules, so it reads like the others, its numbers stay right and it has a picture. The build mechanics (examples, placeholders, charts, the claims test) are in [CONTRIBUTING: Writing a guide](../CONTRIBUTING.md#writing-a-guide). This page is about what goes in a guide and how it reads.

## What a guide is for

A guide answers one question a builder actually asks ("how big should my port be?", "sealed or ported for my car?"). It answers it with a real driver in real boxes that the reader can open in the app and change. Every number in it comes from the simulation when the site is built, and every forum claim it mentions gets checked against a chart.

## Front matter

```yaml
---
title: "Port chuffing: how big should my port be?"
description: Why ports chuff, the 17 m/s rule, and how to get a port that's quiet and still fits in the box, with a worked 12-inch subwoofer example.
path: guides/port-chuffing
image: chart:port-example/port
art: A ported box in cutaway: air rushing out of the port breaks into swirls at its mouth.
order: 4
group: ported
---
```

- **title**: the question or topic in the reader's words, ideally the phrase they'd search for. Put it in quotes if it has a colon.
- **description**: one or two sentences: what the guide covers and the worked example it uses. It shows on the guides list and in search results.
- **path**: `guides/<slug>`. The slug is short, lower case and hyphenated, and it names the picture file.
- **image**: the share card, usually the chart that answers the question (`chart:example/kind`). Every guide needs one; the build test checks this.
- **art**: one sentence saying what the guide's picture shows (its alt text). See [The picture](#the-picture).
- **order**, **group**: where it sits on the guides list (`start`, `switching`, `ported`, `sealed`, `lines`, `measuring`).

## Shape

1. `# Title`, the same as the front matter's.
2. **Intro**: one paragraph. It names the problem the way builders meet it, says what the guide shows, and names the worked example. This paragraph becomes the lede, and the picture goes right after it.
3. **Open buttons**: `[[Open the worked example|example]]`, more than one when the guide compares setups. A button on its own line is the page's main action and is drawn solid; buttons on one line are equal choices and are all drawn as outlines, so put setups side by side only when none of them is the recommended one. Optionally a `> **Calculator:**` note that links the matching calculator.
4. **`## The short answer`**: 3–6 bullets a reader can act on without reading further. Each one has its number from the example.
5. **The body**: sections titled by the question they answer ("Why ports chuff", "Which one runs out first"), each built on the example and its charts. Use `> **Rule of thumb:**` and `> **Common trap:**` notes sparingly, one idea each.
6. **`## The forum claims, checked`**: a table with Claim and Verdict columns. The verdict starts with a bold one-line answer, then the number and the chart that proves it.
7. **`## Doing it in the app`**: the exact path to every control used, written as `Settings → <card> → <row> → <field>`.
8. **`## Sources`**: the last section, a numbered list (the page sets it smaller and muted), cited in the text as `[1]`. Datasheets, papers, the other tools' manuals, the forum threads the claims came from. Don't put citations in figure captions; they break the image.

Not every guide needs every section, but keep the order.

## The worked example

- Use a real driver from the database, with a real amplifier's wiring and power. If a limit matters (Xmax, port speed, power), show it at a power where it actually bites.
- Put 2–4 designs behind each open button. Make a separate example for each filter or setting you compare.
- Every number is a placeholder (`{{num:…}}`, `{{diff:…}}`), never typed in. Only words that don't change with the engine stay as plain text.
- Give each claim the text makes ("goes deeper", "passes Xmax", "about 1 dB") a test in `site/guideNumbers.test.ts`.

## Captions and the Markdown twin

Every guide is also built as a Markdown file for AI assistants (`/guides/<slug>.md`, listed in `/llms.txt`). A chart there is its caption plus a table of key points (F3 and F6, peak excursion with Xmax, peak port air speed, impedance peaks), one row per design, worked out from the same run as the drawing. The twin has no picture, so:

- Write each chart caption to stand alone: name the designs by colour **and** by what they are, and say what the reader should see ("Ported (orange) is 3 dB down at 21.1 Hz, sealed (blue) at 41.1 Hz").
- Don't write "left" or "right"; label side-by-side charts with the figure title (`"A|B"`) instead.
- Nothing to do for the twin itself: it is generated from the page's source, so numbers, links and charts can't drift from the page.

## Voice

- Plain and precise, from one builder to another. Give the number, then what it means.
- Standard T/S and WinISD terms (Vb, Fb, F3, Qtc, Xmax), explained the first time they matter.
- Put the units after the value: `40 L`, `30.0 Hz`, `1.4 mm`. Write inches as `10″`.
- No hype, no emoji. Short sentences beat clever ones.
- Name what the app can't do or hasn't validated instead of skipping it.

## The picture

Draw it last, once the guide is written, so it shows what the guide is really about.

- **File**: `site/img/guides/<slug>.svg`. Add `art:` to the front matter. It shows on the guide's card in the list and after the guide's intro.
- **Canvas**: `viewBox="0 0 1200 630"`, starting with `<rect width="1200" height="630" fill="#11141a"/>`.
- **Colours**: cyan `#4ed7e9` for the box and driver, orange `#fb923c` for the one thing the guide is about (the port's air, the passive radiator, the cabin gain), grey `#8b93a3` for context (the ground line, sound waves, the car). Fills only as faint tints of those (`fill-opacity` around .05–.3).
- **Lines**: strokes at least 4 wide, round caps and joins. Dashed lines for inside edges, ghost positions and air flow.
- **Style**: technical line art, like a cutaway or side-view drawing: a box, a driver, a port, a car. No text, no numbers, no chart values, no logos or real products' likenesses.
- **Phones**: the list crops it to a small 4:3 thumbnail, so keep the subject in the middle 70 % (x 180–1020) with a few bold shapes. Fine detail disappears.
- **Size**: hand-written SVG, under 20 KB (a few KB is typical). No `<text>`, `<image>`, `<style>`, scripts, filters, gradients or links.

Calculators get a picture too, for their card on the `/calculators/` hub only (not on the calculator page): `site/img/calculators/<slug>.svg`, where the slug is the calculator's path (`/calculators/port-length/` → `port-length.svg`), drawn to the same rules. Orange is the thing the calculator works out (the port's length, the PR's added mass, the air left in the box).

`site/guideArt.test.ts` checks the canvas, colours, stroke widths, banned elements, size and that `art:` is a full sentence. Look at the picture at full size and as a 96 px thumbnail before you commit (`rsvg-convert -w 96 file.svg -o thumb.png`).

## Before you open the pull request

- [ ] The title, description, slug, `image:`, `art:`, `order:` and `group:` are all set.
- [ ] The intro paragraph comes first, then the open buttons, then "The short answer".
- [ ] Every number is a placeholder, and every claim has a test.
- [ ] Forum claims each have a verdict and the chart that proves it.
- [ ] Every app path is written as `Settings → card → row → field` and works.
- [ ] Sources are numbered and cited.
- [ ] The picture follows the rules above and reads as a thumbnail.
- [ ] `pnpm build:site` and `pnpm test` pass; the page looks right at phone and desktop width.
- [ ] CHANGELOG: a line under `## Unreleased`.
