/* Hookwire — Overview, Endpoints, Endpoint detail views */

function OverviewView({ onOpenDelivery }) {
  const stats = HookwireData.useStats();
  const deliveries = HookwireData.useDeliveries();
  const endpoints = HookwireData.useEndpoints();
  const loading = useFakeLoad(600);

  const epName = (id) => (endpoints.find((e) => e.id === id) || {}).name || id;
  const recent = deliveries.slice(0, 8);

  return (
    <div data-screen-label="Overview">
      <div className="hw-main-head">
        <h1>Overview</h1>
        <span className="sub">last 60 minutes · live</span>
      </div>

      <div className="hw-stat-grid">
        <StatCard label="Events published" value={stats.published.toLocaleString('en-US')}
          foot={<span><span className="up">▲ 4.2%</span> vs previous hour</span>}></StatCard>
        <StatCard label="Delivery success rate" value={stats.successRate.toFixed(2)} suffix="%"
          foot={<span>{stats.successRate > 99 ? <span className="up">within SLO</span> : <span className="warn">below 99% SLO</span>}</span>}></StatCard>
        <StatCard label="P95 delivery latency" value={stats.p95} suffix="ms"
          foot="across all endpoints"></StatCard>
        <StatCard label="Pending retries" value={stats.pendingRetries}
          foot={stats.pendingRetries > 0 ? <span className="warn">⟳ backoff in progress</span> : 'queue is clear'}></StatCard>
      </div>

      <div className="hw-section">
        <div className="hw-card hw-chart-card">
          <div className="hw-chart-head">
            <div className="hw-stat-label">Deliveries / 5 min</div>
            <span className="meta">−60m → now</span>
          </div>
          <AreaChart data={stats.chart}></AreaChart>
        </div>
      </div>

      <div className="hw-section">
        <div className="hw-section-title">Recent deliveries <span className="meta">last 8</span></div>
        <div className="hw-table-wrap">
          {loading ? (
            <table className="hw-table"><SkeletonRows cols={4} rows={6}></SkeletonRows></table>
          ) : recent.length === 0 ? (
            <EmptyState>no deliveries yet — send a test event →</EmptyState>
          ) : (
            <div>
              {recent.map((d) => {
                const m = DELIVERY_STATUS[d.status];
                const tickColor = d.status === 'delivered' ? 'var(--ok)' : d.status === 'retrying' || d.status === 'pending' ? 'var(--warn)' : 'var(--err)';
                const tick = d.status === 'delivered' ? '✓' : d.status === 'retrying' || d.status === 'pending' ? '⟳' : '✕';
                return (
                  <div className="hw-feed-row" key={d.id} onClick={() => onOpenDelivery(d.id)}>
                    <span className="tick" style={{ color: tickColor }}>{tick}</span>
                    <span className="evt">{d.eventType}</span>
                    <span className="ep">{epName(d.endpointId)}</span>
                    <StatusPill status={d.status}></StatusPill>
                    <span className="when">{timeAgo(d.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointsView({ onOpenEndpoint }) {
  const endpoints = HookwireData.useEndpoints();
  const loading = useFakeLoad(550);

  return (
    <div data-screen-label="Endpoints">
      <div className="hw-main-head">
        <h1>Endpoints</h1>
        <span className="sub">{endpoints.length} subscribed</span>
      </div>
      <div className="hw-table-wrap">
        <table className="hw-table">
          <thead>
            <tr>
              <th>Name</th><th>URL</th><th>Status</th><th>Success rate</th><th>Last delivery</th>
            </tr>
          </thead>
          {loading ? <SkeletonRows cols={5} rows={4}></SkeletonRows> : (
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id} className="clickable" onClick={() => onOpenEndpoint(ep.id)}>
                  <td style={{ fontWeight: 500 }}>{ep.name}</td>
                  <td className="mono">{ep.url}</td>
                  <td><StatusPill status={ep.status} map={ENDPOINT_STATUS}></StatusPill></td>
                  <td className="num">{ep.successRate.toFixed(1)}%</td>
                  <td className="dim">{timeAgo(ep.lastDeliveryAt)}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

function EndpointDetailView({ endpointId, onBack, onOpenDelivery }) {
  const endpoints = HookwireData.useEndpoints();
  const deliveries = HookwireData.useDeliveries();
  const ep = endpoints.find((e) => e.id === endpointId);
  const history = deliveries.filter((d) => d.endpointId === endpointId);

  if (!ep) return null;
  return (
    <div data-screen-label="Endpoint detail">
      <div className="hw-main-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <button className="hw-back" onClick={onBack}>← endpoints</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>{ep.name}</h1>
          <StatusPill status={ep.status} map={ENDPOINT_STATUS}></StatusPill>
        </div>
        <span className="sub mono">{ep.url}</span>
      </div>

      <div className="hw-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard label="Success rate" value={ep.successRate.toFixed(1)} suffix="%"></StatCard>
        <StatCard label="Last delivery" value={timeAgo(ep.lastDeliveryAt)}></StatCard>
        <StatCard label="Deliveries (1h)" value={history.length}></StatCard>
      </div>

      <div className="hw-section">
        <div className="hw-section-title">Signing secret <span className="meta">HMAC-SHA256 · used for X-Hookwire-Signature</span></div>
        <SecretField secret={ep.secret}></SecretField>
      </div>

      <div className="hw-section">
        <div className="hw-section-title">Delivery history <span className="meta">{history.length} in the last hour</span></div>
        <div className="hw-table-wrap">
          {history.length === 0 ? (
            <EmptyState>no deliveries to this endpoint yet</EmptyState>
          ) : (
            <table className="hw-table">
              <thead>
                <tr><th>Event</th><th>Status</th><th>Attempts</th><th>Latency</th><th>When</th></tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => onOpenDelivery(d.id)}>
                    <td className="mono">{d.eventType}</td>
                    <td><StatusPill status={d.status}></StatusPill></td>
                    <td className="num">{d.attempts.length}/{d.maxAttempts}</td>
                    <td className="num">{fmtLatency(d.latencyMs)}</td>
                    <td className="dim">{timeAgo(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OverviewView, EndpointsView, EndpointDetailView });
