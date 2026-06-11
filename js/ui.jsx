/* Hookwire — shared UI primitives */

const { useState, useEffect, useRef } = React;

// ---------- time helpers ----------
function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
function fmtClock(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 60) return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  return s + 's';
}
function fmtLatency(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

// ---------- status maps ----------
const DELIVERY_STATUS = {
  pending:   { label: 'Pending',       cls: 'mutedp' },
  delivered: { label: 'Delivered',     cls: 'ok' },
  retrying:  { label: 'Retrying',      cls: 'warn' },
  failed:    { label: 'Failed',        cls: 'err' },
  dead:      { label: 'Dead-lettered', cls: 'err' }
};
const ENDPOINT_STATUS = {
  healthy:  { label: 'Healthy',  cls: 'ok' },
  failing:  { label: 'Failing',  cls: 'err' },
  disabled: { label: 'Disabled', cls: 'mutedp' }
};

function StatusPill({ status, map }) {
  const m = (map || DELIVERY_STATUS)[status] || { label: status, cls: 'mutedp' };
  return (
    <span className={'hw-pill ' + m.cls}>
      <span className="dot"></span>{m.label}
    </span>
  );
}

// ---------- stat card ----------
function StatCard({ label, value, suffix, foot }) {
  return (
    <div className="hw-card">
      <div className="hw-stat-label">{label}</div>
      <div className="hw-stat-value">{value}{suffix ? <small> {suffix}</small> : null}</div>
      {foot ? <div className="hw-stat-foot">{foot}</div> : null}
    </div>
  );
}

// ---------- area chart (SVG) ----------
function AreaChart({ data, height = 96 }) {
  const w = 100, h = 40;
  const max = Math.max(...data, 1) * 1.15;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * h]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  const area = line + ' L ' + w + ' ' + h + ' L 0 ' + h + ' Z';
  return (
    <svg viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" style={{ width: '100%', height: height, display: 'block' }}>
      <defs>
        <linearGradient id="hw-area-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28"></stop>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02"></stop>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hw-area-g)"></path>
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke"></path>
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill="var(--accent)"></circle>
    </svg>
  );
}

// ---------- skeletons / empty ----------
function SkeletonRows({ cols = 4, rows = 5 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}><div className="hw-skel" style={{ width: (40 + ((r * 13 + c * 29) % 50)) + '%' }}></div></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function EmptyState({ glyph = '∅', children }) {
  return (
    <div className="hw-empty">
      <span className="glyph">{glyph}</span>
      {children}
    </div>
  );
}

// ---------- copy button ----------
function CopyButton({ text, label = 'copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="hw-iconbtn"
      onClick={(e) => {
        e.stopPropagation();
        try { navigator.clipboard.writeText(text); } catch (err) {}
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >{copied ? 'copied ✓' : label}</button>
  );
}

// ---------- JSON syntax highlight ----------
function JsonCode({ obj }) {
  const json = JSON.stringify(obj, null, 2);
  const nodes = [];
  // tokenized via regex: strings (key vs value), numbers, booleans/null
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) nodes.push(<span key={k++} className="jp">{json.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      nodes.push(<span key={k++} className={m[2] ? 'jk' : 'js'}>{m[1]}</span>);
      if (m[2]) nodes.push(<span key={k++} className="jp">{m[2]}</span>);
    } else if (m[3] !== undefined) {
      nodes.push(<span key={k++} className="jb">{m[3]}</span>);
    } else {
      nodes.push(<span key={k++} className="jn">{m[0]}</span>);
    }
    last = re.lastIndex;
  }
  if (last < json.length) nodes.push(<span key={k++} className="jp">{json.slice(last)}</span>);
  return <pre className="hw-code">{nodes}</pre>;
}

// ---------- live countdown ----------
function Countdown({ target }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  return <span className="hw-countdown">in {fmtCountdown(target - Date.now())}</span>;
}

// ---------- masked secret ----------
function SecretField({ secret }) {
  const [show, setShow] = useState(false);
  const masked = secret.slice(0, 6) + '••••••••••••••••••••' + secret.slice(-4);
  return (
    <div className="hw-secret">
      <span className="val">{show ? secret : masked}</span>
      <button className="hw-iconbtn" onClick={() => setShow(!show)}>{show ? 'hide' : 'show'}</button>
      <CopyButton text={secret}></CopyButton>
    </div>
  );
}

// ---------- fake first-load hook ----------
function useFakeLoad(ms = 650) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, []);
  return loading;
}

Object.assign(window, {
  timeAgo, fmtClock, fmtCountdown, fmtLatency,
  DELIVERY_STATUS, ENDPOINT_STATUS,
  StatusPill, StatCard, AreaChart, SkeletonRows, EmptyState,
  CopyButton, JsonCode, Countdown, SecretField, useFakeLoad
});
