// rate-limit.js: choca con el rate limit A PROPOSITO para demostrar el 429.
// Dispara 40 eventos seguidos desde una IP; la ventana deslizante admite 30
// cada 5 min, asi que el resto debe responder 429 con el header Retry-After.
// Correr DESPUES de delivery-flow deja eventos previos en la ventana y el
// 429 llega antes de los 30: el check no asume el numero exacto.
//
// Ojo: tras correrlo, la IP queda sin presupuesto de eventos por unos
// minutos (el toast de la UI mostraria exactamente eso).
//
//   k6 run load-test/rate-limit.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://hookwire.vercel.app';

const accepted = new Counter('events_accepted');
const limited = new Counter('events_rate_limited');

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 4,
      iterations: 40,
    },
  },
  thresholds: {
    // El test FALLA si el servidor nunca limito: eso seria un bug
    events_rate_limited: ['count>0'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const eventId = `evt_k6burst_${__VU}_${__ITER}_${Date.now()}`;
  const res = http.post(
    `${BASE_URL}/api/events`,
    JSON.stringify({ id: eventId, event_type: 'user.created', payload: { id: eventId, source: 'k6-burst' } }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status === 201) {
    accepted.add(1);
    check(res, { 'accepted has drain result': (r) => r.json('drain') !== null });
  } else {
    limited.add(1);
    check(res, {
      'limited is 429': (r) => r.status === 429,
      '429 carries Retry-After seconds': (r) => Number(r.headers['Retry-After']) > 0,
      '429 body repeats retryAfterS': (r) => Number(r.json('retryAfterS')) > 0,
    });
  }
}
