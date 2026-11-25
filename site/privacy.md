# Privacy

Speaker Box Genius has no accounts, no cookies and no server of its own. Your designs stay in your browser, apart from the session replays you can switch off (see Usage stats).

## Your designs

- **The simulation runs in your browser.** Your design isn't sent anywhere, except as it appears on screen in the usage-stats session replays below (what you type into fields is hidden even there). Crash reports never include it.
- **Share links** carry the whole design after the `#` in the address. Browsers never send that part to a website, so a design only goes where you post its link.
- **Saved projects** are kept in your browser's own storage on your device (or in a project file you download). The app also remembers a few display choices there, such as the chart you last looked at.
- The driver database is part of this website, so looking up a driver goes nowhere else.
- **Ask AI about this page** (on guides and calculators) sends nothing by itself. **Copy page as Markdown** copies this page's text to your clipboard. **Open in Claude** and **Open in ChatGPT** open that site in a new tab with a question naming this page's address; what happens there is between you and that site, under its own privacy policy. Each of the three is counted once as an anonymous click (see Visit counts below).
- **The [MCP server for AI assistants](/mcp/)** runs on your computer and sends nothing about your designs anywhere: it only downloads the public driver database from this site (a plain file download, no stats). What you type to your AI app is between you and that app. The share links it gives you end their address with `?ref=mcp` before the `#`, so when you open one the counts below record "an AI assistant" as where you came from (only that tag, never the design); the app then drops the tag from the address bar.

## Visit counts

The site counts visits with [GoatCounter](https://www.goatcounter.com/), an open-source counter that sets no cookies. For each page it's told the page's address (never the design after the `#`), the site you came from, your browser and screen size, and your country, worked out from your IP address. GoatCounter doesn't store IP addresses or anything that identifies you, and the counts are only shown in total. See [GoatCounter's privacy policy](https://www.goatcounter.com/privacy).

- If your browser sends "Do Not Track" or "Global Privacy Control", visits aren't counted.
- Switching off **Settings → Privacy → Help improve the app** stops the visit counts too, on the app and every page of this site, in this browser.
- If your browser blocks it, nothing else changes.

## Usage stats

Thank you if you leave these on: they're one of the easiest ways to help the app get better. The app sends anonymous usage stats to [PostHog](https://posthog.com/), on PostHog's EU servers in Frankfurt, so we can see which features people use and where they get stuck, and fix and improve the right things first.

- **What's sent:** counts of what's used (box types added, files imported and exported and their format, tabs and charts opened, share options, warnings shown), which limits your designs run into, where clicks land on the page with all text hidden, how fast the app loads and responds, session replays of the app as you use it (see below), and whether you arrived from Reddit, diyAudio, Google, another page of this site, a link from the MCP server for AI assistants or elsewhere (only that, never the address). Each comes with your browser, operating system, screen size and the app's version.
- **What the counts never include:** your design, its values, the names you give things, or the files you open. Only values from a fixed list can leave the browser; anything else is removed before sending.
- **Session replays:** a replay of the app as you use it (what's on screen, where the pointer moves, what's tapped and scrolled) so we can see where people get stuck. It shows the app as you see it, including the driver, the results and the charts, and any name you gave a box. What you type into fields is replaced with `*` in your browser before anything is sent, sliders and share links are blanked out, and files you open are never included. No console output or network data, and nothing that identifies you. Replays are kept for 30 days.
- No cookies or browser storage for this, and no ID that follows you between visits. Your IP address isn't stored.
- **Switch it off** in **Settings → Privacy → Help improve the app**. That also stops the visit counts above and the session replays. The choice is kept in this browser only. Crash reports (below) stay on.
- If your browser sends "Do Not Track" or "Global Privacy Control", nothing is sent at all.

## Crash reports

When something in the app goes wrong (a JavaScript error), it sends an anonymous crash report to [PostHog](https://posthog.com/), on PostHog's EU servers in Frankfurt, so problems get fixed before anyone has to report them. A report holds the error message and where in the app's code it happened, the page's address (never the design after the `#`), your browser, operating system and screen size, the app's version, and a short summary of what was open: the box types, the tab and chart, and whether the driver came from the database.

- It's sent only when an error happens: no page views, clicks or session replays (those are part of the usage stats above), and never your design, its values or the files you open.
- No cookies or browser storage, and no ID that follows you between visits. Your IP address isn't stored.
- If your browser sends "Do Not Track" or "Global Privacy Control", no reports are sent. If your browser blocks PostHog, nothing else changes.

See [PostHog's privacy policy](https://posthog.com/privacy).

## Driver submissions

**Submit to database…** sends the driver's values, the brand, model and datasheet link, and the name you type (if any) to our submission service on Cloudflare, which opens a public pull request on GitHub with them. There's no account and no email. Your IP address is used only to stop too many submissions from one place (as a hashed key that changes daily) and isn't stored; the service keeps no request logs. The form uses [Cloudflare Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/) to check you're human: it loads only when you open the form.

## Other services

- The site is hosted on **GitHub Pages**, which, like any web host, sees your IP address when it sends you the pages. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Report a problem**, the GitHub form for drivers and the GitHub links open GitHub in a new tab, under GitHub's own terms. Nothing is sent until you submit there.

## Contact

Questions about this page: [open an issue on GitHub](https://github.com/daliusiv/speaker-box-genius/issues).
