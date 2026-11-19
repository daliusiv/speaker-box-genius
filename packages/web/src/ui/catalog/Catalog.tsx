import { useState, type ReactNode } from "react";
import tokens from "../tokens.json";
import { Button, Card, Chip, FieldRow, Menu, Notice, NumberField, Popover, RadioCards, Readout, Section, Segmented, Select, Sheet, Stepper, Switch, TextField, Tooltip } from "../index.ts";

/**
 * /ui/: every component in every state, on the app's own stylesheets. It is the reference for
 * reviews and mockups, and Playwright screenshots it at 390 and 1280 px (e2e/ui.spec.ts).
 */
export function Catalog() {
  return (
    <main className="cat">
      <header className="cat-head">
        <h1>UI kit</h1>
        <p>Speaker Box Genius components and tokens. Use these, not raw elements; values come from tokens only.</p>
        <nav className="cat-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${slug(s)}`}>
              {s}
            </a>
          ))}
        </nav>
      </header>
      <Tokens />
      <Buttons />
      <Fields />
      <Choices />
      <Sections />
      <Overlays />
      <Feedback />
      <Recipe />
    </main>
  );
}

const SECTIONS = ["Tokens", "Buttons", "Fields", "Choices", "Sections", "Overlays", "Feedback", "Panel recipe"];
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function Block(props: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="cat-block" id={slug(props.title)} aria-labelledby={`${slug(props.title)}-h`}>
      <h2 id={`${slug(props.title)}-h`}>{props.title}</h2>
      {props.note && <p className="cat-note">{props.note}</p>}
      <div className="cat-grid">{props.children}</div>
    </section>
  );
}

function Specimen(props: { name: string; children: ReactNode }) {
  return (
    <div className="cat-specimen">
      <h3>{props.name}</h3>
      <div className="cat-specimen-body">{props.children}</div>
    </div>
  );
}

function Tokens() {
  return (
    <Block title="Tokens" note="Edit src/ui/tokens.json, then run pnpm tokens.">
      <Specimen name="Space (4 px grid)">
        {Object.entries(tokens.space).map(([k, v]) => (
          <div className="cat-token" key={k}>
            <span className="cat-bar" style={{ width: v }} />
            <code>--space-{k}</code>
            <span data-numeric>{v} px</span>
          </div>
        ))}
      </Specimen>
      <Specimen name="Type">
        {Object.entries(tokens.text).map(([k, v]) => (
          <div className="cat-token" key={k} style={{ fontSize: `var(--text-${k})` }}>
            <span>Fs 30.0 Hz</span>
            <code>--text-{k}</code>
            <span data-numeric>{typeof v === "number" ? `${v} px` : `${v.default} px · touch ${v.touch} px`}</span>
          </div>
        ))}
      </Specimen>
      <Specimen name="Radius">
        <div className="cat-row">
          {Object.entries(tokens.radius).map(([k, v]) => (
            <span className="cat-radius" key={k} style={{ borderRadius: v }}>
              <code>{k}</code>
            </span>
          ))}
        </div>
      </Specimen>
      <Specimen name="Colour">
        <div className="cat-swatches">
          {Object.entries(tokens.color).map(([k, v]) => (
            <span className="cat-swatch" key={k}>
              <span style={{ background: v }} />
              <code>--{k}</code>
            </span>
          ))}
        </div>
      </Specimen>
    </Block>
  );
}

function Buttons() {
  return (
    <Block title="Buttons" note="One primary per screen. Secondary by default; ghost for quiet actions in a row; icon-only needs a label.">
      <Specimen name="Variants">
        <div className="cat-row">
          <Button variant="primary" icon="share">
            Share
          </Button>
          <Button>Fill from…</Button>
          <Button variant="ghost" icon="external">
            Specs
          </Button>
          <Button variant="danger" icon="trash">
            Delete
          </Button>
        </div>
      </Specimen>
      <Specimen name="Sizes, icon-only, disabled">
        <div className="cat-row">
          <Button size="sm">Small</Button>
          <Button icon="plus">Add a box</Button>
          <Button variant="ghost" icon="trash" label="Clear all T/S values" />
          <Button variant="ghost" size="sm" icon="close" label="Close" />
          <Button disabled>Disabled</Button>
        </div>
      </Specimen>
    </Block>
  );
}

