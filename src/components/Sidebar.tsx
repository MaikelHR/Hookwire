export type ViewId = 'overview' | 'endpoints' | 'deliveries';

const NAV: Array<{ id: ViewId; label: string; glyph: string }> = [
  { id: 'overview', label: 'Overview', glyph: '◈' },
  { id: 'endpoints', label: 'Endpoints', glyph: '⇄' },
  { id: 'deliveries', label: 'Deliveries', glyph: '⚡' },
];

interface SidebarProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  mode: 'dark' | 'light';
  onToggleMode: () => void;
}

export function Sidebar({ view, onNavigate, mode, onToggleMode }: SidebarProps) {
  return (
    <nav className="bg-sidebar border-r border-line flex flex-col px-3 py-[18px] gap-1">
      <div className="flex items-center gap-[9px] px-2 pt-1 pb-[18px] font-mono font-bold text-[15px] tracking-[0.02em] text-text">
        <span className="w-[22px] h-[22px] flex-none rounded-ctl bg-accent grid place-items-center text-white text-[13px] font-bold">
          ⚓︎
        </span>
        <span className="max-[1180px]:hidden">
          hookwire
          <span className="text-accent animate-blink">_</span>
        </span>
      </div>
      {NAV.map((n) => (
        <button
          key={n.id}
          onClick={() => onNavigate(n.id)}
          className={
            'flex items-center gap-2.5 w-full px-2.5 py-2 border rounded-ctl font-mono text-[12.5px] text-left ' +
            (view === n.id
              ? 'bg-accent/12 border-accent/30 text-text'
              : 'border-transparent bg-transparent text-dim hover:bg-hov hover:text-text')
          }
        >
          <span className="w-4 text-center text-accent font-semibold">{n.glyph}</span>
          <span className="max-[1180px]:hidden">{n.label}</span>
        </button>
      ))}
      <div className="mt-auto flex flex-col gap-2 p-2 max-[1180px]:hidden">
        <button
          onClick={onToggleMode}
          className="flex items-center gap-2 px-2.5 py-[7px] bg-panel border border-line rounded-ctl text-dim font-mono text-[11.5px] hover:border-line-strong hover:text-text"
        >
          {mode === 'dark' ? '☀ light mode' : '◗ dark mode'}
        </button>
        <span className="font-mono text-[10.5px] text-faint">v1.4.0 · portfolio demo</span>
      </div>
    </nav>
  );
}
