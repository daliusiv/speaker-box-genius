import { createContext, useId, useMemo, useState, type ReactNode } from "react";
import {
  brandCase,
  buildRecord,
  checkRecord,
  CREDIT_MAX,
  slugify,
  type Problem,
  type SubmissionFields,
} from "../../db-tools/src/submission.ts";
import type { PrParams } from "./state.ts";
import { Turnstile } from "./Turnstile.tsx";
import {
  Button,
  ButtonLink,
  Notice,
  Sheet,
  TextField,
} from "./ui/index.ts";

/** Opens the submit form for a passive radiator (Designs' PR card); null when the website form is off. */
export const SubmitPrContext = createContext<
  ((name: string, params: PrParams) => void) | null
>(null);

/** Short labels for the one-line summary and the problem list. */
const LABELS: Record<string, [string, string]> = {
  fs: ["Fs", "Hz"],
  qms: ["Qms", ""],
  qes: ["Qes", ""],
  qts: ["Qts", ""],
  vas_l: ["Vas", "L"],
  re: ["Re", "Ω"],
  le_mh: ["Le", "mH"],
  bl: ["Bl", "T·m"],
  mms_g: ["Mms", "g"],
  cms_mm_per_n: ["Cms", "mm/N"],
  sd_cm2: ["Sd", "cm²"],
  xmax_mm: ["Xmax", "mm"],
  xmech_mm: ["Xmech", "mm"],
  pe_w: ["Pe", "W"],
  max_added_mass_g: ["Max added mass", "g"],
};
/** The summary shows these; the rest are counted. */
const SUMMARY_KEYS = ["fs", "qts", "vas_l", "re", "sd_cm2", "xmax_mm"];

export type SubmitStatus =
  | { kind: "edit" }
  | { kind: "sending" }
  | { kind: "done"; prUrl: string; prNumber: number; dryRun?: boolean }
  | { kind: "failed"; message: string };

export interface SubmitDialogProps {
  open: boolean;
  onClose: () => void;
  /** Everything the app already knows about the driver (entered values only). */
  initial: SubmissionFields;
  /** Brand slug → spelling, for suggestions and the database's spelling. */
  brands: ReadonlyMap<string, string>;
  exists: (
    kind: SubmissionFields["kind"],
    brandSlug: string,
    modelSlug: string,
  ) => boolean;
  /** Close the form and open this value in the driver card ("ts.re", "nominal_ohms", or "" for the card). */
  onFix: (field: string) => void;
  /** The GitHub issue form, pre-filled (the fallback). */
  githubUrl: string;
  status: SubmitStatus;
  onSubmit: (
    fields: SubmissionFields,
    credit: string,
    turnstile: string,
  ) => void;
  /** Cloudflare Turnstile's site key; empty → no human check (tests, local dev). */
  siteKey?: string;
}

const today = () => new Date().toISOString().slice(0, 10);
/** The checker writes for GitHub (markdown bold) and for the database file ("Over 15% … inconsistency_reason"). */
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/ Over 15%.*$/, "");
const fmt = (v: number) => String(Number(v.toPrecision(4)));

function label(field: string): string {
  const key = field.split(".").pop() ?? field;
  if (LABELS[key]) return LABELS[key]![0];
  return (
    (
      {
        nominal_ohms: "Impedance",
        ts_wiring: "Coil wiring",
        size_in: "Size",
        params: "Parameters",
        displacement_l: "Displacement",
      } as Record<string, string>
    )[key] ?? "Values"
  );
}

/** Label above a full-width box (and a hint under it): the form's text fields need the width. */
function Field(props: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="sd-field">
      <label className="ui-field-label" htmlFor={id}>
        {props.label}
      </label>
      {props.children(id)}
      {props.hint && <p className="sd-hint">{props.hint}</p>}
    </div>
  );
}

/** The form's own fields; everything else is fixed in the driver card. */
const OWN = new Set(["brand", "model", "source_url"]);

