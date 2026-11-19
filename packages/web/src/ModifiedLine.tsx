import { Button } from "./ui/index.ts";

/**
 * One quiet line under a database driver or PR whose values were changed here: what changed,
 * and a Reset to the database's values (its help explains what stays).
 */
export function ModifiedLine(props: { text: string; help: string; resetLabel: string; onReset: () => void }) {
  return (
    <p className="modified-line" data-help={props.help} data-help-title="Changed from the database">
      <span>{props.text}</span>
      <Button variant="ghost" onClick={props.onReset} aria-label={props.resetLabel}>
        Reset
      </Button>
    </p>
  );
}
