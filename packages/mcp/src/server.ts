/**
 * Speaker Box Genius as a local MCP server (stdio). Runs on the user's machine; no account, no
 * telemetry. The only network use is fetching the public driver database (speakerboxgenius.com/db/),
 * which is cached; --offline uses the cache only, --db <checkout> a local copy of the repo.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { simRequestSchema, SITE, type Database, type LinkRef } from "@sbg/headless";
import { TOOLS, ToolError, type ToolContext } from "./tools.ts";

declare const __SBG_VERSION__: string | undefined;
export const VERSION = typeof __SBG_VERSION__ === "string" ? __SBG_VERSION__ : "dev";

const INSTRUCTIONS = `Speaker Box Genius: a loudspeaker enclosure simulator (sealed, ported, passive radiator, bandpass, transmission line, infinite and open baffle), validated against WinISD, Hornresp and SPICE. These tools run its own engine locally.
How to use: find the driver with search_drivers (or take T/S values from the user), then suggest_boxes for sized starting points, or simulate for boxes the user describes; find_passive_radiators picks PRs. Always give the user the share_link from simulate/suggest_boxes so they can open the design in the app. Numbers are SPL dB at 1 m, excursion mm one way peak, port air speed m/s peak (17 m/s is the usual quiet-port line). Default drive is 1 W like WinISD: pass drive "rated" or {"watts": …} to check limits at real power. Data licence: most drivers CC BY-NC-SA 4.0; a few brands under their own terms (get_driver says) — don't republish bulk data.`;

const ABOUT = `# Speaker Box Genius MCP server

Runs the app's own simulation code on your machine (version ${VERSION}). Results match the web app at ${SITE} exactly; the app is validated against WinISD, Hornresp and SPICE (${SITE}/validation/).

- Nothing about your designs leaves this machine. The only requests are GETs of the public driver database (${SITE}/db/), cached locally.
- No account, no telemetry. Share links end in ?ref=mcp (before the #) so the site can count visits from AI answers; never the design.
- Source: https://github.com/daliusiv/speaker-box-genius (PolyForm Noncommercial 1.0.0). Driver data: CC BY-NC-SA 4.0, with some brands under their own terms (see get_driver).`;

const RESOURCES = [
  { uri: "sbg://about", name: "About this server", mimeType: "text/markdown", text: () => ABOUT },
  { uri: "sbg://schema/sim-request", name: "SimRequest JSON Schema (simulate's input)", mimeType: "application/schema+json", text: () => JSON.stringify(simRequestSchema, null, 2) },
];

const PROMPTS = [
  {
    name: "design_a_box",
    title: "Design a box",
    description: "Pick and compare box designs for a driver and goal, with share links.",
    arguments: [
      { name: "driver", description: "The driver (brand and model, or T/S values)", required: true },
      { name: "goal", description: "What it's for, size limits, power, how deep it should go", required: false },
    ],
  },
];

/** The MCP server for a database (the caller connects a transport). */
export function createServer(db: Database, opts: { site?: string; ref?: LinkRef | null } = {}): Server {
  const ctx: ToolContext = { db, site: opts.site, ref: opts.ref === null ? undefined : (opts.ref ?? "mcp") };
  const server = new Server({ name: "speaker-box-genius", title: "Speaker Box Genius", version: VERSION, websiteUrl: SITE }, { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema as never, annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool ${req.params.name}. Tools: ${TOOLS.map((t) => t.name).join(", ")}` }] };
    try {
      const out = await tool.run((req.params.arguments ?? {}) as Record<string, unknown>, ctx);
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out as Record<string, unknown> };
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Something went wrong: ${String(e)}`;
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const r = RESOURCES.find((x) => x.uri === req.params.uri);
    if (!r) throw new Error(`No resource ${req.params.uri}`);
    return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text() }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== "design_a_box") throw new Error(`No prompt ${req.params.name}`);
    const a = req.params.arguments ?? {};
    return {
      description: "Design a box",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me design a speaker box for ${a.driver ?? "my driver"}.${a.goal ? ` Goal: ${a.goal}.` : ""}
Use the Speaker Box Genius tools: find the driver (search_drivers), get sized starting points (suggest_boxes) at its power rating, then simulate the most promising ones against my goal (adjust volume and tuning; find_passive_radiators for PR boxes). Compare F3, max SPL and which limit bites first (excursion, port speed, power), recommend one, and give me the share links so I can open each design in the app.`,
          },
        },
      ],
    };
  });
  return server;
}
