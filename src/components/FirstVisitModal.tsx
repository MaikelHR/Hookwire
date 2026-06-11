import { Button } from './ui/Button';

export function FirstVisitModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/55 grid place-items-center" onClick={onDismiss}>
      <div
        className="w-[min(440px,90vw)] bg-panel border border-line-strong rounded-card shadow-float pt-[26px] px-7 pb-6 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold tracking-[-0.01em] m-0 mb-2.5">Welcome to Hookwire</h2>
        <p className="m-0 mb-2.5 text-dim text-[13px]">
          Hookwire is a webhook delivery service: it receives events, signs them, and delivers them to your endpoints
          with automatic retries and dead-lettering.
        </p>
        <p className="m-0 mb-2.5 text-dim text-[13px]">
          Use the <strong>Live Demo</strong> panel on the right to send a test event, then break the endpoint and
          watch the retry backoff in action.
        </p>
        <div className="font-mono text-[10.5px] text-faint border border-dashed border-line-strong rounded-ctl px-2.5 py-2 mt-3.5 mb-[18px]">
          Portfolio project — your demo data is isolated per session and expires.
        </div>
        <div className="flex gap-2.5">
          <Button variant="primary" onClick={onDismiss}>
            Try the demo
          </Button>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-ctl border border-line-strong bg-card text-text hover:bg-hov font-mono text-xs font-medium px-3.5 py-2 no-underline"
            href="https://github.com/MaikelHR/Hookwire"
            target="_blank"
            rel="noopener"
          >
            ⌥ View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
