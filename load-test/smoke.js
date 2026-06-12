// smoke.js: lecturas del dashboard (stats, deliveries, endpoints).
// Estas rutas NO tienen rate limit, asi que es el escenario para subir VUs.
// Cada VU tiene su propio cookie jar: k6 simula N visitantes con N sesiones
// aisladas, igual que N navegadores distintos.
//
//   k6 run load-test/smoke.js
//   k6 run -e BASE_URL=http://localhost:3000 load-test/smoke.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://hookwire.vercel.app';

export const options = {
  scenarios: {
    dashboard_readers: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  // El mismo trio que el dashboard polea cada 4 s
  const stats = http.get(`${BASE_URL}/api/stats`);
  const deliveries = http.get(`${BASE_URL}/api/deliveries`);
  const endpoints = http.get(`${BASE_URL}/api/endpoints`);

  check(stats, { 'stats 200': (r) => r.status === 200 });
  check(deliveries, { 'deliveries 200': (r) => r.status === 200 });
  check(endpoints, {
    'endpoints 200': (r) => r.status === 200,
    'session seeded with demo endpoint': (r) => r.json('endpoints.0.name') === 'Demo receiver (echo)',
  });

  sleep(4); // cadencia real del polling del dashboard
}
