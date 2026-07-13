import type { CalcSheetData } from "./types";

/**
 * Client-side PDF generation. Both @react-pdf/renderer and the document
 * component load lazily here, so the ~1 MB PDF engine never touches the
 * initial page load; it downloads the first time the user taps Export.
 */
export async function downloadCalcSheetPdf(data: CalcSheetData): Promise<void> {
  const [{ pdf }, { CalcSheetDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./calc-sheet-document"),
  ]);

  const blob = await pdf(<CalcSheetDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = data.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
