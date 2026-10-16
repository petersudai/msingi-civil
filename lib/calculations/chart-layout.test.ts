import { describe, expect, it } from "vitest";
import { layoutChart, niceStep } from "./chart-layout";
import type { CalcChart } from "./types";

const box = { width: 300, height: 200, margin: { top: 10, right: 10, bottom: 30, left: 40 } };

const chart: CalcChart = {
  title: "t",
  xLabel: "x",
  yLabel: "y",
  series: [
    {
      label: "s",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 1000 },
      ],
    },
  ],
  markers: [{ label: "m", x: 50, y: 500, status: "pass" }],
};

describe("niceStep", () => {
  it("picks 1, 2 or 5 times a power of ten", () => {
    expect(niceStep(100)).toBe(20);
    expect(niceStep(1000)).toBe(200);
    expect(niceStep(7)).toBe(1);
    expect(niceStep(0.4)).toBeCloseTo(0.05, 10);
  });

  it("falls back to 1 for an empty range", () => {
    expect(niceStep(0)).toBe(1);
  });
});

describe("layoutChart", () => {
  const layout = layoutChart(chart, box);

  it("keeps the plot area inside the margins", () => {
    expect(layout.plot).toEqual({ x: 40, y: 10, width: 250, height: 160 });
  });

  it("maps the data corners onto the plot corners", () => {
    expect(layout.paths[0]).toBe("M40.00 170.00 L290.00 10.00");
  });

  it("puts a marker at the right place and carries its status", () => {
    expect(layout.markers[0]).toEqual({ label: "m", x: 165, y: 90, status: "pass" });
  });

  it("starts both axes at zero and ends them at or above the data", () => {
    expect(layout.xTicks[0].value).toBe(0);
    expect(layout.yTicks[0].value).toBe(0);
    expect(layout.xTicks[layout.xTicks.length - 1].value).toBeGreaterThanOrEqual(100);
    expect(layout.yTicks[layout.yTicks.length - 1].value).toBeGreaterThanOrEqual(1000);
  });

  it("handles a marker outside the curve by widening the axes", () => {
    const far = layoutChart({ ...chart, markers: [{ label: "m", x: 400, y: 5000 }] }, box);
    expect(far.xTicks[far.xTicks.length - 1].value).toBeGreaterThanOrEqual(400);
    expect(far.yTicks[far.yTicks.length - 1].value).toBeGreaterThanOrEqual(5000);
  });
});
