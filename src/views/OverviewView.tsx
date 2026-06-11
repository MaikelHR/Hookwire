import { useDeliveries, useEndpoints, useStats } from '../lib/data-service';
import { useFakeLoad } from '../lib/useFakeLoad';
import { timeAgo } from '../lib/format';
import { StatCard } from '../components/ui/StatCard';
import { AreaChart } from '../components/ui/AreaChart';
import { DeliveryPill } from '../components/ui/StatusPill';
import { SkeletonRows, EmptyState } from '../components/ui/Skeleton';
import { TableWrap } from '../components/ui/Table';

export function OverviewView({ onOpenDelivery }: { onOpenDelivery: (id: string) => void }) {
  const stats = useStats();
  const deliveries = useDeliveries();
  const endpoints = useEndpoints();
  const loading = useFakeLoad(600);

  const epName = (id: string): string => endpoints.find((e) => e.id === id)?.name ?? id;
  const recent = deliveries.slice(0, 8);

  return (
    <div>
      <div className="flex items-baseline gap-3.5 mb-[22px]">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Overview</h1>
        <span className="text-faint font-mono text-[11.5px]">last 60 minutes · live</span>
      </div>

      <div className="grid grid-cols-4 max-[1380px]:grid-cols-2 gap-3 mb-[18px]">
        <StatCard
          label="Events published"
          value={stats.published.toLocaleString('en-US')}
          foot={
            <span>
              <span className="text-ok">▲ 4.2%</span> vs previous hour
            </span>
          }
        />
        <StatCard
          label="Delivery success rate"
          value={stats.successRate.toFixed(2)}
          suffix="%"
          foot={
            stats.successRate > 99 ? (
              <span className="text-ok">within SLO</span>
            ) : (
              <span className="text-warn">below 99% SLO</span>
            )
          }
        />
        <StatCard label="P95 delivery latency" value={stats.p95} suffix="ms" foot="across all endpoints" />
        <StatCard
          label="Pending retries"
          value={stats.pendingRetries}
          foot={
            stats.pendingRetries > 0 ? <span className="text-warn">⟳ backoff in progress</span> : 'queue is clear'
          }
        />
      </div>

      <div className="mb-[18px]">
        <div className="bg-card border border-line rounded-card px-[18px] pt-4 pb-2">
          <div className="flex justify-between items-baseline mb-1">
            <div className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-faint">Deliveries / 5 min</div>
            <span className="font-mono text-[10.5px] text-faint">−60m → now</span>
          </div>
          <AreaChart data={stats.chart} />
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="text-[13px] font-semibold text-dim mb-2.5 flex items-baseline gap-2.5">
          Recent deliveries <span className="font-mono text-[10.5px] text-faint font-normal">last 8</span>
        </div>
        <TableWrap>
          {loading ? (
            <table className="w-full border-collapse text-[12.5px]">
              <SkeletonRows cols={4} rows={6} />
            </table>
          ) : recent.length === 0 ? (
            <EmptyState>no deliveries yet — send a test event →</EmptyState>
          ) : (
            <div>
              {recent.map((d) => {
                const tickColor =
                  d.status === 'delivered'
                    ? 'var(--color-ok)'
                    : d.status === 'retrying' || d.status === 'pending'
                      ? 'var(--color-warn)'
                      : 'var(--color-err)';
                const tick = d.status === 'delivered' ? '✓' : d.status === 'retrying' || d.status === 'pending' ? '⟳' : '✕';
                return (
                  <div
                    key={d.id}
                    onClick={() => onOpenDelivery(d.id)}
                    className="grid grid-cols-[14px_minmax(150px,1.2fr)_1fr_auto_auto] items-center gap-3 px-3.5 py-3 border-b border-line last:border-b-0 text-xs cursor-pointer hover:bg-hov"
                  >
                    <span className="font-mono font-bold text-center" style={{ color: tickColor }}>
                      {tick}
                    </span>
                    <span className="font-mono text-[11.5px]">{d.eventType}</span>
                    <span className="text-dim overflow-hidden text-ellipsis">{epName(d.endpointId)}</span>
                    <DeliveryPill status={d.status} />
                    <span className="font-mono text-[10.5px] text-faint">{timeAgo(d.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </TableWrap>
      </div>
    </div>
  );
}
