# Use Speaker Box Genius from your AI assistant

Ask Claude, ChatGPT-style coding assistants in Cursor or VS Code, or any app that speaks the Model Context Protocol (MCP) to design a speaker box, and it runs Speaker Box Genius's own simulator to answer. The numbers are the app's, checked against WinISD, Hornresp and SPICE on the [validation page](/validation/), and every design comes back with a link that opens it here.

It's a small program that runs on your computer. There's no account, and nothing about your designs is sent anywhere: the only thing it downloads is the public driver database, which it keeps so it also works offline.

## What you can ask

- *"Find a 12-inch subwoofer that goes below 30 Hz in a ported box under 80 L, and give me the link."*
- *"What sealed, ported and passive radiator boxes suit the Dayton RSS315HF-4 at its rated power?"*
- *"Which passive radiators would tune 60 L to 24 Hz for this driver?"*
- *"Here's a design from a forum post: [link]. Will it chuff at 300 W? What if the port were 10 cm across?"*
- *"My car wedge is 90 × 38 cm, 35 cm deep at the bottom and 20 cm at the top, in 18 mm MDF. What's the net volume?"*

## Add it to your app

You need [Node.js](https://nodejs.org) 20 or newer.

**Claude Desktop:** download [speaker-box-genius.mcpb](https://github.com/daliusiv/speaker-box-genius/releases/download/mcp/speaker-box-genius.mcpb) and open it; Claude Desktop installs it. Or add this to `claude_desktop_config.json` (Settings → Developer → Edit config):

```
{
  "mcpServers": {
    "speaker-box-genius": { "command": "npx", "args": ["-y", "speaker-box-genius", "mcp"] }
  }
}
```

**Claude Code:**

```
claude mcp add speaker-box-genius -- npx -y speaker-box-genius mcp
```

**Cursor, VS Code and other MCP apps:** add a server with the command `npx` and the arguments `-y speaker-box-genius mcp`.

To use only the saved copy of the driver database, add `--offline` after `mcp`.

## What it can do

| Tool | What it does |
| --- | --- |
| `search_drivers` | Searches about 2,070 drivers by name, size, Fs, Qts and Xmax |
| `get_driver` | A driver's full T/S values, where they came from and the data's licence |
| `simulate` | Up to eight boxes of any type: F3, tuning, cone and PR excursion, port air speed, max SPL and what limits it, with a share link |
| `suggest_boxes` | Sizes sealed, ported and passive radiator boxes as the app's **Size all boxes** does, and picks a passive radiator |
| `find_passive_radiators` | The app's PR finder: which PRs (how many, how much added mass) tune a box, best first |
| `read_share_link` | Opens a Speaker Box Genius link and returns its design and results |
| `box_volume` | The volume calculator: net volume of a box, wedge, tapered box, tube or sphere |

It only reads: it can't change anything on your computer or anywhere else.

## Good to know

- **Same numbers as the app.** The assistant's answers come from the same code as this site, so opening its link shows exactly what it described.
- **Drive.** Like WinISD, it starts at 1 W. Ask for the driver's rated power, or a number of watts or volts, to check the limits where they matter.
- **Driver data.** Most of the database is CC BY-NC-SA 4.0; a few brands allowed their data to be used in Speaker Box Genius only (see [About](/about/)). Please don't republish it in bulk.
- **Free for non-commercial use**, like the rest of Speaker Box Genius. The source is on [GitHub](https://github.com/daliusiv/speaker-box-genius).
