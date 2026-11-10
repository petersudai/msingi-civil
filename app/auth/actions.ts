"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { auth } from "@/lib/auth/server";

export type AuthField = "name" | "email" | "password";

export interface AuthState {
  error?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** Echoed back so a failed attempt doesn't wipe what was typed. Never the password. */
  values?: { name?: string; email?: string };
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("That doesn't look like an email address."));

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "That name is too long."),
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
});

const NOT_CONFIGURED: AuthState = { error: "Accounts aren't set up in this build." };
const GENERIC_FAILURE = "Something went wrong on our side. Try again in a moment.";

function field(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function fieldErrors(error: z.ZodError): Partial<Record<AuthField, string>> {
  const out: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as AuthField;
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function signInAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  if (!auth) return NOT_CONFIGURED;
  const values = { email: field(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: field(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    const { error } = await auth.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      return {
        error: error.code?.startsWith("NETWORK_")
          ? "Couldn't reach the sign-in service. Check your connection and try again."
          : "That email and password don't match an account.",
        values,
      };
    }
  } catch {
    return { error: GENERIC_FAILURE, values };
  }
  redirect(safeNextPath(field(formData, "next")));
}

export async function signUpAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  if (!auth) return NOT_CONFIGURED;
  const values = { name: field(formData, "name"), email: field(formData, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: field(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    const { error } = await auth.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      if (error.code?.startsWith("NETWORK_")) {
        return {
          error: "Couldn't reach the sign-up service. Check your connection and try again.",
          values,
        };
      }
      // Better Auth words these clearly (already registered, password too short).
      return { error: error.message || "Couldn't create the account.", values };
    }
  } catch {
    return { error: GENERIC_FAILURE, values };
  }
  redirect(safeNextPath(field(formData, "next")));
}

export async function signOutAction(): Promise<void> {
  if (auth) {
    try {
      await auth.signOut();
    } catch {
      // Signing out locally must never be blocked by the auth server being down.
    }
  }
  redirect("/auth/sign-in");
}
