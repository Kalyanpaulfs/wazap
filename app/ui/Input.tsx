import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { controlClasses, Field } from "./Field";
import { cx } from "./cx";

type FieldExtras = { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapperClassName?: string };

export function Input({
  label, hint, error, wrapperClassName, className, ...rest
}: FieldExtras & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a11y) => <input className={cx(controlClasses, "min-h-11", className)} {...a11y} {...rest} />}
    </Field>
  );
}

export function Textarea({
  label, hint, error, wrapperClassName, className, ...rest
}: FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a11y) => <textarea className={cx(controlClasses, "min-h-28 py-3", className)} {...a11y} {...rest} />}
    </Field>
  );
}

export function Select({
  label, hint, error, wrapperClassName, className, children, ...rest
}: FieldExtras & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a11y) => (
        <select className={cx(controlClasses, "min-h-11 cursor-pointer", className)} {...a11y} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
