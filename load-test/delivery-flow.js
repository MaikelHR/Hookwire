// delivery-flow.js: el flujo de escritura completo, calibrado para NO chocar
// con el rate limit (30 eventos / 5 min por IP): 1 VU publica un evento cada
// ~15 s durante 3 min, unos 12 eventos en total. Mide la latencia del POST
// (que incluye el drain inline: firma + entrega real al echo receiver) y
// verifica con una lectura que la delivery quedo delivered.
//
//   k6 run load-test/delivery-flow.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://hookwire.vercel.app';

const publishAndDeliver = new Trend('publish_and_deliver_ms', true);

export const options = {
  scenarios: {
    publisher: {
      executor: 'constant-vus',
      vus: 1,
      duration: '3m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    publish_and_deliver_ms: ['p(95)<4000'],
  },
};

export default function () {
  const eventId = `evt_k6_${__VU}_${__ITER}_${Date.now()}`;
  const res = http.post(
    `${BASE_URL}/api/events`,
    JSON.stringify({
      id: eventId,
      event_type: 'payment.completed',
      payload: { id: eventId, source: 'k6', amount: 4200, currency: 'usd' },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'published 201': (r) => r.status === 201,
    'drain delivered inline': (r) => r.json('drain.delivered') === 1,
  });
  if (res.status === 201) publishAndDeliver.add(res.timings.duration);

  // La lectura confirma lo que el drain inline reporto
  const list = http.get(`${BASE_URL}/api/deliveries`);
  check(list, {
    'delivery visible and delivered': (r) => {
      const deliveries = r.json('deliveries');
      return (
        Array.isArray(deliveries) &&
        deliveries.some((d) => d.eventId === eventId && d.status === 'delivered')
      );
    },
  });

  sleep(15); // 12 eventos en 3 min, por debajo de 30 / 5 min
}
