import { useRef, useState } from 'react';
import { EVENT_TYPES, useDemoActions, useEcho, useEndpoints, useFailureMode } from '../lib/data-service';
import { fmtClock } from '../lib/format';
import { Button } from './ui/Button';
import { EmptyState } from './ui/Skeleton';

export function LiveDemoPanel() {
  const echo = useEcho();
  const endpoints = useEndpoints();
  const failureMode = useFailureMode();
  const { sendTestEvent, setFailureMode } = useDemoActions();
  const [eventType, setEventType] = useState('user.created');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const send = (): void => {
    setSending(true);
    sendTestEvent(eventType);
    setTimeout(() => setSending(false), 500);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  return (
    <aside className="bg-panel border-l border-line flex flex-col min-h-0">
      <div className="pt-4 px-4 pb-3 border-b border-line">
        <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.08em] uppercase">
          <span className="w-[7px] h-[7px] rounded-full bg-ok flex-none animate-pulse-soft [animation-duration:1.6s]" />
          Live demo
        </div>
        <div className="flex flex-col gap-[5px] mt-3">
          {['Send an event', 'Watch it get delivered', 'Break the endpoint and watch the retries'].map((hint, i) => (
            <div key={i} className="flex gap-[9px] items-baseline text-[11.5px] text-dim">
              <span className="font-mono text-[10px] text-accent border border-accent/45 rounded-full w-4 h-4 flex-none inline-grid place-items-center translate-y-[2px]">
                {i + 1}
              </span>
              <span>{hint}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3.5 border-b border-line flex flex-col gap-3">
        <div className="flex gap-2">
          <select
            className="flex-[1.2] min-w-0 bg-inset border border-line-strong rounded-ctl text-text font-mono text-[11.5px] px-2.5 py-2"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            aria-label="Event type"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button variant="primary" className="flex-1" onClick={send} disabled={sending}>
            {sending ? '⟳ sending…' : '▸ Send test event'}
          </Button>
        </div>
        {/* Deshabilitado solo hasta que cargue el endpoint demo: el PATCH
            necesita su id */}
        <div className="flex items-start gap-2.5">
          <button
            disabled={endpoints.length === 0}
            onClick={() => setFailureMode(!failureMode)}
            aria-label="Simulate endpoint failure"
            className={
              'w-[34px] h-[19px] flex-none rounded-full border relative p-0 transition-[background-color,border-color] duration-[180ms] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ' +
              (failureMode ? 'bg-err/25 border-err' : 'bg-inset border-line-strong')
            }
          >
            <span
              className={
                'absolute top-[2px] left-[2px] w-[13px] h-[13px] rounded-full transition-[transform,background-color] duration-[180ms] ' +
                (failureMode ? 'translate-x-[15px] bg-err' : 'bg-dim')
              }
            />
          </button>
          <div>
            <div className="text-xs font-medium">Simulate endpoint failure</div>
            <div className="font-mono text-[10.5px] text-faint">
              (receiver returns 500, deliveries enter retry backoff)
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex justify-between items-center pt-[11px] px-4 pb-[9px]">
          <span className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-faint">
            Echo receiver · demo.hookwire.dev
          </span>
          <span className="font-mono text-[10.5px] text-faint">{echo.length > 0 ? echo.length + ' rcvd' : ''}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3.5 flex flex-col gap-2" ref={listRef}>
          {echo.length === 0 ? (
            <EmptyState glyph="⇣">
              webhooks received by the demo endpoint
              <br />
              will appear here in real time
            </EmptyState>
          ) : (
            echo.map((e) => (
              <div
                key={e.id}
                className="bg-inset border border-line rounded-ctl px-[11px] py-[9px] font-mono animate-echo-in flex-none"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[11.5px] font-semibold">{e.eventType}</span>
                  <span className="text-[10px] text-faint">{fmtClock(e.ts)}</span>
                </div>
                <div className="flex gap-1.5 mt-1.5 items-center">
                  {/* Veredicto real del receiver: recalcula el HMAC sobre el
                      body crudo con su copia del secreto del endpoint */}
                  {e.verified ? (
                    <span className="inline-flex items-center gap-[5px] text-[9.5px] tracking-[0.05em] px-[7px] py-[2px] rounded-full text-ok bg-ok/12">
                      ✓ Signature verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-[5px] text-[9.5px] tracking-[0.05em] px-[7px] py-[2px] rounded-full text-err bg-err/12">
                      ✕ Signature invalid
                    </span>
                  )}
                  {e.attempt > 1 ? (
                    <span className="inline-flex items-center gap-[5px] text-[9.5px] tracking-[0.05em] px-[7px] py-[2px] rounded-full text-faint bg-hov">
                      attempt #{e.attempt}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-[5px] text-[9.5px] tracking-[0.05em] px-[7px] py-[2px] rounded-full text-faint bg-hov">
                    {e.statusCode}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
