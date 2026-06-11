export function SkeletonBar({ width }: { width: string }) {
  return (
    <div
      className="h-3 rounded animate-shimmer bg-[linear-gradient(90deg,var(--bg-hover)_25%,var(--bg-inset)_45%,var(--bg-hover)_65%)] bg-[length:200%_100%]"
      style={{ width }}
    />
  );
}

export function SkeletonRows({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="group">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3.5 py-3 border-b border-line group-last:border-b-0 align-middle">
              <SkeletonBar width={40 + ((r * 13 + c * 29) % 50) + '%'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function EmptyState({ glyph = '∅', children }: { glyph?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-7 text-center text-faint font-mono text-[11.5px]">
      <span className="block text-xl mb-2 text-line-strong">{glyph}</span>
      {children}
    </div>
  );
}