/**
 * "Submit to database…": the app already has the driver's values, so the form asks only for what it
 * can't know (brand, model, datasheet link). Problems with values are listed with a way back to the
 * driver card; the same checks as the database run as you type, so a sent entry doesn't bounce.
 */
export function SubmitDialog(p: SubmitDialogProps) {
  const [brand, setBrand] = useState(
    () => p.brands.get(slugify(p.initial.brand)) ?? brandCase(p.initial.brand),
  );
  const [model, setModel] = useState(p.initial.model);
  const [url, setUrl] = useState(p.initial.source_url ?? "");
  const [credit, setCredit] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [tried, setTried] = useState(false);
  const [token, setToken] = useState("");
  const [humanFailed, setHumanFailed] = useState(false);

  const fields: SubmissionFields = {
    ...p.initial,
    brand,
    model,
    source_url: url,
    inconsistency_reason: anyway
      ? "The submitter confirmed these values are as the datasheet prints them."
      : undefined,
  };
  const built = useMemo(
    () =>
      buildRecord(fields, { kind: "web", today: today(), credit }, p.brands),
    [brand, model, url, credit, anyway, p.initial, p.brands],
  );
  const check = useMemo(
    () => checkRecord(built, { exists: p.exists }),
    [built, p.exists],
  );
  const own = (f: string) => check.errors.filter((e) => e.field === f);
  const valueErrors = check.errors.filter((e) => !OWN.has(e.field));
  const valueNotes = check.warnings.filter((w) => !OWN.has(w.field));
  const inconsistent =
    valueErrors.some((e) => /inconsistency_reason/.test(e.message)) || anyway;
  const canSend = check.errors.length === 0 && (!p.siteKey || !!token);

  const values = (built.record.ts ?? built.record.params ?? {}) as Record<
    string,
    number
  >;
  const shown = SUMMARY_KEYS.filter((k) => values[k] !== undefined).map(
    (k) =>
      `${LABELS[k]![0]} ${fmt(values[k]!)}${LABELS[k]![1] ? ` ${LABELS[k]![1]}` : ""}`,
  );
  const count = Object.keys(values).length;
  const r = built.record;
  const imp =
    r.voice_coils === 2
      ? `Dual ${fmt(p.initial.nominal_ohms ?? 0)} Ω coils (${String(r.ts_wiring ?? "wiring?")})`
      : r.nominal_ohms
        ? `${fmt(r.nominal_ohms as number)} Ω`
        : "";

  if (p.status.kind === "done") {
    return (
      <Sheet
        open={p.open}
        onClose={p.onClose}
        bottom
        title="Thanks!"
        className="sd"
        footer={
          <Button variant="primary" onClick={p.onClose}>
            Done
          </Button>
        }
      >
        <p className="sd-lead">
          <b>
            {built.brand} {String(r.model)}
          </b>{" "}
          {p.status.dryRun
            ? "passed every check. The submission service is in test mode, so no pull request was opened."
            : "is waiting for review. Once a maintainer has checked it against the datasheet, it's in the database for everyone."}
        </p>
        {!p.status.dryRun && (
          <ButtonLink
            variant="ghost"
            href={p.status.prUrl}
            target="_blank"
            rel="noopener"
            icon="external"
          >
            Follow it on GitHub (#{p.status.prNumber})
          </ButtonLink>
        )}
      </Sheet>
    );
  }

  const send = () => {
    setTried(true);
    if (canSend) p.onSubmit(fields, credit, token);
  };

  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      bottom
      title={
        p.initial.kind === "driver"
          ? "Submit driver"
          : "Submit passive radiator"
      }
      className="sd"
      footer={
        <div className="sd-foot">
          <p className="sd-fine">
            Submitting shares these values under{" "}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noopener"
            >
              CC BY-NC-SA 4.0
            </a>
            . Copy them from the maker's datasheet, not another database.
          </p>
          <Button
            variant="primary"
            disabled={p.status.kind === "sending"}
            aria-disabled={!canSend || undefined}
            onClick={send}
          >
            {p.status.kind === "sending" ? "Sending…" : "Submit"}
          </Button>
        </div>
      }
    >
      <div className="sd-values">
        <span>
          {[imp, ...shown].filter(Boolean).join(" · ")}
          {count > shown.length ? ` · ${count} values` : ""}
        </span>
        <Button variant="ghost" size="sm" onClick={() => p.onFix("")}>
          {p.initial.kind === "driver"
            ? "Edit in driver card"
            : "Edit in PR card"}
        </Button>
      </div>

      {(valueErrors.length > 0 || valueNotes.length > 0) && (
        <div className="sd-problems" aria-live="polite">
          {valueErrors.map((e: Problem, i) => (
            <div key={`e${i}`} className="sd-problem" data-tone="over">
              <span>
                <b>{label(e.field)}:</b> {plain(e.message)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => p.onFix(e.field)}
              >
                Fix
              </Button>
            </div>
          ))}
          {valueNotes.map((w, i) => (
            <div key={`w${i}`} className="sd-problem" data-tone="warn">
              <span>{plain(w.message)}</span>
            </div>
          ))}
          {inconsistent && (
            <label className="sd-check">
              <input
                type="checkbox"
                checked={anyway}
                onChange={(e) => setAnyway(e.currentTarget.checked)}
              />
              <span>The datasheet really says this: send it anyway</span>
            </label>
          )}
        </div>
      )}

      <Field label="Brand">
        {(id) => (
          <TextField
            id={id}
            list="sd-brands"
            autoComplete="off"
            value={brand}
            onChange={(e) => setBrand(e.currentTarget.value)}
          />
        )}
      </Field>
      <datalist id="sd-brands">
        {[...p.brands.values()].map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {own("brand").map((e, i) => (
        <p key={i} className="ui-field-hint sd-msg" data-tone="over">
          Brand {plain(e.message)}
        </p>
      ))}
      <Field label="Model">
        {(id) => (
          <TextField
            id={id}
            autoComplete="off"
            value={model}
            onChange={(e) => setModel(e.currentTarget.value)}
          />
        )}
      </Field>
      {own("model").map((e, i) => (
        <p key={i} className="ui-field-hint sd-msg" data-tone="over">
          Model {plain(e.message)}
        </p>
      ))}
      <Field label="Datasheet link">
        {(id) => (
          <TextField
            id={id}
            type="url"
            inputMode="url"
            placeholder="Paste the maker's datasheet or product page"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
        )}
      </Field>
      {(tried || url) &&
        own("source_url").map((e, i) => (
          <p key={i} className="ui-field-hint sd-msg" data-tone="over">
            {url
              ? `Datasheet link: ${plain(e.message)}`
              : "Paste the link to the datasheet these values come from."}
          </p>
        ))}
      {check.warnings
        .filter((w) => w.field === "source_url")
        .map((w, i) => (
          <p key={i} className="ui-field-hint sd-msg" data-tone="warn">
            {plain(w.message)}
          </p>
        ))}
      <Field
        label="Your name (optional)"
        hint="Shown with the entry. Leave empty to stay anonymous."
      >
        {(id) => (
          <TextField
            id={id}
            maxLength={CREDIT_MAX}
            autoComplete="nickname"
            value={credit}
            onChange={(e) => setCredit(e.currentTarget.value)}
          />
        )}
      </Field>

      {p.siteKey && (
        <Turnstile
          siteKey={p.siteKey}
          onToken={setToken}
          onError={() => setHumanFailed(true)}
        />
      )}
      {humanFailed && (
        <Notice tone="warn">
          The human check couldn't load (an ad blocker can stop it).{" "}
          <a href={p.githubUrl} target="_blank" rel="noopener">
            Use the GitHub form instead
          </a>
        </Notice>
      )}
      {p.status.kind === "failed" && (
        <Notice tone="over">
          {p.status.message}{" "}
          <a href={p.githubUrl} target="_blank" rel="noopener">
            Use the GitHub form instead
          </a>
        </Notice>
      )}
    </Sheet>
  );
}
