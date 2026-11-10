"use client";

import { CloudDownload, CloudUpload, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backupCalculations, restoreCalculations } from "@/lib/cloud/sync";
import { useSavedCalculations } from "@/lib/store/saved-calculations";

export function BackupPanel() {
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
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-12" onClick={backup} disabled={busy !== null}>
          {busy === "backup" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudUpload aria-hidden="true" />
          )}
          Back up ({items.length})
        </Button>
        <Button variant="outline" className="h-12" onClick={restore} disabled={busy !== null}>
          {busy === "restore" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudDownload aria-hidden="true" />
          )}
          Restore from cloud
        </Button>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground">
        Backup pushes this device&apos;s saved calculations to your account. Restore merges your
        cloud copies onto this device; newer versions win.
      </p>
    </>
  );
}
