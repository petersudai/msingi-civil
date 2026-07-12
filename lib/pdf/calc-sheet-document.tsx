import {
  Document,
  Font,
  Page,
  type Styles,
  Text,
  View,
} from "@react-pdf/renderer";
import type { CalcSheetData } from "./types";

/**
 * A4 calculation sheet mirroring the on-screen results: title block, headline
 * quantities, inputs, numbered working, assumptions, basis — with the
 * preliminary stamp and a standing disclaimer on every page.
 *
 * Embeds the app's IBM Plex faces (served from /public/fonts, fetched only
 * when an export happens) so engineering glyphs — ⁄, →, ≈, × — render
 * correctly and the sheet matches the product's typography. Note: these Plex
 * builds carry no Greek, so engine formula strings avoid symbols like ρ.
 */

// In the browser the fonts resolve against the app origin; in Node (tests)
// against the repo's public/ directory.
const FONT_BASE =
  typeof window === "undefined" ? `${process.cwd()}/public` : "";

Font.register({
  family: "Plex",
  fonts: [
    { src: `${FONT_BASE}/fonts/IBMPlexSans-Regular.woff` },
    { src: `${FONT_BASE}/fonts/IBMPlexSans-SemiBold.woff`, fontWeight: 600 },
    { src: `${FONT_BASE}/fonts/IBMPlexSans-Italic.woff`, fontStyle: "italic" },
  ],
});
Font.register({
  family: "PlexMono",
  fonts: [
    { src: `${FONT_BASE}/fonts/IBMPlexMono-Regular.woff` },
    { src: `${FONT_BASE}/fonts/IBMPlexMono-SemiBold.woff`, fontWeight: 600 },
  ],
});

const INK = "#17242f";
const MUTED = "#4e6170";
const FAINT = "#8aa0ae";
const LINE = "#d4dbe0";
const STAMP = "#b3362b";
const WARN_BG = "#fdf1cf";
const WARN = "#7a5200";
const NOTICE_BG = "#e1eaf1";
const NOTICE = "#0c4160";

// Plain style objects, NOT StyleSheet.create: in @react-pdf/renderer v4,
// styles passed through StyleSheet.create lose `position: "absolute"`, which
// silently breaks the fixed page footer (verified by bisection).
const s: Styles = {
  page: {
    paddingTop: 36,
    paddingBottom: 72,
    paddingHorizontal: 40,
    fontFamily: "Plex",
    fontSize: 9,
    color: INK,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  brand: {
    fontFamily: "PlexMono",
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: 2,
  },
  brandSub: { fontSize: 7, color: MUTED, marginTop: 2, letterSpacing: 1 },
  stampBox: {
    borderWidth: 1.5,
    borderColor: STAMP,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  stampText: {
    color: STAMP,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 0.8,
  },
  titleBlock: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: INK,
    paddingVertical: 8,
    marginBottom: 10,
  },
  toolName: { fontWeight: 600, fontSize: 15 },
  subtitle: { fontFamily: "PlexMono", fontSize: 9, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", marginTop: 8 },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 6.5,
    color: FAINT,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 1.5,
  },
  metaValue: { fontSize: 8.5 },
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: 600,
    color: MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  section: { marginBottom: 12 },
  // Margin-based gutters, not `gap`: yoga's gap on this row makes react-pdf
  // v4 silently drop the absolutely-positioned fixed footer.
  headlineRow: { flexDirection: "row", marginHorizontal: -4 },
  headlineCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    padding: 8,
    marginHorizontal: 4,
  },
  headlineLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase" },
  headlineValue: {
    fontFamily: "PlexMono",
    fontWeight: 600,
    fontSize: 14,
    marginTop: 3,
  },
  headlineUnit: {
    fontFamily: "PlexMono",
    fontWeight: 400,
    fontSize: 8,
    color: MUTED,
  },
  headlineNote: { fontSize: 6.5, color: MUTED, marginTop: 3, lineHeight: 1.3 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderColor: LINE,
    paddingVertical: 3,
  },
  rowLabel: { fontSize: 8.5, color: MUTED },
  rowValue: { fontFamily: "PlexMono", fontSize: 8.5 },
  warning: {
    borderRadius: 2,
    padding: 6,
    marginBottom: 4,
    fontSize: 8,
    lineHeight: 1.35,
  },
  step: { flexDirection: "row", marginBottom: 7 },
  stepNum: {
    fontFamily: "PlexMono",
    fontSize: 8,
    color: FAINT,
    width: 18,
  },
  stepBody: { flex: 1 },
  stepTitle: { fontWeight: 600, fontSize: 8.5 },
  stepFormula: {
    fontFamily: "PlexMono",
    fontSize: 8,
    color: MUTED,
    marginTop: 1.5,
  },
  stepCalc: { fontFamily: "PlexMono", fontSize: 8, marginTop: 1 },
  stepResult: { fontFamily: "PlexMono", fontWeight: 600 },
  stepNote: {
    fontStyle: "italic",
    fontSize: 7.5,
    color: MUTED,
    marginTop: 1.5,
  },
  assumptionRow: { marginBottom: 4 },
  assumptionMain: { flexDirection: "row", justifyContent: "space-between" },
  assumptionSource: { fontSize: 7, color: FAINT, marginTop: 1 },
  basisItem: { fontSize: 8, lineHeight: 1.4, marginBottom: 4 },
  basisLabel: { fontWeight: 600 },
  // Footer = bare fixed Texts with absolute positions. Wrapping the footer
  // in a fixed absolute View trips a react-pdf v4 pagination bug that either
  // drops it or stretches it across the page — bare Texts render reliably
  // on every page (the library's own page-number pattern).
  footerDisclaimer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 32,
    fontSize: 6.5,
    color: MUTED,
  },
  footerLeft: {
    position: "absolute",
    left: 40,
    bottom: 22,
    fontSize: 6.5,
    color: MUTED,
  },
  footerRight: {
    position: "absolute",
    right: 40,
    bottom: 22,
    fontSize: 6.5,
    color: MUTED,
  },
};

