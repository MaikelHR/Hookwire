import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  suffix?: string;
  foot?: ReactNode;
}

export function StatCard({ label, value, suffix, foot }: StatCardProps) {
  return (
    <div className="bg-card border border-line rounded-card px-[18px] py-4">
      <div className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-faint mb-2">{label}</div>
      <div className="text-[26px] font-semibold tracking-[-0.01em] leading-[1.1] tabular-nums">
        {value}
        {suffix ? <small className="text-sm text-dim font-medium"> {suffix}</small> : null}
      </div>
      {foot ? <div className="font-mono text-[10.5px] text-faint mt-1.5">{foot}</div> : null}
    </div>
  );
}
