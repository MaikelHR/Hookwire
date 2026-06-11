export function AreaChart({ data, height = 96 }: { data: number[]; height?: number }) {
  const w = 100;
  const h = 40;
  const max = Math.max(...data, 1) * 1.15;
  const step = w / (data.length - 1);
  const pts: Array<[number, number]> = data.map((v, i) => [i * step, h - (v / max) * h]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  const area = line + ' L ' + w + ' ' + h + ' L 0 ' + h + ' Z';
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="hw-area-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hw-area-g)" />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      {last ? <circle cx={last[0]} cy={last[1]} r="1.8" fill="var(--color-accent)" /> : null}
    </svg>
  );
}
