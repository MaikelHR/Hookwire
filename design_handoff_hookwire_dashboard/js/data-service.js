/* ============================================================
   Hookwire — mock data service
   Mirrors the future src/lib/data-service.ts:
   - All state + simulation logic lives here.
   - UI consumes it ONLY through hooks:
       useStats, useEndpoints, useDeliveries, useEcho,
       useFailureMode, useDemoActions
   - Swap this file for a real REST layer without touching components.
   ============================================================ */
(function () {
  'use strict';

  // ---------- constants ----------
  var EVENT_TYPES = ['user.created', 'payment.completed', 'ticket.assigned'];
  var BACKOFF_S = [10, 30, 90, 300, 300]; // seconds before attempt 2..6
  var MAX_ATTEMPTS = 6;

  var now = function () { return Date.now(); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var rint = function (a, b) { return Math.round(rand(a, b)); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  var idCounter = 1000;
  function uid(prefix) { return prefix + '_' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6); }

  function hex(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    return s;
  }

  // ---------- payloads ----------
  var NAMES = ['Ada Park', 'Tomás Rivera', 'Mina Okafor', 'Jules Bernard', 'Sofía Quintero', 'Ravi Patel'];
  var SUBJECTS = ['Cannot reset password', 'Invoice mismatch on #4821', 'Webhook retries flooding logs', 'Upgrade to Team plan', 'API key rotation help'];

  function makePayload(eventType) {
    var base = { id: 'evt_' + hex(14), type: eventType, created: new Date().toISOString(), livemode: false };
    if (eventType === 'user.created') {
      var name = pick(NAMES);
      base.data = { user: { id: 'usr_' + hex(10), email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', name: name, plan: pick(['free', 'pro', 'team']) } };
    } else if (eventType === 'payment.completed') {
      base.data = { payment: { id: 'pay_' + hex(10), amount: rint(900, 24900), currency: 'usd', method: pick(['card', 'sepa_debit', 'ach']), customer: 'cus_' + hex(8) } };
    } else {
      base.data = { ticket: { id: 'tkt_' + hex(8), subject: pick(SUBJECTS), assignee: pick(NAMES), priority: pick(['low', 'normal', 'high', 'urgent']) } };
    }
    return base;
  }

  function makeSignature(ts) {
    return 't=' + Math.floor(ts / 1000) + ',v1=' + hex(64);
  }

  // ---------- store ----------
  var listeners = new Set();
  function emit() { listeners.forEach(function (l) { l(); }); }

  var state = {
    endpoints: [],
    deliveries: [],   // newest first
    echo: [],         // newest first, demo receiver inbox
    failureMode: false,
    speed: 1,         // backoff divisor (tweak)
    chart: [],        // 12 buckets x 5 min
    base: { published: 12847, delivered: 12480, failedFinal: 67 },
    latencies: []
  };

  // ---------- seed ----------
  function seed() {
    var t = now();
    state.endpoints = [
      { id: 'ep_demo', name: 'Demo receiver (echo)', url: 'https://demo.hookwire.dev/echo', status: 'healthy', successRate: 100, lastDeliveryAt: t - 6 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 4 },
      { id: 'ep_billing', name: 'Billing service', url: 'https://api.acme-billing.com/hooks/hookwire', status: 'healthy', successRate: 99.2, lastDeliveryAt: t - 2 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 31 },
      { id: 'ep_crm', name: 'Legacy CRM sync', url: 'https://crm.internal.example/webhook', status: 'failing', successRate: 62.4, lastDeliveryAt: t - 14 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 9 },
      { id: 'ep_mirror', name: 'Staging mirror', url: 'https://staging.acme.dev/hooks/inbound', status: 'disabled', successRate: 97.8, lastDeliveryAt: t - 86400000 * 2, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 18 }
    ];

    // historical deliveries (~20)
    var rows = [];
    var i, ageMin;
    for (i = 0; i < 21; i++) {
      ageMin = 2 + i * rand(2.4, 4.2);
      var created = t - ageMin * 60000;
      var evt = pick(EVENT_TYPES);
      var ep = pick(['ep_demo', 'ep_billing', 'ep_billing', 'ep_crm']);
      var status = 'delivered';
      if (ep === 'ep_crm') status = pick(['delivered', 'failed', 'dead', 'dead']);
      var d = makeDelivery(evt, ep, created);
      if (status === 'delivered') {
        var dur = rint(58, 240);
        d.attempts.push(makeAttempt(created + dur, 200, dur));
        d.status = 'delivered';
        d.latencyMs = dur;
        state.latencies.push(dur);
      } else {
        var nAtt = status === 'dead' ? MAX_ATTEMPTS : rint(2, 4);
        var at = created;
        for (var k = 0; k < nAtt; k++) {
          var dur2 = rint(900, 3000); // timeouts/errors are slow
          d.attempts.push(makeAttempt(at + dur2, pick([500, 502, 503]), dur2));
          at += (BACKOFF_S[Math.min(k, BACKOFF_S.length - 1)] || 300) * 1000;
        }
        d.status = status === 'dead' ? 'dead' : 'failed';
      }
      rows.push(d);
    }

    // one live retrying delivery against the failing endpoint
    var live = makeDelivery('payment.completed', 'ep_crm', t - 52000);
    live.attempts.push(makeAttempt(t - 50000, 503, 2104));
    live.attempts.push(makeAttempt(t - 20000, 500, 1873));
    live.status = 'retrying';
    live.nextRetryAt = t + 70000; // 90s backoff after attempt 2
    rows.unshift(live);

    rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
    state.deliveries = rows;

    // chart: 12 x 5-minute buckets
    state.chart = [];
    for (i = 0; i < 12; i++) state.chart.push(rint(16, 44));

    // seed latencies
    for (i = 0; i < 40; i++) state.latencies.push(rint(60, 420));
  }

  function makeDelivery(eventType, endpointId, createdAt) {
    return {
      id: uid('dlv'),
      eventId: 'evt_' + hex(14),
      eventType: eventType,
      endpointId: endpointId,
      status: 'pending',          // pending | delivered | retrying | failed | dead
      attempts: [],
      maxAttempts: MAX_ATTEMPTS,
      nextRetryAt: null,
      latencyMs: null,
      payload: makePayload(eventType),
      signature: makeSignature(createdAt),
      createdAt: createdAt
    };
  }

  function makeAttempt(ts, statusCode, durationMs) {
    var ok = statusCode >= 200 && statusCode < 300;
    return {
      ts: ts,
      statusCode: statusCode,
      durationMs: durationMs,
      body: ok ? '{"ok":true,"received":true}' : (statusCode === 503 ? '{"error":"Service Unavailable"}' : '{"error":"Internal Server Error"}')
    };
  }

  // ---------- simulation ----------
  function endpointById(id) {
    return state.endpoints.find(function (e) { return e.id === id; });
  }

  function attemptShouldFail(delivery) {
    var ep = endpointById(delivery.endpointId);
    if (!ep) return true;
    if (ep.id === 'ep_demo') return state.failureMode;
    return ep.status === 'failing';
  }

  function performAttempt(delivery) {
    var t = now();
    var fail = attemptShouldFail(delivery);
    var dur = fail ? rint(700, 2400) : rint(45, 210);
    var code = fail ? pick([500, 500, 503]) : 200;
    delivery.attempts.push(makeAttempt(t, code, dur));

    var ep = endpointById(delivery.endpointId);
    var isDemo = delivery.endpointId === 'ep_demo';

    if (isDemo) {
      state.echo.unshift({
        id: uid('echo'),
        ts: t,
        eventType: delivery.eventType,
        verified: !fail,
        statusCode: code,
        attempt: delivery.attempts.length
      });
      if (state.echo.length > 30) state.echo.length = 30;
    }

    if (!fail) {
      delivery.status = 'delivered';
      delivery.nextRetryAt = null;
      delivery.latencyMs = t - delivery.createdAt;
      state.latencies.push(dur);
      if (state.latencies.length > 200) state.latencies.shift();
      state.base.delivered++;
      if (ep) ep.lastDeliveryAt = t;
      bumpChart();
    } else if (delivery.attempts.length >= delivery.maxAttempts) {
      delivery.status = 'dead';
      delivery.nextRetryAt = null;
      state.base.failedFinal++;
    } else {
      delivery.status = 'retrying';
      var backoff = BACKOFF_S[delivery.attempts.length - 1] || 300;
      delivery.nextRetryAt = t + (backoff * 1000) / state.speed;
    }
    emit();
  }

  function bumpChart() {
    state.chart[state.chart.length - 1]++;
  }

  // tick: fire due retries + keep countdowns fresh
  setInterval(function () {
    var t = now();
    var dirty = false;
    state.deliveries.forEach(function (d) {
      if (d.status === 'retrying' && d.nextRetryAt && d.nextRetryAt <= t) {
        performAttempt(d);
        dirty = false; // performAttempt already emitted
      } else if (d.status === 'retrying' || d.status === 'pending') {
        dirty = true; // countdown displays need a re-render
      }
    });
    if (dirty) emit();
  }, 500);

  // ---------- actions ----------
  function sendTestEvent(eventType) {
    var t = now();
    var d = makeDelivery(eventType || pick(EVENT_TYPES), 'ep_demo', t);
    state.deliveries.unshift(d);
    state.base.published++;
    bumpChart();
    emit();
    setTimeout(function () { performAttempt(d); }, rint(450, 900));
    return d.id;
  }

  function setFailureMode(on) {
    state.failureMode = !!on;
    var ep = endpointById('ep_demo');
    if (ep) ep.status = on ? 'failing' : 'healthy';
    // recovering: pull in the next retry so the user sees recovery fast
    if (!on) {
      var t = now();
      state.deliveries.forEach(function (d) {
        if (d.endpointId === 'ep_demo' && d.status === 'retrying') {
          d.nextRetryAt = Math.min(d.nextRetryAt || t + 2500, t + 2500);
        }
      });
    }
    emit();
  }

  function replayDelivery(id) {
    var d = state.deliveries.find(function (x) { return x.id === id; });
    if (!d) return;
    d.status = 'pending';
    d.nextRetryAt = null;
    emit();
    setTimeout(function () { performAttempt(d); }, rint(450, 900));
  }

  function setSpeed(x) {
    state.speed = x || 1;
  }

  // ---------- derived ----------
  function computeStats() {
    var pending = state.deliveries.filter(function (d) { return d.status === 'retrying' || d.status === 'pending'; }).length;
    var total = state.base.delivered + state.base.failedFinal;
    var lat = state.latencies.slice().sort(function (a, b) { return a - b; });
    var p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0;
    return {
      published: state.base.published,
      successRate: total ? (state.base.delivered / total) * 100 : 100,
      p95: p95,
      pendingRetries: pending,
      chart: state.chart.slice()
    };
  }

  // ---------- hooks ----------
  function useStoreVersion() {
    var hook = React.useState(0);
    var setV = hook[1];
    React.useEffect(function () {
      var l = function () { setV(function (x) { return x + 1; }); };
      listeners.add(l);
      return function () { listeners.delete(l); };
    }, []);
  }

  function useStats() { useStoreVersion(); return computeStats(); }
  function useEndpoints() { useStoreVersion(); return state.endpoints; }
  function useDeliveries() { useStoreVersion(); return state.deliveries; }
  function useEcho() { useStoreVersion(); return state.echo; }
  function useFailureMode() { useStoreVersion(); return state.failureMode; }
  function useDemoActions() {
    return { sendTestEvent: sendTestEvent, setFailureMode: setFailureMode, replayDelivery: replayDelivery, setSpeed: setSpeed };
  }

  seed();

  window.HookwireData = {
    useStats: useStats,
    useEndpoints: useEndpoints,
    useDeliveries: useDeliveries,
    useEcho: useEcho,
    useFailureMode: useFailureMode,
    useDemoActions: useDemoActions,
    EVENT_TYPES: EVENT_TYPES,
    BACKOFF_S: BACKOFF_S,
    MAX_ATTEMPTS: MAX_ATTEMPTS
  };
})();
