"use client";

import { cn } from "@repo/ui";
import { Search } from "lucide-react";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

/**
 * Form fields (ADR-UX1 §component-kit / §8 forms). Label above the control,
 * required asterisk, helper text, inline error + danger border, disabled. One
 * `Field` wrapper gives every input the same rhythm; `FormRow`/`FormSection`
 * standardize form spacing (16px field gap, 24px section gap).
 */
const controlBase =
  "w-full rounded-md border bg-white px-3 text-body text-neutral-800 placeholder:text-neutral-400 " +
  "focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 " +
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:opacity-60";

function borderClass(error?: string) {
  return error ? "border-danger-500" : "border-neutral-300";
}

export function Field({
  label,
  required,
  helper,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  helper?: string | undefined;
  error?: string | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
        {label}
        {required && <span className="ml-0.5 text-danger-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-danger-600" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-caption text-neutral-500">{helper}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, required, id, className, ...props },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} required={required} helper={helper} error={error} htmlFor={fieldId}>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, borderClass(error), "h-11", className)}
        {...props}
      />
    </Field>
  );
});

/** Calendar-date input (IST dates are formatted by @repo/utils at render). */
export const DateField = forwardRef<HTMLInputElement, InputProps>(function DateField(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helper, error, required, id, className, children, ...props },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} required={required} helper={helper} error={error} htmlFor={fieldId}>
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, borderClass(error), "h-11", className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});

/** Search box with a leading icon — the standard list/toolbar search control. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchInput({ className, ...props }, ref) {
    return (
      <div className="relative">
        <Search
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
        />
        <input
          ref={ref}
          type="search"
          className={cn(controlBase, borderClass(), "h-11 pl-9", className)}
          placeholder="Search…"
          {...props}
        />
      </div>
    );
  },
);

/** Consistent form rhythm: 16px between fields, 24px between sections. */
export function FormRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
}

export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 [&:not(:first-child)]:mt-6">
      {title && <h3 className="text-title text-neutral-800">{title}</h3>}
      {children}
    </section>
  );
}