function Fields() {
  const [fs, setFs] = useState<number | undefined>(30);
  const [xmax, setXmax] = useState<number | undefined>(12);
  const [drivers, setDrivers] = useState(1);
  return (
    <Block title="Fields" note="Label left, control right, one right edge. Units sit inside the box; numbers are right-aligned tabular figures.">
      <Specimen name="Number field states">
        <FieldRow label="Fs">{(id) => <NumberField id={id} value={fs} unit="Hz" state="typed" onChange={setFs} />}</FieldRow>
        <FieldRow label="Qts">{(id) => <NumberField id={id} value={undefined} placeholder="0.371" state="calculated" onChange={() => {}} />}</FieldRow>
        <FieldRow label="Xmax" hint="One-way linear excursion from the datasheet.">
          {(id) => <NumberField id={id} value={xmax} unit="mm" onChange={setXmax} />}
        </FieldRow>
        <FieldRow label="Vb">{(id) => <NumberField id={id} value={-4} unit="L" min={0} onChange={() => {}} />}</FieldRow>
      </Specimen>
      <Specimen name="Text field">
        <TextField type="search" icon="search" placeholder="Search 1,613 drivers" aria-label="Search" />
        <TextField defaultValue="Dayton Audio DSA215-8" aria-label="Name" />
      </Specimen>
      <Specimen name="Stepper, select, readout">
        <FieldRow label="Number of drivers">{(id) => <Stepper id={id} label="Number of drivers" value={drivers} onChange={setDrivers} />}</FieldRow>
        <FieldRow label="Port shape">
          {(id) => (
            <Select
              id={id}
              value="round"
              options={[
                { value: "round", label: "Round tube" },
                { value: "slot", label: "Slot" },
              ]}
              onChange={() => {}}
            />
          )}
        </FieldRow>
        <Readout label="Amp load (min)" value="3.45 Ω @ 195 Hz" />
        <Readout label="Port speed" value="21.4 m/s" tone="over" />
      </Specimen>
    </Block>
  );
}

function Choices() {
  const [loading, setLoading] = useState<"standard" | "isobaric">("standard");
  const [coil, setCoil] = useState<"le" | "semi">("le");
  const [cap, setCap] = useState(false);
  const [hp, setHp] = useState(true);
  return (
    <Block title="Choices" note="Segmented for 2–4 short options; radio cards (a quiet list; boxed cards for big choices) when each option needs a line; switches apply at once.">
      <Specimen name="Segmented and switch">
        <FieldRow label="Loading">
          {(id) => (
            <Segmented
              id={id}
              label="Loading"
              value={loading}
              options={[
                { value: "standard", label: "Normal" },
                { value: "isobaric", label: "Isobaric" },
              ]}
              onChange={setLoading}
            />
          )}
        </FieldRow>
        <FieldRow label="Series capacitor">{(id) => <Switch id={id} checked={cap} onChange={setCap} />}</FieldRow>
        <FieldRow label="High-pass filter">{(id) => <Switch id={id} checked={hp} onChange={setHp} />}</FieldRow>
      </Specimen>
      <Specimen name="Radio cards">
        <RadioCards
          legend="Coil model"
          value={coil}
          options={[
            { value: "le", title: "Le (+ L2/R2)", description: "Datasheet values", aside: <Chip>Default</Chip> },
            { value: "semi", title: "Semi-inductance", description: "Fitted, like Hornresp" },
          ]}
          onChange={setCoil}
        />
      </Specimen>
      <Specimen name="Radio cards, card variant">
        <RadioCards
          legend="Coil model"
          variant="card"
          value={coil}
          options={[
            { value: "le", title: "Le (+ L2/R2)", description: "Datasheet values", aside: <Chip>Default</Chip> },
            { value: "semi", title: "Semi-inductance", description: "Fitted, like Hornresp" },
          ]}
          onChange={setCoil}
        />
      </Specimen>
    </Block>
  );
}

function Sections() {
  return (
    <Block title="Sections" note="One collapsible row each; the value says what's inside while closed.">
      <Specimen name="Closed and open">
        <div className="cat-flush">
          <Section icon="signal" title="Large signal" value="Xmax 12 mm · Pe 250 W">
            <FieldRow label="Xmax">{(id) => <NumberField id={id} value={12} unit="mm" onChange={() => {}} />}</FieldRow>
          </Section>
          <Section icon="circuit" title="Wiring" value="Normal · single coil · 4 Ω" open>
            <FieldRow label="Znom">{(id) => <NumberField id={id} value={4} unit="Ω" onChange={() => {}} />}</FieldRow>
            <Readout label="Amp load (min)" value="3.45 Ω @ 195 Hz" />
          </Section>
        </div>
      </Specimen>
    </Block>
  );
}

