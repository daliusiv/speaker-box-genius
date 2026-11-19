import type { ImportReport } from "./importReport.ts";
import { Button, Disclosure, Notice } from "./ui/index.ts";

/**
 * What the last import did, under the driver card: one line, and the values the file didn't
 * have folded under "N values assumed" (each with what was used and why). ✕ dismisses it; the
 * next import replaces it.
 */
export function ImportNotice(props: { report: ImportReport; onClose: () => void }) {
  const { text, assumed, error } = props.report;
  return (
    <div className="import-report">
      <Notice tone={error ? "warn" : "info"}>
        <div className="import-report-head">
          <p>{text}</p>
          <Button variant="ghost" icon="close" label="Dismiss" onClick={props.onClose} />
        </div>
        {assumed.length > 0 && (
          <Disclosure title={`${assumed.length} value${assumed.length > 1 ? "s" : ""} assumed`} value="not in the file">
            <ul className="import-report-list">
              {assumed.map((a) => (
                <li key={a.field}>
                  <span className="import-report-field">{a.field}</span>
                  <span className="import-report-value" data-numeric>
                    {a.value}
                  </span>
                  {a.note && <span className="import-report-note">{a.note}</span>}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Notice>
    </div>
  );
}