export function CalcSheetDocument({ data }: { data: CalcSheetData }) {
  const headline = data.result.quantities.filter((q) => q.emphasis);
  const detail = data.result.quantities.filter((q) => !q.emphasis);

  return (
    <Document
      title={`${data.toolName} — calculation sheet`}
      author="Msingi — Site engineer's toolkit"
    >
      <Page size="A4" style={s.page}>
        {/* Fixed chrome (brand + footer) is declared before flowing content —
            react-pdf repeats fixed elements only from their first page on. */}
        <View style={s.brandRow} fixed>
          <View>
            <Text style={s.brand}>MSINGI</Text>
            <Text style={s.brandSub}>SITE ENGINEER&apos;S TOOLKIT</Text>
          </View>
          <View style={s.stampBox}>
            <Text style={s.stampText}>PRELIMINARY — NOT FOR CONSTRUCTION</Text>
          </View>
        </View>
        <Text style={s.footerDisclaimer} fixed>
          Preliminary estimation aid only — not a design document. Every
          formula, input and assumption is stated on this sheet so it can be
          audited by a licensed engineer before use.
        </Text>
        <Text style={s.footerLeft} fixed>
          Generated by Msingi · {data.generatedAt}
        </Text>
        <Text
          style={s.footerRight}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Sheet ${pageNumber} of ${totalPages}`
          }
        />

        {/* Title block */}
        <View style={s.titleBlock}>
          <Text style={s.toolName}>{data.toolName}</Text>
          {data.subtitle ? <Text style={s.subtitle}>{data.subtitle}</Text> : null}
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Project</Text>
              <Text style={s.metaValue}>{data.projectName || "—"}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Prepared by</Text>
              <Text style={s.metaValue}>{data.preparedBy || "—"}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{data.generatedAt}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Method</Text>
              <Text style={s.metaValue}>{data.result.methodology}</Text>
            </View>
          </View>
        </View>

        {/* Headline results */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Results</Text>
          <View style={s.headlineRow}>
            {headline.map((q) => (
              <View key={q.label} style={s.headlineCell}>
                <Text style={s.headlineLabel}>{q.label}</Text>
                <Text style={s.headlineValue}>
                  {q.value} <Text style={s.headlineUnit}>{q.unit}</Text>
                </Text>
                {q.note ? <Text style={s.headlineNote}>{q.note}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        {/* Warnings */}
        {data.result.warnings.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Flags</Text>
            {data.result.warnings.map((w) => (
              <Text
                key={w.message}
                style={[
                  s.warning,
                  w.level === "caution"
                    ? { backgroundColor: WARN_BG, color: WARN }
                    : { backgroundColor: NOTICE_BG, color: NOTICE },
                ]}
              >
                {w.level === "caution" ? "CAUTION — " : "NOTE — "}
                {w.message}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Detail quantities */}
        {detail.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Detail</Text>
            {detail.map((q) => (
              <View key={q.label} style={s.row}>
                <Text style={s.rowLabel}>{q.label}</Text>
                <Text style={s.rowValue}>
                  {q.value} {q.unit}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Inputs */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Inputs</Text>
          {data.inputsSummary.map((row) => (
            <View key={row.label} style={s.row}>
              <Text style={s.rowLabel}>{row.label}</Text>
              <Text style={s.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Working */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Working</Text>
          {data.result.steps.map((step, i) => (
            <View key={step.title} style={s.step} wrap={false}>
              <Text style={s.stepNum}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={s.stepBody}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepFormula}>{step.formula}</Text>
                <Text style={s.stepCalc}>
                  {step.substitution}{" "}
                  <Text style={s.stepResult}>= {step.result}</Text>
                </Text>
                {step.note ? <Text style={s.stepNote}>{step.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        {/* Assumptions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Assumptions</Text>
          {data.result.assumptions.map((a) => (
            <View key={a.label} style={s.assumptionRow} wrap={false}>
              <View style={s.assumptionMain}>
                <Text style={s.rowLabel}>{a.label}</Text>
                <Text style={s.rowValue}>{a.value}</Text>
              </View>
              {a.source ? (
                <Text style={s.assumptionSource}>{a.source}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Basis */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Basis</Text>
          {data.result.basis.map((b) => (
            <Text key={b.label} style={s.basisItem}>
              <Text style={s.basisLabel}>{b.label}. </Text>
              {b.note ?? ""}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
