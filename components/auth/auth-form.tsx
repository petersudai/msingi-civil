"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import type { AuthState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

const COPY: Record<
  Mode,
  { submit: string; pending: string; switchText: string; switchLink: string; switchHref: string }
> = {
  "sign-in": {
    submit: "Sign in",
    pending: "Signing in",
    switchText: "New here?",
    switchLink: "Create an account",
    switchHref: "/auth/sign-up",
  },
  "sign-up": {
    submit: "Create account",
    pending: "Creating account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/auth/sign-in",
  },
};

/**
 * One form for both screens, so sign-in and registration look and behave the
 * same: large touch targets, the right autofill hints for password managers,
 * errors beside the field they belong to, and the typed values kept on error.
 */
export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: Mode;
  action: (prev: AuthState | null, formData: FormData) => Promise<AuthState>;
  /** Where to go after success; already validated server-side. */
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [showPassword, setShowPassword] = useState(false);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const copy = COPY[mode];
  const errors = state?.fieldErrors ?? {};
  const switchHref = next
    ? `${copy.switchHref}?next=${encodeURIComponent(next)}`
    : copy.switchHref;

  return (
    <form action={formAction} noValidate className="space-y-4 rounded-lg border bg-card p-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2.5 text-[13.5px] leading-snug text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {mode === "sign-up" ? (
        <FieldShell id={nameId} label="Name" error={errors.name}>
          <Input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={state?.values?.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            className={cn("h-12 text-base", errors.name && "border-destructive")}
          />
        </FieldShell>
      ) : null}

      <FieldShell id={emailId} label="Email" error={errors.email}>
        <Input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete={mode === "sign-in" ? "username" : "email"}
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state?.values?.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${emailId}-error` : undefined}
          className={cn("h-12 text-base", errors.email && "border-destructive")}
        />
      </FieldShell>

      <FieldShell
        id={passwordId}
        label="Password"
        error={errors.password}
        hint={mode === "sign-up" ? "At least 8 characters." : undefined}
      >
        <div className="relative">
          <Input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? `${passwordId}-error` : undefined}
            className={cn("h-12 pr-12 text-base", errors.password && "border-destructive")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </FieldShell>

      <Button type="submit" disabled={pending} className="h-12 w-full">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {pending ? copy.pending : copy.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {copy.switchText}{" "}
        <Link
          href={switchHref}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {copy.switchLink}
        </Link>
      </p>
    </form>
  );
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] leading-snug text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
