import { useRef, type ReactNode } from "react";
import type { ButtonVariant } from "./Button.tsx";

/**
 * A button that opens the file picker and hands back the chosen file. Looks like a Button;
 * Enter or Space opens the picker from the keyboard.
 */
export function FileButton(props: { accept?: string; title?: string; variant?: ButtonVariant; onFile: (f: File) => void; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className="ui-button"
      data-variant={props.variant ?? "secondary"}
      data-size="md"
      title={props.title}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
    >
      {props.children}
      <input
        ref={input}
        type="file"
        accept={props.accept}
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) props.onFile(f);
        }}
      />
    </label>
  );
}
