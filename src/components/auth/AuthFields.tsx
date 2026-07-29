/**
 * Shared auth form primitives — presentation only.
 * No validation logic lives here; callers pass an `error` string.
 */
import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const FIELD_CLASS =
  "h-[54px] w-full rounded-xl border border-[hsl(222_40%_88%)] bg-white px-4 text-base text-[hsl(224_45%_16%)] placeholder:text-[hsl(222_15%_60%)] transition-colors focus:border-[hsl(222_88%_42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(222_88%_42%/0.25)] disabled:opacity-60";

export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[hsl(224_35%_28%)]">
      {children}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-[hsl(0_72%_45%)]">
      {message}
    </p>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const AuthField = forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { label, error, hint, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errId = `${fieldId}-error`;
  return (
    <div>
      <AuthLabel htmlFor={fieldId}>{label}</AuthLabel>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={`${FIELD_CLASS} ${error ? "border-[hsl(0_72%_55%)]" : ""} ${className}`}
        {...rest}
      />
      {hint && !error ? <p className="mt-1.5 text-xs text-[hsl(222_15%_50%)]">{hint}</p> : null}
      <FieldError id={errId} message={error} />
    </div>
  );
});

export const AuthPasswordField = forwardRef<HTMLInputElement, FieldProps>(function AuthPasswordField(
  { label, error, hint, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errId = `${fieldId}-error`;
  const [show, setShow] = useState(false);
  return (
    <div>
      <AuthLabel htmlFor={fieldId}>{label}</AuthLabel>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={show ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={`${FIELD_CLASS} pr-12 ${error ? "border-[hsl(0_72%_55%)]" : ""}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Skjul adgangskode" : "Vis adgangskode"}
          className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[hsl(222_15%_50%)] transition-colors hover:text-[hsl(222_88%_42%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
        >
          {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>
      {hint && !error ? <p className="mt-1.5 text-xs text-[hsl(222_15%_50%)]">{hint}</p> : null}
      <FieldError id={errId} message={error} />
    </div>
  );
});

export function AuthSelect({
  label,
  id,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div>
      <AuthLabel htmlFor={fieldId}>{label}</AuthLabel>
      <select id={fieldId} className={FIELD_CLASS} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function AuthSubmit({
  loading,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="submit"
      aria-busy={loading || undefined}
      className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(222_88%_42%)] text-base font-semibold text-white shadow-[0_10px_24px_-12px_hsl(222_88%_42%/0.9)] transition-all hover:bg-[hsl(222_88%_37%)] active:scale-[0.99] disabled:opacity-55"
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium text-[hsl(222_15%_52%)]">
      <span className="h-px flex-1 bg-[hsl(222_40%_90%)]" />
      {label}
      <span className="h-px flex-1 bg-[hsl(222_40%_90%)]" />
    </div>
  );
}

export function GoogleButton({
  onClick,
  disabled,
  label = "Fortsæt med Google",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-xl border border-[hsl(222_40%_88%)] bg-white text-base font-semibold text-[hsl(224_45%_16%)] transition-colors hover:bg-[hsl(210_60%_98%)] disabled:opacity-55"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A8.99 8.99 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.32z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      {label}
    </button>
  );
}

/** Small trust row shown under the signup form. */
export function AuthTrustNote() {
  return (
    <ul
      data-testid="auth-trust-note"
      className="mt-5 grid gap-1.5 rounded-xl bg-[hsl(210_60%_97%)] p-4 text-sm text-[hsl(224_25%_38%)]"
    >
      <li className="font-semibold text-[hsl(224_45%_16%)]">Sikker konto</li>
      <li>Dine oplysninger er beskyttet</li>
      <li>Ingen betaling ved oprettelse</li>
    </ul>
  );
}
