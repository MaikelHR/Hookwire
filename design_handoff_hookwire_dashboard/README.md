# Handoff: Hookwire — Webhook Delivery Dashboard

## Overview
Hookwire is a webhook delivery service dashboard built as a **portfolio demo**: a recruiter lands on it and can try the entire flow (send event → watch delivery → break endpoint → watch retries → recovery) in under a minute, with zero configuration. It is a developer tool in the spirit of webhook infrastructure products, with a single-page layout: left sidebar navigation, main content area, and a persistent "Live Demo" panel docked on the right.

## About the Design Files
The files in this bundle are **design references created in HTML** (React 18 + Babel-in-browser, plain CSS). They are prototypes showing the intended look and behavior — **not production code to copy directly**. The task is to **recreate this design in the target stack: React + TypeScript + Tailwind (Vite or similar)**, using that codebase's established patterns.

That said, the prototype was deliberately architected to make porting easy:
- `js/data-service.js` maps 1:1 to the planned `src/lib/data-service.ts` — all state, seeding, and simulation logic lives there, exposed only through hooks. Port its logic and types; the UI never touches the store directly.
- The CSS is organized entirely around custom properties (design tokens), which translate directly to a Tailwind theme config.
- `js/tweaks-panel.jsx` is a **design-review tool only** — do NOT port it. The chosen values it produced are baked into the tokens below.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-perfectly. The approved configuration is:
- Visual direction: **graphite** (the `phosphor` and `carbon` CSS blocks in `hookwire.css` were exploration variants — ignore them)
- Accent: **#b07ce8** (violet)
- Density: **comfy** (row padding 12px)
- Retry backoff: **real** (10s / 30s / 90s / 5m / 5m — no speed multiplier)

---

## Design Tokens

### Colors — dark mode (default)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#101214` | App background |
| `--bg-sidebar` | `#0b0d0e` | Sidebar |
| `--bg-panel` | `#14171a` | Demo panel, drawer, modal, table headers |
| `--bg-card` | `#16191d` | Cards, tables, buttons |
| `--bg-inset` | `#0d0f11` | Code blocks, inputs, echo cards, secret field |
| `--bg-hover` | `#1b1f24` | Row/button hover |
| `--border` | `#23282e` | Default borders, row dividers |
| `--border-strong` | `#2f353d` | Input borders, emphasized borders |
| `--text` | `#e8eaec` | Primary text |
| `--text-dim` | `#9aa3ab` | Secondary text |
| `--text-faint` | `#5c656e` | Labels, metadata, timestamps |
| `--accent` | `#b07ce8` | Interactive: active nav, primary button, chart, links, focus, signature highlight |
| `--ok` | `oklch(0.72 0.15 160)` | Delivered / Healthy / verified (green) |
| `--warn` | `oklch(0.78 0.14 80)` | Retrying / countdowns (amber) |
| `--err` | `oklch(0.66 0.18 25)` | Failed / Dead-lettered / failure toggle (red) |
| shadow | `0 8px 24px rgba(0,0,0,.4)` | Drawer, modal |

Status colors are **fixed** (semantic) and never change with the accent.

### Colors — light mode (toggle in sidebar footer)
`--bg #f4f5f3`, `--bg-sidebar #ebede9`, `--bg-panel #fbfcfa`, `--bg-card #ffffff`, `--bg-inset #eef0ec`, `--bg-hover #eff1ed`, `--border #dde0da`, `--border-strong #c6cac2`, `--text #191c1a`, `--text-dim #5b635d`, `--text-faint #98a09a`, shadow `0 6px 18px rgba(20,30,24,.08)`. Accent and status colors unchanged.

### Typography
| Role | Font | Notes |
|---|---|---|
| Headings, stat values | **Space Grotesk** 600 | h1 21px; stat value 26px, letter-spacing −0.01em |
| Body | Space Grotesk 400/500 | Base 13.5px / 1.45 |
| Mono (everything technical) | **JetBrains Mono** | IDs, URLs, payloads, nav labels, table headers, pills, timestamps, countdowns |

Mono sizes used: table headers 10px uppercase tracking .09em; section micro-labels 10.5px uppercase tracking .08em; table mono cells 11.5px; metadata 10.5px; pills 10.5px.
Numeric cells and stat values use `font-variant-numeric: tabular-nums`.

### Spacing, radii, misc
- Radius: 8px (cards/modal), 6px (buttons/inputs/code), 99px (pills/badges)
- Table cell padding: `12px 14px` (comfy density)
- Card padding: `16px 18px`; main content padding: `26px 30px`
- Grid: sidebar **208px** | main **1fr** | demo panel **348px**, full viewport height, only the main column and echo list scroll
- ≤1180px: sidebar collapses to 64px (icons only), demo panel 320px

---

## Screens / Views

