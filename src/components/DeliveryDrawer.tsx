import { Fragment } from 'react';
import { BACKOFF_SCHEDULE_S, useDeliveries, useDemoActions, useEndpoints } from '../lib/data-service';
import { fmtClock } from '../lib/format';
import { DeliveryPill } from './ui/StatusPill';
import { Button, IconButton } from './ui/Button';
import { JsonCode } from './ui/JsonCode';
import { Countdown } from './ui/Countdown';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-faint font-mono m-0 mb-2">{children}</h3>
  );
}

export function DeliveryDrawer({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const deliveries = useDeliveries();
  const endpoints = useEndpoints();
  const { replayDelivery } = useDemoActions();
  const d = deliveries.find((x) => x.id === deliveryId);
  if (!d) return null;
  const ep = endpoints.find((e) => e.id === d.endpointId);

  const headers: Array<[string, string]> = [
    ['Content-Type', 'application/json'],
    ['User-Agent', 'Hookwire/1.4 (+https://hookwire.dev)'],
    ['X-Hookwire-Event', d.eventType],
    ['X-Hookwire-Delivery', d.id],
    ['X-Hookwire-Signature', d.signature],
  ];

  const fmtBackoff = (s: number): string => (s >= 60 ? s / 60 + 'm' : s + 's');

  return (
    <div>
      <div className="fixed inset-0 z-[60] bg-black/45" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-[61] w-[min(620px,92vw)] bg-panel border-l border-line-strong shadow-float flex flex-col animate-slide-in">
        <div className="pt-[18px] px-[22px] pb-3.5 border-b border-line flex justify-between items-start gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="font-mono text-[15px] font-semibold m-0">{d.eventType}</h2>
              <DeliveryPill status={d.status} />
            </div>
            <div className="font-mono text-[10.5px] text-faint">
              {d.id} → {ep?.name ?? d.endpointId} · {fmtClock(d.createdAt)}
            </div>
          </div>
          <div className="flex gap-2">
            {/* Deshabilitado solo si ya está en cola (re-encolarla no haría nada) */}
            <Button size="small" onClick={() => replayDelivery(d.id)} disabled={d.status === 'pending'}>
              ⟳ Replay delivery
            </Button>
            <IconButton onClick={onClose}>esc ✕</IconButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pt-[18px] px-[22px] pb-10 flex flex-col gap-5">
          <section>
            <SectionTitle>Request headers</SectionTitle>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11.5px]">
              {headers.map(([k, v]) => (
                <Fragment key={k}>
                  <span className="text-faint">{k}:</span>
                  <span
                    className={
                      'break-all ' +
                      (k === 'X-Hookwire-Signature' ? 'text-accent bg-accent/8 px-1 rounded-[3px]' : 'text-dim')
                    }
                  >
                    {v}
                  </span>
                </Fragment>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>Payload</SectionTitle>
            <JsonCode obj={d.payload} />
          </section>

          <section>
            <SectionTitle>
              Attempts · {d.attempts.length}/{d.maxAttempts}
            </SectionTitle>
            <div className="flex flex-col">
              {d.attempts.map((a, i) => {
                const ok = a.statusCode >= 200 && a.statusCode < 300;
                const hasNext = i < d.attempts.length - 1 || (d.status === 'retrying' && d.nextRetryAt !== null);
                const gapS = BACKOFF_SCHEDULE_S[i] ?? 300;
                return (
                  <div key={i} className="grid grid-cols-[22px_1fr] gap-x-3">
                    <div className="relative flex flex-col items-center">
                      <span
                        className={
                          'w-2.5 h-2.5 rounded-full flex-none mt-1 border-2 ' +
                          (ok
                            ? 'border-ok bg-ok'
                            : 'border-err bg-[color-mix(in_oklab,var(--color-err)_35%,var(--bg-panel))]')
                        }
                      />
                      {hasNext ? <span className="w-[2px] flex-1 bg-line min-h-[14px]" /> : null}
                    </div>
                    <div className="pb-3.5">
                      <div className="flex gap-2.5 items-baseline font-mono text-[11.5px]">
                        <span className="text-dim">#{i + 1}</span>
                        <span className={ok ? 'text-ok font-bold' : 'text-err font-bold'}>{a.statusCode}</span>
                        <span className="text-faint text-[10.5px]">{fmtClock(a.ts)}</span>
                        <span className="text-faint text-[10.5px]">{a.durationMs}ms</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-dim mt-[3px]">{a.body}</div>
                      {!ok && hasNext ? (
                        <div className="font-mono text-[9.5px] text-faint pt-[1px] pb-[9px]">
                          └ backoff <b className="text-warn font-medium">{fmtBackoff(gapS)}</b> before next attempt
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {d.status === 'retrying' && d.nextRetryAt !== null ? (
                <div className="grid grid-cols-[22px_1fr] gap-x-3">
                  <div className="relative flex flex-col items-center">
                    <span className="w-2.5 h-2.5 rounded-full flex-none mt-1 border-2 border-warn border-dashed bg-panel animate-pulse-soft" />
                  </div>
                  <div className="pb-3.5">
                    <div className="flex gap-2.5 items-baseline font-mono text-[11.5px]">
                      <span className="text-dim">#{d.attempts.length + 1}</span>
                      <span className="text-warn">scheduled</span>
                      <Countdown target={d.nextRetryAt} />
                    </div>
                  </div>
                </div>
              ) : null}
              {d.status === 'dead' ? (
                <div className="grid grid-cols-[22px_1fr] gap-x-3">
                  <div className="relative flex flex-col items-center">
                    <span className="w-2.5 h-2.5 rounded-full flex-none mt-1 border-2 border-err bg-[color-mix(in_oklab,var(--color-err)_35%,var(--bg-panel))]" />
                  </div>
                  <div className="pb-3.5">
                    <div className="flex gap-2.5 items-baseline font-mono text-[11.5px]">
                      <span className="text-err">moved to dead letter queue</span>
                    </div>
                    <div className="font-mono text-[10.5px] text-dim mt-[3px]">
                      max attempts ({d.maxAttempts}) exhausted; replay manually when the endpoint recovers
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
