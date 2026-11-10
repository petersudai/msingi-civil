import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { LocalOnlyNotice } from "@/components/auth/local-only-notice";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { isCloudConfigured } from "@/lib/cloud/config";
import { BackupPanel } from "./backup-panel";

export const metadata: Metadata = { title: "Account" };

// Reads the session cookie, so it can't be prerendered.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const configured = isCloudConfigured();
  const user = configured ? await getCurrentUser() : null;

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 md:px-6 md:pt-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Account</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Your work lives on this device first. An account only adds cloud backup, so a lost
          phone doesn&apos;t mean lost calculations.
        </p>
      </header>

      {!configured ? (
        <LocalOnlyNotice />
      ) : user ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-0.5 break-words text-[15px] font-semibold">
              {user.name ? `${user.name} · ` : ""}
              {user.email}
            </p>
            <BackupPanel />
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" className="h-12 w-full text-muted-foreground">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
          <p className="px-1 text-[12.5px] leading-snug text-muted-foreground">
            Signing out keeps your saved calculations on this device.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-[15px] font-semibold">You&apos;re not signed in</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Sign in or create an account to back up your saved calculations and restore them on
            another device.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button asChild className="h-12">
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link href="/auth/sign-up">Create account</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
