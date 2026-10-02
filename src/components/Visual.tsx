import { useEffect, useRef } from "react";
import { gaussian, random } from "../core/math";
export function NoiseCanvas({
  seed = 42819,
  values,
  heat = false,
}: {
  seed?: number;
  values?: number[];
  heat?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const r = random(seed);
    const size = heat ? 8 : 128;
    canvas.width = size;
    canvas.height = size;
    const frame = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const n = heat ? values?.[i] || 0 : gaussian(r) * 0.18 + 0.5;
      const p = i * 4;
      frame.data[p] = heat ? 195 : Math.max(0, Math.min(255, n * 220));
      frame.data[p + 1] = heat ? 90 : Math.max(0, Math.min(255, n * 235));
      frame.data[p + 2] = heat ? 255 : Math.max(0, Math.min(255, n * 255));
      frame.data[p + 3] = heat ? n * 190 : 255;
    }
    ctx.putImageData(frame, 0, 0);
  }, [seed, values, heat]);
  return (
    <canvas
      ref={ref}
      aria-label={
        heat ? "Token attention heatmap" : "Seeded Gaussian noise field"
      }
      className={heat ? "heatmap" : "noise-canvas"}
    />
  );
}
export function EmbeddingMap({ projection }: { projection: number[][] }) {
  return (
    <svg
      viewBox="0 0 400 230"
      className="embedding-map"
      aria-label="Two dimensional embedding projection"
    >
      <defs>
        <pattern
          id="scatter-grid"
          width="25"
          height="25"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 25 0 L 0 0 0 25"
            fill="none"
            stroke="#303442"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <rect width="400" height="230" fill="url(#scatter-grid)" />
      {projection.map((p, i) => (
        <g key={i}>
          <circle
            cx={20 + p[0] * 350}
            cy={15 + p[1] * 195}
            r={4}
            fill={i % 2 ? "#af9af9" : "#79d8e7"}
          />
          <text
            x={27 + p[0] * 350}
            y={18 + p[1] * 195}
            fill="#969ead"
            fontSize="9"
          >
            t{i}
          </text>
        </g>
      ))}
    </svg>
  );
}