### App shell
- **Sidebar** (left, 208px): logo "hookwire_" in mono bold with a 22×22 accent-colored rounded mark and a blinking `_` cursor (1.1s steps); nav items (Overview ◈, Endpoints ⇄, Deliveries ⚡) — mono 12.5px, glyph in accent color; active item = accent at 12% background + accent 30% border; footer has light/dark toggle button and "v1.4.0 · portfolio demo" note.
- **Live Demo panel** (right, 348px) is visible from every view.

### 1. Overview
- 4 stat cards (grid, 12px gap): Events published (with "▲ 4.2% vs previous hour" in green), Delivery success rate (% with SLO footnote, amber if <99), P95 delivery latency (ms), Pending retries ("⟳ backoff in progress" in amber when >0). Label = mono 10.5px uppercase faint; value = 26px Space Grotesk 600.
- Area chart card: "Deliveries / 5 min", 12 buckets covering −60m→now. SVG: accent stroke 1.4px, vertical gradient fill accent 28%→2%, dot on last point.
- "Recent deliveries" feed: last 8, compact rows in a card — grid `[status tick 14px | event type mono | endpoint name | status pill | relative time]`. Tick: ✓ green / ⟳ amber / ✕ red. Rows clickable → delivery drawer.

### 2. Endpoints
- Table: Name (500 weight) · URL (mono, dim) · Status pill (Healthy green / Failing red / Disabled gray) · Success rate · Last delivery (relative).
- Seeded: **Demo receiver (echo)** `https://demo.hookwire.dev/echo` (healthy), Billing service (healthy 99.2%), Legacy CRM sync (failing 62.4%), Staging mirror (disabled).
- Row click → **Endpoint detail**: back link "← endpoints" (accent), h1 + status pill, URL subtitle; 3 stat cards (Success rate, Last delivery, Deliveries 1h); **Signing secret** field — masked `whsec_xxxxxx••••••••••••••••••••xxxx` in an inset mono field with `show`/`copy` ghost buttons (copy shows "copied ✓" for 1.4s); Delivery history table (Event · Status · Attempts · Latency · When), rows open the drawer.

### 3. Deliveries
- Table: Event type (mono) · Endpoint · Status badge (Delivered / Retrying / Failed / Dead-lettered / Pending) · Attempts `2/6` · Next retry (live countdown "in 1m 23s", amber mono, only when retrying) · Latency ("142ms") · When.
- New rows animate in: 0.55s translateY(−5px→0) + accent background flash 16%→transparent. **Important:** entrance animations never animate from `opacity:0` — the base state must be fully visible (export/screenshot safety).
- Row click → **detail drawer**: fixed right, `min(620px, 92vw)`, slides in 0.25s from translateX(48px), dark veil `rgba(0,0,0,.45)`; closes on veil click, ✕ button, or Escape.
  - Header: event type (mono 15px) + status pill; `dlv_id → endpoint · HH:MM:SS`; **⟳ Replay delivery** button (disabled while pending/retrying).
  - **Request headers** key/value list (mono 11.5px): Content-Type, User-Agent, X-Hookwire-Event, X-Hookwire-Delivery, **X-Hookwire-Signature** (`t=<unix>,v1=<64-hex>`) highlighted — accent text on accent-8% background.
  - **Payload**: JSON in inset code block, syntax highlighted: keys accent, strings amber, numbers blue `oklch(0.72 0.15 250)`, booleans/null red, punctuation faint.
  - **Attempts · n/6**: vertical timeline. Node per attempt: solid green (2xx) / red-tinted (error) / dashed amber pulsing for the scheduled next attempt; 2px connector line. Each row: `#n` · status code (green/red bold) · HH:MM:SS · duration · response body snippet. Failed attempts show `└ backoff 30s before next attempt` between nodes. Retrying: extra "scheduled" node with live countdown. Dead: terminal red node — "moved to dead letter queue / max attempts (6) exhausted — replay manually when the endpoint recovers".

### 4. Live Demo panel
- Header: pulsing green dot + "LIVE DEMO" (mono uppercase), then the 3-step hint strip: numbered accent-outlined circles — 1) Send an event 2) Watch it get delivered 3) Break the endpoint and watch the retries.
- Controls: `<select>` of event types (`user.created`, `payment.completed`, `ticket.assigned`) + primary accent button **▸ Send test event** (briefly "⟳ sending…" ~500ms). Below: failure switch (34×19 pill; ON = red knob/border/tint) — "Simulate endpoint failure" with helper "(receiver returns 500 — deliveries enter retry backoff)".
- **Echo receiver** console ("ECHO RECEIVER · DEMO.HOOKWIRE.DEV"): scrollable list of inset mono cards, newest on top, entering with the flash animation. Card: event type + HH:MM:SS; badges: **✓ Signature verified** (green tint) on success or **✕ responded 500** (red tint) on failure, plus `attempt #n` (n>1) and the status code. Empty state: ⇣ glyph + "webhooks received by the demo endpoint will appear here in real time".

