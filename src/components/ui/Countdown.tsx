import { useEffect, useState } from 'react';
import { fmtCountdown } from '../../lib/format';

export function Countdown({ target }: { target: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (target === null) return null;
  return <span className="font-mono tabular-nums text-warn text-[11px]">in {fmtCountdown(target - Date.now())}</span>;
}
