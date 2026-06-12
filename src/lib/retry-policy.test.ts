import { describe, expect, it } from 'vitest';
import { BACKOFF_SCHEDULE_S, MAX_ATTEMPTS, isSuccess, resolveAttemptOutcome } from './retry-policy';

describe('backoff schedule', () => {
  it('es el aprobado en el handoff: 10s, 30s, 90s, 5m, 5m', () => {
    expect([...BACKOFF_SCHEDULE_S]).toEqual([10, 30, 90, 300, 300]);
  });

  it('permite 6 intentos en total: el inicial mas los 5 del schedule', () => {
    expect(MAX_ATTEMPTS).toBe(6);
    expect(MAX_ATTEMPTS).toBe(BACKOFF_SCHEDULE_S.length + 1);
  });
});

describe('isSuccess', () => {
  it('solo 2xx cuenta como entregado', () => {
    expect(isSuccess(200)).toBe(true);
    expect(isSuccess(204)).toBe(true);
    expect(isSuccess(299)).toBe(true);
    expect(isSuccess(199)).toBe(false);
    expect(isSuccess(300)).toBe(false);
    expect(isSuccess(404)).toBe(false);
    expect(isSuccess(500)).toBe(false);
  });

  it('sin respuesta (timeout o error de red) no es exito', () => {
    expect(isSuccess(null)).toBe(false);
  });
});

describe('resolveAttemptOutcome', () => {
  it('un 2xx queda delivered en cualquier intento', () => {
    expect(resolveAttemptOutcome(200, 1)).toEqual({ status: 'delivered' });
    expect(resolveAttemptOutcome(204, MAX_ATTEMPTS)).toEqual({ status: 'delivered' });
  });

  it('cada fallo programa el reintento con el delay del schedule', () => {
    expect(resolveAttemptOutcome(500, 1)).toEqual({ status: 'retrying', retryDelayS: 10 });
    expect(resolveAttemptOutcome(503, 2)).toEqual({ status: 'retrying', retryDelayS: 30 });
    expect(resolveAttemptOutcome(404, 3)).toEqual({ status: 'retrying', retryDelayS: 90 });
    expect(resolveAttemptOutcome(null, 4)).toEqual({ status: 'retrying', retryDelayS: 300 });
    expect(resolveAttemptOutcome(500, 5)).toEqual({ status: 'retrying', retryDelayS: 300 });
  });

  it('el fallo del quinto intento aun programa retry; el del sexto pasa a dead letter', () => {
    expect(resolveAttemptOutcome(500, MAX_ATTEMPTS - 1)).toEqual({ status: 'retrying', retryDelayS: 300 });
    expect(resolveAttemptOutcome(500, MAX_ATTEMPTS)).toEqual({ status: 'dead_lettered' });
  });

  it('un timeout en el ultimo intento tambien pasa a dead letter', () => {
    expect(resolveAttemptOutcome(null, MAX_ATTEMPTS)).toEqual({ status: 'dead_lettered' });
  });

  it('los intentos posteriores al dead letter (replay manual) que fallan vuelven a dead letter', () => {
    expect(resolveAttemptOutcome(500, MAX_ATTEMPTS + 1)).toEqual({ status: 'dead_lettered' });
    expect(resolveAttemptOutcome(500, MAX_ATTEMPTS + 5)).toEqual({ status: 'dead_lettered' });
  });

  it('un replay que llega a un endpoint recuperado entrega aunque ya hubiera agotado la cola', () => {
    expect(resolveAttemptOutcome(200, MAX_ATTEMPTS + 1)).toEqual({ status: 'delivered' });
  });
});