function Overlays() {
  const [sheet, setSheet] = useState(false);
  const [bottom, setBottom] = useState(false);
  const [pop, setPop] = useState(false);
  return (
    <Block title="Overlays" note="Menus for 2+ secondary actions; sheets are full screen on phones; tooltips hold short notes.">
      <Specimen name="Menu (open)">
        <div className="cat-menu-room">
          <Menu
            label="Fill from"
            defaultOpen
            items={[
              { label: "Paste from datasheet…", onSelect: () => {} },
              { label: "Measure from an impedance sweep (.zma)…", onSelect: () => {} },
              { kind: "separator" },
              { label: "WinISD or OpenISD file…", onSelect: () => {} },
            ]}
          />
        </div>
      </Specimen>
      <Specimen name="Choice menu (open): a unit switch on phones">
        <div className="cat-menu-room">
          <Menu
            label="N"
            ariaLabel="Show: Force"
            variant="ghost"
            defaultOpen
            items={[
              { label: "Excursion", detail: "mm", checked: false, onSelect: () => {} },
              { label: "Velocity", detail: "m/s", checked: false, onSelect: () => {} },
              { label: "Acceleration", detail: "g", checked: false, onSelect: () => {} },
              { label: "Force", detail: "N", checked: true, onSelect: () => {} },
            ]}
          />
        </div>
      </Specimen>
      <Specimen name="Icon menu, tooltip, sheet">
        <div className="cat-row">
          <Menu label="Driver tools" icon="wrench" iconOnly items={[{ label: "Export WinISD .wdr…", onSelect: () => {} }]} />
          <Tooltip label="Peak values">Peaks are taken above 20 Hz for every box.</Tooltip>
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="T/S parameters" footer={<Button variant="primary" onClick={() => setSheet(false)}>Done</Button>}>
          <FieldRow label="Fs">{(id) => <NumberField id={id} value={30} unit="Hz" state="typed" onChange={() => {}} />}</FieldRow>
        </Sheet>
      </Specimen>
      <Specimen name="Popover: live settings under their button; on phones a bottom sheet">
        <div className="cat-menu-room cat-row">
          <Popover
            open={pop}
            onClose={() => setPop(false)}
            label="Program signal"
            align="start"
            trigger={(id) => (
              <Button variant="ghost" icon="wave" aria-expanded={pop} aria-controls={pop ? id : undefined} onClick={() => setPop((v) => !v)}>
                Program: Pink noise 6 dB ▾
              </Button>
            )}
          >
            <FieldRow label="Crest factor">{(id) => <NumberField id={id} value={6} unit="dB" onChange={() => {}} />}</FieldRow>
            <FieldRow label="Target SPL">{(id) => <NumberField id={id} value={105} unit="dB" onChange={() => {}} />}</FieldRow>
          </Popover>
          <Button onClick={() => setBottom(true)}>Open bottom sheet</Button>
        </div>
        <Sheet bottom open={bottom} onClose={() => setBottom(false)} title="Program signal" footer={<Button variant="primary" onClick={() => setBottom(false)}>Done</Button>}>
          <FieldRow label="Crest factor">{(id) => <NumberField id={id} value={6} unit="dB" onChange={() => {}} />}</FieldRow>
        </Sheet>
      </Specimen>
    </Block>
  );
}

function Feedback() {
  const [on, setOn] = useState(true);
  return (
    <Block title="Feedback" note="Colour is never the only cue: tones carry an icon or words.">
      <Specimen name="Chips">
        <div className="cat-row">
          <Chip>EBP 75 · Qts 0.37</Chip>
          <Chip tone="accent">Selected</Chip>
          <Chip tone="warn">Near Xmax</Chip>
          <Chip tone="over">Over Xmax</Chip>
          <Chip pressed={on} onClick={() => setOn(!on)}>
            1 W
          </Chip>
        </div>
      </Specimen>
      <Specimen name="Notices">
        <Notice>Values you type are never overwritten.</Notice>
        <Notice tone="warn">Still needed to simulate: Sd.</Notice>
        <Notice tone="over">Port speed 21.4 m/s is over the 17 m/s limit.</Notice>
      </Specimen>
    </Block>
  );
}

function Recipe() {
  const [drivers, setDrivers] = useState(1);
  return (
    <Block title="Panel recipe" note="A card with a title row, rows on the field grid, then sections. The driver card follows this.">
      <div className="cat-recipe">
        <Card
          title="Driver"
          flush
          actions={
            <>
              <Button variant="ghost" icon="external">
                Specs
              </Button>
              <Button variant="ghost" icon="sliders">
                Edit T/S
              </Button>
            </>
          }
        >
          <div className="cat-pad">
            <FieldRow label="Number of drivers">{(id) => <Stepper id={id} label="Number of drivers" value={drivers} onChange={setDrivers} />}</FieldRow>
          </div>
          <Section icon="signal" title="Large signal" value="Xmax 12 mm · Pe 250 W">
            <FieldRow label="Xmax">{(id) => <NumberField id={id} value={12} unit="mm" onChange={() => {}} />}</FieldRow>
          </Section>
          <Section icon="sliders" title="Coil & suspension" value="Le 1.2 mH · from Qms">
            <FieldRow label="Le">{(id) => <NumberField id={id} value={1.2} unit="mH" onChange={() => {}} />}</FieldRow>
          </Section>
          <Section icon="charts" title="Compare" value="Off">
            <Notice>Pick a second driver to compare.</Notice>
          </Section>
        </Card>
      </div>
    </Block>
  );
}
