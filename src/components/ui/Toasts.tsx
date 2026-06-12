import { useToasts } from '../../lib/toasts';

export function Toasts() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-panel border border-line-strong rounded-ctl shadow-float px-3.5 py-2.5 font-mono text-xs animate-echo-in"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
