"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalcSheetData } from "@/lib/pdf/types";
import { type ReportMeta, useReportMeta } from "@/lib/store/report-meta";

/**
 * Exports the current result as a PDF calculation sheet. Asks once for the
 * report header details (project, prepared by) and remembers them.
 */
export function ExportPdfButton({
  buildData,
}: {
  /** Builds the sheet data from the current result + report details. */
  buildData: (meta: ReportMeta) => CalcSheetData;
}) {
  const { projectName, preparedBy, update } = useReportMeta();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);

  async function handleExport() {
    const meta: ReportMeta = {
      projectName: (project ?? projectName).trim(),
      preparedBy: (author ?? preparedBy).trim(),
    };
    update(meta);
    setBusy(true);
    try {
      const { downloadCalcSheetPdf } = await import("@/lib/pdf/generate");
      await downloadCalcSheetPdf(buildData(meta));
      toast.success("Calculation sheet downloaded");
      setOpen(false);
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("The PDF couldn't be generated. Try again, nothing was lost.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10">
          <FileDown aria-hidden="true" />
          Export PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export calculation sheet</DialogTitle>
          <DialogDescription>
            These appear in the sheet&apos;s title block. Both are optional and
            remembered for next time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="export-project" className="text-[13px] font-semibold">
              Project
            </Label>
            <Input
              id="export-project"
              className="h-12 text-base"
              placeholder="e.g. Kilimani Block B"
              value={project ?? projectName}
              onChange={(e) => setProject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-author" className="text-[13px] font-semibold">
              Prepared by
            </Label>
            <Input
              id="export-author"
              className="h-12 text-base"
              placeholder="e.g. Eng. P. Sudai"
              value={author ?? preparedBy}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleExport} disabled={busy} className="h-12 w-full">
            {busy ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Preparing sheet…
              </>
            ) : (
              <>
                <FileDown aria-hidden="true" />
                Download PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
