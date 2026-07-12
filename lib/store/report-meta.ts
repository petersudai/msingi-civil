import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Report header details for PDF exports (project name, who prepared it).
 * Remembered across sessions so an engineer sets them once per project.
 */

export interface ReportMeta {
  projectName: string;
  preparedBy: string;
}

interface ReportMetaState extends ReportMeta {
  update: (meta: Partial<ReportMeta>) => void;
}

export const useReportMeta = create<ReportMetaState>()(
  persist(
    (set) => ({
      projectName: "",
      preparedBy: "",
      update: (meta) => set(meta),
    }),
    { name: "msingi-report-meta" },
  ),
);
