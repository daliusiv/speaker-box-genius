/** On/off, applied at once (for a choice that needs Save, use a checkbox in a form). */
export function Switch(props: { id?: string; checked: boolean; onChange: (v: boolean) => void; "aria-label"?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      id={props.id}
      className="ui-switch"
      aria-checked={props.checked}
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}
