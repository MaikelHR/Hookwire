import type { DeliveryStatus, EndpointStatus } from '../../lib/data-service';

type Tone = 'ok' | 'warn' | 'err' | 'muted';

interface StatusMeta {
  label: string;
  tone: Tone;
}

const DELIVERY_STATUS: Record<DeliveryStatus, StatusMeta> = {
  pending: { label: 'Pending', tone: 'muted' },
  delivered: { label: 'Delivered', tone: 'ok' },
  retrying: { label: 'Retrying', tone: 'warn' },
  failed: { label: 'Failed', tone: 'err' },
  dead: { label: 'Dead-lettered', tone: 'err' },
};

const ENDPOINT_STATUS: Record<EndpointStatus, StatusMeta> = {
  healthy: { label: 'Healthy', tone: 'ok' },
  failing: { label: 'Failing', tone: 'err' },
  disabled: { label: 'Disabled', tone: 'muted' },
};

const TONE_CLS: Record<Tone, string> = {
  ok: 'text-ok border-ok/40 bg-ok/9',
  warn: 'text-warn border-warn/40 bg-warn/9',
  err: 'text-err border-err/40 bg-err/9',
  muted: 'text-faint border-line-strong bg-transparent',
};

export function StatusPill({ meta }: { meta: StatusMeta }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium tracking-[0.04em] px-[9px] py-[2.5px] rounded-full border ' +
        TONE_CLS[meta.tone]
      }
    >
      <span
        className={
          'w-1.5 h-1.5 rounded-full bg-current flex-none' + (meta.tone === 'warn' ? ' animate-pulse-soft' : '')
        }
      />
      {meta.label}
    </span>
  );
}

export function DeliveryPill({ status }: { status: DeliveryStatus }) {
  return <StatusPill meta={DELIVERY_STATUS[status]} />;
}

export function EndpointPill({ status }: { status: EndpointStatus }) {
  return <StatusPill meta={ENDPOINT_STATUS[status]} />;
}
