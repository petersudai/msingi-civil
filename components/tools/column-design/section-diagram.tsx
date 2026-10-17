import { barRows, type BarLayoutInput } from "@/lib/calculations/column-design/calculate";

const MAX_W = 150;
const MAX_H = 150;
const PAD = 26;

export type SectionDiagramInput = BarLayoutInput & { bMm: number };

/**
 * A live drawing of the column section as entered: outline, links, the bar
 * pattern, and the direction of bending. It answers "did I enter what I
 * meant?" at a glance, which a row of numbers can't.
 */
export function ColumnSectionDiagram({ input }: { input: SectionDiagramInput }) {
  const scale = Math.min(MAX_W / input.bMm, MAX_H / input.hMm);
  const w = input.bMm * scale;
  const h = input.hMm * scale;
  const cover = input.coverMm * scale;
  const link = Math.max(input.linkDiameterMm * scale, 1);
  const barR = Math.max((input.mainBarDiameterMm * scale) / 2, 2);
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  const rows = barRows(input);
  const x0 = PAD;
  const y0 = PAD * 0.6;
  const xAcross = (i: number, n: number) =>
    x0 + (dPrime + (i * (input.bMm - 2 * dPrime)) / (n - 1)) * scale;
  const totalW = w + PAD * 2;
  const totalH = h + PAD * 1.4;

  return (
    <figure className="flex items-center gap-4 rounded-md border bg-muted/40 p-3">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width={totalW}
        height={totalH}
        role="img"
        aria-label={`Column section ${input.bMm} by ${input.hMm} millimetres with ${
          2 * input.barsAcrossB + 2 * (input.barsAcrossH - 2)
        } bars. Moments along h act in the ${input.hMm} millimetre direction and along b in the ${input.bMm} millimetre direction.`}
        className="h-auto max-w-[190px] shrink-0"
      >
        <rect x={x0} y={y0} width={w} height={h} className="fill-card stroke-foreground" strokeWidth={1.5} />
        <rect
          x={x0 + cover + link / 2}
          y={y0 + cover + link / 2}
          width={w - 2 * cover - link}
          height={h - 2 * cover - link}
          fill="none"
          className="stroke-primary"
          strokeWidth={Math.max(link, 1)}
        />
        {rows.map((row, ri) => {
          const outer = ri === 0 || ri === rows.length - 1;
          const y = y0 + row.yMm * scale;
          if (outer) {
            return Array.from({ length: input.barsAcrossB }, (_, i) => (
              <circle key={`${ri}-${i}`} cx={xAcross(i, input.barsAcrossB)} cy={y} r={barR} className="fill-foreground" />
            ));
          }
          return [0, 1].map((i) => (
            <circle key={`${ri}-${i}`} cx={xAcross(i, 2)} cy={y} r={barR} className="fill-foreground" />
          ));
        })}
        {/* Along h: a double arrow down the right edge. Along b: one under the section. */}
        <g className="stroke-muted-foreground" strokeWidth={1}>
          <line x1={x0 + w + 12} y1={y0 + 3} x2={x0 + w + 12} y2={y0 + h - 3} />
          <polyline points={`${x0 + w + 8},${y0 + 8} ${x0 + w + 12},${y0 + 3} ${x0 + w + 16},${y0 + 8}`} fill="none" />
          <polyline points={`${x0 + w + 8},${y0 + h - 8} ${x0 + w + 12},${y0 + h - 3} ${x0 + w + 16},${y0 + h - 8}`} fill="none" />
          <line x1={x0 + 3} y1={y0 + h + 11} x2={x0 + w - 3} y2={y0 + h + 11} />
          <polyline points={`${x0 + 8},${y0 + h + 7} ${x0 + 3},${y0 + h + 11} ${x0 + 8},${y0 + h + 15}`} fill="none" />
          <polyline points={`${x0 + w - 8},${y0 + h + 7} ${x0 + w - 3},${y0 + h + 11} ${x0 + w - 8},${y0 + h + 15}`} fill="none" />
        </g>
      </svg>
      <figcaption className="text-[12.5px] leading-snug text-muted-foreground">
        <span className="nums font-semibold text-foreground">
          {input.bMm} × {input.hMm} mm
        </span>
        , {2 * input.barsAcrossB + 2 * (input.barsAcrossH - 2)} bars. The side arrow is bending
        along h ({input.hMm} mm), the bottom arrow is bending along b ({input.bMm} mm).
      </figcaption>
    </figure>
  );
}
