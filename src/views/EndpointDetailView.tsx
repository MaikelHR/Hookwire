import { useDeliveries, useEndpoints } from '../lib/data-service';
import { fmtLatency, timeAgo } from '../lib/format';
import { StatCard } from '../components/ui/StatCard';
import { DeliveryPill, EndpointPill } from '../components/ui/StatusPill';
import { EmptyState } from '../components/ui/Skeleton';
import { SecretField } from '../components/ui/SecretField';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';

interface EndpointDetailViewProps {
  endpointId: string;
  onBack: () => void;
  onOpenDelivery: (id: string) => void;
}

export function EndpointDetailView({ endpointId, onBack, onOpenDelivery }: EndpointDetailViewProps) {
  const endpoints = useEndpoints();
  const deliveries = useDeliveries();
  const ep = endpoints.find((e) => e.id === endpointId);
  const history = deliveries.filter((d) => d.endpointId === endpointId);

  if (!ep) return null;
  return (
    <div>
      <div className="flex flex-col items-start gap-1.5 mb-[22px]">
        <button
          className="bg-transparent border-none text-accent font-mono text-xs p-0 hover:underline"
          onClick={onBack}
        >
          ← endpoints
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-[21px] font-semibold tracking-[-0.01em]">{ep.name}</h1>
          <EndpointPill status={ep.status} />
        </div>
        <span className="text-faint font-mono text-[11.5px]">{ep.url}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-[18px]">
        <StatCard label="Success rate" value={ep.successRate.toFixed(1)} suffix="%" />
        <StatCard label="Last delivery" value={timeAgo(ep.lastDeliveryAt)} />
        <StatCard label="Deliveries (1h)" value={history.length} />
      </div>

      <div className="mb-[18px]">
        <div className="text-[13px] font-semibold text-dim mb-2.5 flex items-baseline gap-2.5">
          Signing secret{' '}
          <span className="font-mono text-[10.5px] text-faint font-normal">
            HMAC-SHA256 · used for X-Hookwire-Signature
          </span>
        </div>
        <SecretField secret={ep.secret} />
      </div>

      <div className="mb-[18px]">
        <div className="text-[13px] font-semibold text-dim mb-2.5 flex items-baseline gap-2.5">
          Delivery history{' '}
          <span className="font-mono text-[10.5px] text-faint font-normal">{history.length} in the last hour</span>
        </div>
        <TableWrap>
          {history.length === 0 ? (
            <EmptyState>no deliveries to this endpoint yet</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>Latency</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <Tr key={d.id} className="cursor-pointer hover:bg-hov" onClick={() => onOpenDelivery(d.id)}>
                    <Td variant="mono">{d.eventType}</Td>
                    <Td>
                      <DeliveryPill status={d.status} />
                    </Td>
                    <Td variant="num">
                      {d.attempts.length}/{d.maxAttempts}
                    </Td>
                    <Td variant="num">{fmtLatency(d.latencyMs)}</Td>
                    <Td variant="dim">{timeAgo(d.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableWrap>
      </div>
    </div>
  );
}
