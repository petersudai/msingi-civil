import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { LocalOnlyNotice } from "@/components/auth/local-only-notice";
import { safeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/server";
import { isCloudConfigured } from "@/lib/cloud/config";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

// Reads the session cookie, so it can't be prerendered.
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);
  if (await getCurrentUser()) redirect(target);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 md:px-6 md:pt-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Create account
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          An account only adds cloud backup. Your calculations stay on this device either way,
          and every tool works without one.
        </p>
      </header>
      {isCloudConfigured() ? (
        <AuthForm mode="sign-up" action={signUpAction} next={next ? target : undefined} />
      ) : (
        <LocalOnlyNotice />
      )}
    </div>
  );
}
