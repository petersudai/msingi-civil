import { layoutChart } from "@/lib/calculations/chart-layout";
import type { CalcChart } from "@/lib/calculations/types";

const BOX = {
  width: 360,
  height: 300,
  margin: { top: 14, right: 14, bottom: 44, left: 54 },
};

/**
 * Draws a {@link CalcChart} as an SVG that scales to its container. Sized in
 * a fixed coordinate space, so text stays legible from a phone to a desktop.
 * A text summary sits below for screen readers and for anyone who wants the
 * numbers, not the picture.
 */
export function CalcChartFigure({ chart }: { chart: CalcChart }) {
  const layout = layoutChart(chart, BOX);
  const { plot } = layout;
  const marker = chart.markers[0];

  return (
    <figure className="min-w-0">
      <figcaption className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {chart.title}
      </figcaption>
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={`${chart.title}: ${chart.yLabel} against ${chart.xLabel}. ${chart.markers
          .map((m) => `${m.label} at ${Math.round(m.x)} and ${Math.round(m.y)}${m.status ? `, ${m.status}` : ""}`)
          .join(". ")}`}
        className="mt-2 h-auto w-full max-w-xl"
      >
        {layout.yTicks.map((t) => (
          <g key={`y${t.value}`}>
            <line x1={plot.x} x2={plot.x + plot.width} y1={t.pos} y2={t.pos} className="stroke-border" strokeWidth={1} />
            <text x={plot.x - 6} y={t.pos + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
              {t.label}
            </text>
          </g>
        ))}
        {layout.xTicks.map((t) => (
          <g key={`x${t.value}`}>
            <line x1={t.pos} x2={t.pos} y1={plot.y} y2={plot.y + plot.height} className="stroke-border" strokeWidth={1} />
            <text x={t.pos} y={plot.y + plot.height + 14} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
              {t.label}
            </text>
          </g>
        ))}
        <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} fill="none" className="stroke-foreground/40" strokeWidth={1} />

        {layout.paths.map((d, i) => (
          <path
            key={chart.series[i].label}
            d={d}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {layout.markers.map((m) => (
          <g key={m.label}>
            <circle
              cx={m.x}
              cy={m.y}
              r={6}
              className={m.status === "fail" ? "fill-destructive" : "fill-pass"}
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        ))}

        <text
          x={plot.x + plot.width / 2}
          y={BOX.height - 6}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={11}
          fontWeight={600}
        >
          {chart.xLabel}
        </text>
        <text
          transform={`translate(12 ${plot.y + plot.height / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={11}
          fontWeight={600}
        >
          {chart.yLabel}
        </text>
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {chart.series.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-primary" />
            {s.label}
          </li>
        ))}
        {chart.markers.map((m) => (
          <li key={m.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block size-2.5 rounded-full ${m.status === "fail" ? "bg-destructive" : "bg-pass"}`}
            />
            {m.label}
          </li>
        ))}
      </ul>
      {marker && chart.caption ? (
        <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{chart.caption}</p>
      ) : null}
    </figure>
  );
}
