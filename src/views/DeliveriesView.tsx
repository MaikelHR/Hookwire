import { useEffect, useRef } from 'react';
import { useDeliveries, useEndpoints, useFirstLoad } from '../lib/data-service';
import { fmtLatency, timeAgo } from '../lib/format';
import { DeliveryPill } from '../components/ui/StatusPill';
import { Countdown } from '../components/ui/Countdown';
import { SkeletonRows } from '../components/ui/Skeleton';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';

export function DeliveriesView({ onOpenDelivery }: { onOpenDelivery: (id: string) => void }) {
  const deliveries = useDeliveries();
  const endpoints = useEndpoints();
  const loading = useFirstLoad();
  const epName = (id: string): string => endpoints.find((e) => e.id === id)?.name ?? id;

  // recuerda qué filas ya se vieron, para animar solo las nuevas
  const seen = useRef(new Set<string>());
  useEffect(() => {
    deliveries.forEach((d) => seen.current.add(d.id));
  });

  return (
    <div>
      <div className="flex items-baseline gap-3.5 mb-[22px]">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Deliveries</h1>
        <span className="text-faint font-mono text-[11.5px]">{deliveries.length} attempts · last hour</span>
      </div>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Event type</Th>
              <Th>Endpoint</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Next retry</Th>
              <Th>Latency</Th>
              <Th>When</Th>
            </tr>
          </thead>
          {loading ? (
            <SkeletonRows cols={7} rows={8} />
          ) : (
            <tbody>
              {deliveries.map((d) => {
                const isNew = !seen.current.has(d.id);
                return (
                  <Tr
                    key={d.id}
                    className={'cursor-pointer hover:bg-hov' + (isNew ? ' animate-row-in' : '')}
                    onClick={() => onOpenDelivery(d.id)}
                  >
                    <Td variant="mono" className="text-text">
                      {d.eventType}
                    </Td>
                    <Td className="text-dim">{epName(d.endpointId)}</Td>
                    <Td>
                      <DeliveryPill status={d.status} />
                    </Td>
                    <Td variant="num">
                      {d.attempts.length}/{d.maxAttempts}
                    </Td>
                    <Td>
                      {d.status === 'retrying' && d.nextRetryAt !== null ? (
                        <Countdown target={d.nextRetryAt} />
                      ) : (
                        <span className="text-faint font-mono text-[11px]">—</span>
                      )}
                    </Td>
                    <Td variant="num">{fmtLatency(d.latencyMs)}</Td>
                    <Td variant="dim">{timeAgo(d.createdAt)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          )}
        </Table>
      </TableWrap>
    </div>
  );
}
