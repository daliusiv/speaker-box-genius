export function Select<T extends string>(props: {
  id?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  "aria-label"?: string;
}) {
  return (
    <select className="ui-select" id={props.id} value={props.value} aria-label={props["aria-label"]} onChange={(e) => props.onChange(e.currentTarget.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
