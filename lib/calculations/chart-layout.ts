import type { CalcChart } from "./types";

/**
 * Turns a {@link CalcChart} into drawing coordinates. The screen sheet (SVG
 * in the browser) and the PDF (react-pdf primitives) both draw from this one
 * layout, so the two always show the same chart.
 */

export interface ChartBox {
  width: number;
  height: number;
  /** Space reserved around the plot area for tick labels and axis titles. */
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface ChartTick {
  value: number;
  /** Position along the axis in drawing units. */
  pos: number;
  label: string;
}

export interface ChartLayout {
  plot: { x: number; y: number; width: number; height: number };
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  /** SVG path data for each series, in series order. */
  paths: string[];
  markers: Array<{ label: string; x: number; y: number; status?: "pass" | "fail" }>;
}

/** A tick step of 1, 2 or 5 times a power of ten that gives about `target` ticks. */
export function niceStep(range: number, target = 5): number {
  if (!(range > 0)) return 1;
  const rough = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  const factor = residual >= 5 ? 5 : residual >= 2 ? 2 : 1;
  return factor * magnitude;
}

function niceMax(max: number): { max: number; step: number } {
  const step = niceStep(max);
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

function tickLabel(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : String(Number(value.toFixed(2)));
}

export function layoutChart(chart: CalcChart, box: ChartBox): ChartLayout {
  const plot = {
    x: box.margin.left,
    y: box.margin.top,
    width: box.width - box.margin.left - box.margin.right,
    height: box.height - box.margin.top - box.margin.bottom,
  };

  const xs = [...chart.series.flatMap((s) => s.points.map((p) => p.x)), ...chart.markers.map((m) => m.x)];
  const ys = [...chart.series.flatMap((s) => s.points.map((p) => p.y)), ...chart.markers.map((m) => m.y)];
  const xDomain = niceMax(Math.max(...xs, 1e-9));
  const yDomain = niceMax(Math.max(...ys, 1e-9));

  const px = (x: number) => plot.x + (x / xDomain.max) * plot.width;
  const py = (y: number) => plot.y + plot.height - (y / yDomain.max) * plot.height;

  const ticks = (domain: { max: number; step: number }, pos: (v: number) => number): ChartTick[] => {
    const out: ChartTick[] = [];
    for (let v = 0; v <= domain.max + 1e-9; v += domain.step) {
      out.push({ value: v, pos: pos(v), label: tickLabel(v) });
    }
    return out;
  };

  return {
    plot,
    xTicks: ticks(xDomain, px),
    yTicks: ticks(yDomain, py),
    paths: chart.series.map((s) =>
      s.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`)
        .join(" "),
    ),
    markers: chart.markers.map((m) => ({
      label: m.label,
      x: px(m.x),
      y: py(m.y),
      status: m.status,
    })),
  };
}
