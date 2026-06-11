/* Hookwire — Live Demo panel + first-visit modal */

function LiveDemoPanel() {
  const echo = HookwireData.useEcho();
  const failureMode = HookwireData.useFailureMode();
  const { sendTestEvent, setFailureMode } = HookwireData.useDemoActions();
  const [eventType, setEventType] = React.useState('user.created');
  const [sending, setSending] = React.useState(false);
  const listRef = React.useRef(null);

  const send = () => {
    setSending(true);
    sendTestEvent(eventType);
    setTimeout(() => setSending(false), 500);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  return (
    <aside className="hw-demo" data-screen-label="Live demo panel">
      <div className="hw-demo-head">
        <div className="hw-demo-title"><span className="dot"></span>Live demo</div>
        <div className="hw-hints">
          <div className="hw-hint"><span className="n">1</span><span>Send an event</span></div>
          <div className="hw-hint"><span className="n">2</span><span>Watch it get delivered</span></div>
          <div className="hw-hint"><span className="n">3</span><span>Break the endpoint and watch the retries</span></div>
        </div>
      </div>

      <div className="hw-demo-controls">
        <div className="hw-send-row">
          <select className="hw-select" value={eventType} onChange={(e) => setEventType(e.target.value)} aria-label="Event type">
            {HookwireData.EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="hw-btn primary" onClick={send} disabled={sending}>
            {sending ? '⟳ sending…' : '▸ Send test event'}
          </button>
        </div>
        <div className="hw-toggle-row">
          <button className={'hw-switch' + (failureMode ? ' on' : '')} onClick={() => setFailureMode(!failureMode)} aria-label="Simulate endpoint failure">
            <span className="knob"></span>
          </button>
          <div>
            <div className="hw-toggle-label">Simulate endpoint failure</div>
            <div className="hw-toggle-help">(receiver returns 500 — deliveries enter retry backoff)</div>
          </div>
        </div>
      </div>

      <div className="hw-echo">
        <div className="hw-echo-head">
          <span className="t">Echo receiver · demo.hookwire.dev</span>
          <span className="t" style={{ textTransform: 'none', letterSpacing: 0 }}>{echo.length > 0 ? echo.length + ' rcvd' : ''}</span>
        </div>
        <div className="hw-echo-list" ref={listRef}>
          {echo.length === 0 ? (
            <EmptyState glyph="⇣">webhooks received by the demo endpoint<br></br>will appear here in real time</EmptyState>
          ) : echo.map((e) => (
            <div className="hw-echo-card" key={e.id}>
              <div className="line1">
                <span className="evt">{e.eventType}</span>
                <span className="ts">{fmtClock(e.ts)}</span>
              </div>
              <div className="line2">
                {e.verified ? (
                  <span className="hw-badge verified">✓ Signature verified</span>
                ) : (
                  <span className="hw-badge failed">✕ responded 500</span>
                )}
                {e.attempt > 1 ? <span className="hw-badge attempt">attempt #{e.attempt}</span> : null}
                <span className="hw-badge attempt">{e.statusCode}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ---------- first-visit modal ---------- */

function FirstVisitModal({ onDismiss }) {
  return (
    <div className="hw-modal-veil" onClick={onDismiss} data-screen-label="Welcome modal">
      <div className="hw-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome to Hookwire</h2>
        <p>Hookwire is a webhook delivery service: it receives events, signs them, and delivers them to your endpoints with automatic retries and dead-lettering.</p>
        <p>Use the <strong>Live Demo</strong> panel on the right to send a test event, then break the endpoint and watch the retry backoff in action.</p>
        <div className="note">Portfolio project — your demo data is isolated per session and expires.</div>
        <div className="actions">
          <button className="hw-btn primary" onClick={onDismiss}>Try the demo</button>
          <a className="hw-btn" href="https://github.com/" target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>⌥ View on GitHub</a>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LiveDemoPanel, FirstVisitModal });