### 5. First-visit modal
- Centered, 440px, over `rgba(0,0,0,.55)` veil; entrance translateY(14px→0) 0.3s. Shown once — dismissal stored in `localStorage["hookwire_intro_seen"]`.
- Copy: title "Welcome to Hookwire"; two sentences (see `demo-panel.jsx`); dashed-border note "Portfolio project — your demo data is isolated per session and expires."; buttons **Try the demo** (primary) + **⌥ View on GitHub** (placeholder `https://github.com/` — **replace with the real repo URL**).

---

## Interactions & Behavior

### Simulation (the core of the demo)
- **Send test event** → creates a Delivery (`pending`) against the demo endpoint, increments Events published and the chart's last bucket, then attempts delivery after 450–900ms.
- Attempt **success** (failure toggle OFF): 200 in 45–210ms → status `delivered`, latency recorded, stats/feed update, echo card appears with "Signature verified".
- Attempt **failure** (toggle ON): 500/503 in 700–2400ms → status `retrying`; next attempt scheduled with backoff `[10s, 30s, 90s, 5m, 5m]` (max **6** attempts); live countdowns everywhere; echo card shows "✕ responded 500". After 6 failures → `dead` (Dead-lettered).
- **Toggle OFF during retries** → pending retries are pulled forward (~2.5s) so recovery is visible immediately; demo endpoint status returns to Healthy (it shows Failing while ON).
- **Replay delivery** → resets to `pending` and re-attempts (new attempt appended to history).
- A ticker (500ms) fires due retries and refreshes countdown renders.

### UI behaviors
- Loading skeletons: shimmering bars (1.2s linear) shown ~550–650ms on first mount of each view.
- Hovers: rows `--bg-hover`; buttons brighten/border-strengthen; primary button `brightness(1.08)`.
- Retrying pill dot and "next attempt" node pulse (opacity 1→.35, 1.2s).
- Escape closes the drawer. Theme toggle is React state (persisting it is a nice-to-have).
- Empty states: mono faint text with a large glyph (see echo console / tables).

## State Management
Port `js/data-service.js` to `src/lib/data-service.ts`:

```ts
type EndpointStatus = 'healthy' | 'failing' | 'disabled';
type DeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'failed' | 'dead';

interface Endpoint { id: string; name: string; url: string; status: EndpointStatus;
  successRate: number; lastDeliveryAt: number; secret: string; createdAt: number; }
interface DeliveryAttempt { ts: number; statusCode: number; durationMs: number; body: string; }
interface Delivery { id: string; eventId: string; eventType: string; endpointId: string;
  status: DeliveryStatus; attempts: DeliveryAttempt[]; maxAttempts: number;
  nextRetryAt: number | null; latencyMs: number | null; payload: object;
  signature: string; createdAt: number; }
interface EchoEntry { id: string; ts: number; eventType: string; verified: boolean;
  statusCode: number; attempt: number; }
```

Hooks (the only API the UI may use): `useStats()`, `useEndpoints()`, `useDeliveries()`, `useEcho()`, `useFailureMode()`, `useDemoActions()` → `{ sendTestEvent, setFailureMode, replayDelivery }`. The store is a plain object + listener set (subscribe/emit) — port as-is, or wrap with `useSyncExternalStore`. Seed data: 4 endpoints, ~21 historical deliveries (~last hour), one live `retrying` delivery against the failing CRM endpoint, 12 chart buckets, base counters (published 12,847 / delivered 12,480 / failed 67). Stats are derived (P95 from a rolling latency array). Swapping this module for a real REST API must require **zero component changes**.

## Assets
None — no images or icon fonts. All glyphs are Unicode characters (◈ ⇄ ⚡ ⟳ ✓ ✕ ▸ ⇣ ⚓︎ ☀ ◗ ∅). Fonts from Google Fonts: Space Grotesk (400–700), JetBrains Mono (400, 500, 700).

## Files
| File | Contents |
|---|---|
| `Hookwire Dashboard.html` | Entry point (script load order, font links) |
| `css/hookwire.css` | All tokens + component styles (use the `graphite` + light-mode blocks; `phosphor`/`carbon` are unused explorations) |
| `js/data-service.js` | **Port this** → `src/lib/data-service.ts` (state, seed, simulation, hooks) |
| `js/ui.jsx` | Primitives: StatusPill, StatCard, AreaChart, SkeletonRows, EmptyState, CopyButton, JsonCode, Countdown, SecretField, time formatters |
| `js/views-main.jsx` | Overview, Endpoints, Endpoint detail |
| `js/views-deliveries.jsx` | Deliveries table + detail drawer |
| `js/demo-panel.jsx` | Live Demo panel + first-visit modal |
| `js/app.jsx` | Shell, routing (plain state), theme + density wiring |
| `js/tweaks-panel.jsx` | Design-review tooling — **do not port** |

Open `Hookwire Dashboard.html` in a browser (needs network for fonts/CDN React) to see the living reference.
