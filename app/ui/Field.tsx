import { useId, type ReactNode } from "react";
import { cx } from "./cx";

type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (a11y: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
};

/** Label + control + hint/error wiring. Inputs render through this so ids and aria stay correct. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const noteId = hint || error ? `${id}-note` : undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
      )}
      {children({ id, "aria-describedby": noteId, "aria-invalid": error ? true : undefined })}
      {(error || hint) && (
        <p id={noteId} className={cx("text-sm", error ? "text-danger" : "text-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const controlClasses =
  "w-full rounded-xl border border-border-strong bg-surface px-4 text-[15px] text-text placeholder:text-muted/70 transition-colors duration-200 hover:border-muted focus-visible:border-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 aria-[invalid=true]:border-danger";
