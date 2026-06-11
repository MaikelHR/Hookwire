/* Hookwire — Deliveries view + delivery detail drawer */

function DeliveriesView({ onOpenDelivery }) {
  const deliveries = HookwireData.useDeliveries();
  const endpoints = HookwireData.useEndpoints();
  const loading = useFakeLoad(550);
  const epName = (id) => (endpoints.find((e) => e.id === id) || {}).name || id;

  // remember which rows are new for the entrance animation
  const seen = React.useRef(new Set());
  React.useEffect(() => {
    deliveries.forEach((d) => seen.current.add(d.id));
  });

  return (
    <div data-screen-label="Deliveries">
      <div className="hw-main-head">
        <h1>Deliveries</h1>
        <span className="sub">{deliveries.length} attempts · last hour</span>
      </div>
      <div className="hw-table-wrap">
        <table className="hw-table">
          <thead>
            <tr>
              <th>Event type</th><th>Endpoint</th><th>Status</th><th>Attempts</th><th>Next retry</th><th>Latency</th><th>When</th>
            </tr>
          </thead>
          {loading ? <SkeletonRows cols={7} rows={8}></SkeletonRows> : (
            <tbody>
              {deliveries.map((d) => {
                const isNew = !seen.current.has(d.id);
                return (
                  <tr key={d.id} className={'clickable' + (isNew ? ' hw-row-enter' : '')} onClick={() => onOpenDelivery(d.id)}>
                    <td className="mono" style={{ color: 'var(--text)' }}>{d.eventType}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{epName(d.endpointId)}</td>
                    <td><StatusPill status={d.status}></StatusPill></td>
                    <td className="num">{d.attempts.length}/{d.maxAttempts}</td>
                    <td>{d.status === 'retrying' && d.nextRetryAt ? <Countdown target={d.nextRetryAt}></Countdown> : <span className="dim">—</span>}</td>
                    <td className="num">{fmtLatency(d.latencyMs)}</td>
                    <td className="dim">{timeAgo(d.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

/* ---------- detail drawer ---------- */

function DeliveryDrawer({ deliveryId, onClose }) {
  const deliveries = HookwireData.useDeliveries();
  const endpoints = HookwireData.useEndpoints();
  const { replayDelivery } = HookwireData.useDemoActions();
  const d = deliveries.find((x) => x.id === deliveryId);
  if (!d) return null;
  const ep = endpoints.find((e) => e.id === d.endpointId) || {};
  const BACKOFF_S = HookwireData.BACKOFF_S;

  const headers = [
    ['Content-Type', 'application/json'],
    ['User-Agent', 'Hookwire/1.4 (+https://hookwire.dev)'],
    ['X-Hookwire-Event', d.eventType],
    ['X-Hookwire-Delivery', d.id],
    ['X-Hookwire-Signature', d.signature]
  ];

  const fmtBackoff = (s) => (s >= 60 ? s / 60 + 'm' : s + 's');

  return (
    <div data-screen-label="Delivery drawer">
      <div className="hw-drawer-veil" onClick={onClose}></div>
      <aside className="hw-drawer">
        <div className="hw-drawer-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }} className="mono">{d.eventType}</h2>
              <StatusPill status={d.status}></StatusPill>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
              {d.id} → {ep.name} · {fmtClock(d.createdAt)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="hw-btn small" onClick={() => replayDelivery(d.id)}
              disabled={d.status === 'pending' || d.status === 'retrying'}>⟳ Replay delivery</button>
            <button className="hw-iconbtn" onClick={onClose}>esc ✕</button>
          </div>
        </div>

        <div className="hw-drawer-body">
          <section>
            <h3>Request headers</h3>
            <div className="hw-kv">
              {headers.map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="k">{k}:</span>
                  <span className={'v' + (k === 'X-Hookwire-Signature' ? ' hl' : '')}>{v}</span>
                </React.Fragment>
              ))}
            </div>
          </section>

          <section>
            <h3>Payload</h3>
            <JsonCode obj={d.payload}></JsonCode>
          </section>

          <section>
            <h3>Attempts · {d.attempts.length}/{d.maxAttempts}</h3>
            <div className="hw-attempts">
              {d.attempts.map((a, i) => {
                const ok = a.statusCode >= 200 && a.statusCode < 300;
                const hasNext = i < d.attempts.length - 1 || (d.status === 'retrying' && d.nextRetryAt);
                const gapS = BACKOFF_S[i] || 300;
                return (
                  <div className="hw-attempt" key={i}>
                    <div className="rail">
                      <span className={'node ' + (ok ? 'ok' : 'err')}></span>
                      {hasNext ? <span className="line"></span> : null}
                    </div>
                    <div className="body">
                      <div className="row1">
                        <span style={{ color: 'var(--text-dim)' }}>#{i + 1}</span>
                        <span className={ok ? 'code-ok' : 'code-err'}>{a.statusCode}</span>
                        <span style={{ color: 'var(--text-faint)', fontSize: 10.5 }}>{fmtClock(a.ts)}</span>
                        <span className="dur">{a.durationMs}ms</span>
                      </div>
                      <div className="resp">{a.body}</div>
                      {!ok && hasNext ? (
                        <div className="gap-label">└ backoff <b>{fmtBackoff(gapS)}</b> before next attempt</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {d.status === 'retrying' && d.nextRetryAt ? (
                <div className="hw-attempt">
                  <div className="rail"><span className="node next"></span></div>
                  <div className="body">
                    <div className="row1">
                      <span style={{ color: 'var(--text-dim)' }}>#{d.attempts.length + 1}</span>
                      <span style={{ color: 'var(--warn)' }}>scheduled</span>
                      <Countdown target={d.nextRetryAt}></Countdown>
                    </div>
                  </div>
                </div>
              ) : null}
              {d.status === 'dead' ? (
                <div className="hw-attempt">
                  <div className="rail"><span className="node err"></span></div>
                  <div className="body">
                    <div className="row1"><span style={{ color: 'var(--err)' }}>moved to dead letter queue</span></div>
                    <div className="resp">max attempts ({d.maxAttempts}) exhausted — replay manually when the endpoint recovers</div>
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

Object.assign(window, { DeliveriesView, DeliveryDrawer });
