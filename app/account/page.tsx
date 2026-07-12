"use client";

import type { Session } from "@supabase/supabase-js";
import { CloudDownload, CloudUpload, HardDrive, Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSavedCalculations } from "@/lib/store/saved-calculations";
import { getSupabase } from "@/lib/supabase/client";
import { backupCalculations, restoreCalculations } from "@/lib/supabase/sync";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-6 md:px-6 md:pt-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Account
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Your work lives on this device first. An account only adds cloud
          backup, so a lost phone doesn&apos;t mean lost calculations.
        </p>
      </header>
      <AccountPanel />
    </div>
  );
}

function AccountPanel() {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  // Already "checked" when there's no backend to ask.
  const [checked, setChecked] = useState(supabase === null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) return <LocalOnlyNotice />;
  if (!checked) return null;
  return session ? <SignedIn email={session.user.email ?? ""} /> : <AuthForm />;
}

function LocalOnlyNotice() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <HardDrive className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-[15px] font-semibold">Working in local mode</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Saved calculations are stored on this device and work fully offline.
            Cloud backup isn&apos;t configured in this build — when it is, this
            screen becomes sign-in. Nothing else about the tools changes.
          </p>
        </div>
      </div>
    </div>
  );
}

function AuthForm() {
  const supabase = getSupabase();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!email.trim() || !password) {
      toast.error("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Account created", {
          description: "Check your email if confirmation is required.",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sign-in failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="auth-email" className="text-[13px] font-semibold">
          Email
        </Label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          className="h-12 text-base"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="auth-password" className="text-[13px] font-semibold">
          Password
        </Label>
        <Input
          id="auth-password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="h-12 text-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy} className="h-12 w-full">
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-primary underline-offset-4 hover:underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}

function SignedIn({ email }: { email: string }) {
  const supabase = getSupabase();
  const items = useSavedCalculations((s) => s.items);
  const merge = useSavedCalculations((s) => s.merge);
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);

  async function backup() {
    setBusy("backup");
    try {
      const count = await backupCalculations(items);
      toast.success(
        count === 0
          ? "Nothing to back up yet"
          : `Backed up ${count} calculation${count === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup failed.");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      const records = await restoreCalculations();
      merge(records);
      toast.success(
        records.length === 0
          ? "No cloud backups found"
          : `Restored ${records.length} calculation${records.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-0.5 text-[15px] font-semibold">{email}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-12"
            onClick={backup}
            disabled={busy !== null}
          >
            {busy === "backup" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <CloudUpload aria-hidden="true" />
            )}
            Back up ({items.length})
          </Button>
          <Button
            variant="outline"
            className="h-12"
            onClick={restore}
            disabled={busy !== null}
          >
            {busy === "restore" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <CloudDownload aria-hidden="true" />
            )}
            Restore from cloud
          </Button>
        </div>
        <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground">
          Backup pushes this device&apos;s saved calculations to your account.
          Restore merges your cloud copies onto this device — newer versions win.
        </p>
      </div>
      <Button
        variant="ghost"
        className="h-12 w-full text-muted-foreground"
        onClick={async () => {
          await supabase?.auth.signOut();
          toast.success("Signed out — your local data stays on this device.");
        }}
      >
        <LogOut aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
