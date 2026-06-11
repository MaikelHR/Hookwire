import { useEndpoints } from '../lib/data-service';
import { useFakeLoad } from '../lib/useFakeLoad';
import { timeAgo } from '../lib/format';
import { EndpointPill } from '../components/ui/StatusPill';
import { SkeletonRows } from '../components/ui/Skeleton';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';

export function EndpointsView({ onOpenEndpoint }: { onOpenEndpoint: (id: string) => void }) {
  const endpoints = useEndpoints();
  const loading = useFakeLoad(550);

  return (
    <div>
      <div className="flex items-baseline gap-3.5 mb-[22px]">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Endpoints</h1>
        <span className="text-faint font-mono text-[11.5px]">{endpoints.length} subscribed</span>
      </div>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>URL</Th>
              <Th>Status</Th>
              <Th>Success rate</Th>
              <Th>Last delivery</Th>
            </tr>
          </thead>
          {loading ? (
            <SkeletonRows cols={5} rows={4} />
          ) : (
            <tbody>
              {endpoints.map((ep) => (
                <Tr key={ep.id} className="cursor-pointer hover:bg-hov" onClick={() => onOpenEndpoint(ep.id)}>
                  <Td className="font-medium">{ep.name}</Td>
                  <Td variant="mono">{ep.url}</Td>
                  <Td>
                    <EndpointPill status={ep.status} />
                  </Td>
                  <Td variant="num">{ep.successRate.toFixed(1)}%</Td>
                  <Td variant="dim">{timeAgo(ep.lastDeliveryAt)}</Td>
                </Tr>
              ))}
            </tbody>
          )}
        </Table>
      </TableWrap>
    </div>
  );
}
