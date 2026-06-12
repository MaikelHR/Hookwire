/* Tests puros de firma y verificación: sin red, sin DB, sin mocks.
   Cubren el contrato criptográfico que el echo receiver aplica:
   firma válida pasa, y cualquier alteración (secreto, body, timestamp,
   header) produce verified=false. */
import { describe, expect, it } from 'vitest';
import { SIGNATURE_TOLERANCE_S, signPayload, verifySignature } from './signature';

const SECRET = 'whsec_test_0123456789abcdef';
const BODY = '{"id":"evt_1","type":"user.created","data":{"plan":"pro"}}';
const NOW = 1_780_000_000;

describe('signPayload', () => {
  it('produce el formato t=<unix>,v1=<hex64>', () => {
    const header = signPayload(SECRET, BODY, NOW);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(header.startsWith(`t=${NOW},`)).toBe(true);
  });

  it('es determinística: mismo secreto, body y timestamp dan la misma firma', () => {
    expect(signPayload(SECRET, BODY, NOW)).toBe(signPayload(SECRET, BODY, NOW));
  });
});

describe('verifySignature', () => {
  it('acepta una firma legítima sobre los mismos bytes', () => {
    const header = signPayload(SECRET, BODY, NOW);
    expect(verifySignature(SECRET, BODY, header, NOW)).toBe(true);
    /* El receptor verifica sobre el Buffer crudo del wire. */
    expect(verifySignature(SECRET, Buffer.from(BODY, 'utf8'), header, NOW)).toBe(true);
  });

  it('rechaza la firma hecha con otro secreto (secreto del endpoint alterado)', () => {
    const header = signPayload('whsec_otro_secreto', BODY, NOW);
    expect(verifySignature(SECRET, BODY, header, NOW)).toBe(false);
  });

  it('rechaza un body manipulado aunque la firma sea legítima', () => {
    const header = signPayload(SECRET, BODY, NOW);
    const tampered = BODY.replace('"pro"', '"enterprise"');
    expect(verifySignature(SECRET, tampered, header, NOW)).toBe(false);
  });

  it('rechaza bytes distintos a los firmados aunque el JSON sea equivalente', () => {
    /* La lección del body crudo: mismo objeto, distinta serialización. */
    const header = signPayload(SECRET, '{"a":1,"b":2}', NOW);
    expect(verifySignature(SECRET, '{"b":2,"a":1}', header, NOW)).toBe(false);
    expect(verifySignature(SECRET, '{ "a": 1, "b": 2 }', header, NOW)).toBe(false);
  });

  it('rechaza un timestamp fuera de la tolerancia (anti-replay)', () => {
    const header = signPayload(SECRET, BODY, NOW);
    const justInside = NOW + SIGNATURE_TOLERANCE_S;
    const justOutside = NOW + SIGNATURE_TOLERANCE_S + 1;
    expect(verifySignature(SECRET, BODY, header, justInside)).toBe(true);
    expect(verifySignature(SECRET, BODY, header, justOutside)).toBe(false);
    /* También hacia el futuro: un t adelantado tampoco cuela. */
    expect(verifySignature(SECRET, BODY, header, NOW - SIGNATURE_TOLERANCE_S - 1)).toBe(false);
  });

  it('rechaza re-firmar con un t fresco sin el secreto (t es parte de lo firmado)', () => {
    const captured = signPayload(SECRET, BODY, NOW - 3600);
    const v1 = captured.split(',v1=')[1] ?? '';
    /* El atacante reutiliza el v1 capturado pero actualiza t para pasar
       la ventana: el MAC ya no corresponde y la verificación falla. */
    expect(verifySignature(SECRET, BODY, `t=${NOW},v1=${v1}`, NOW)).toBe(false);
  });

  it('rechaza headers malformados sin lanzar', () => {
    for (const bad of ['', 'v1=abc', 't=123', `t=${NOW},v1=zzzz`, `t=${NOW},v1=abc123`, 'garbage']) {
      expect(verifySignature(SECRET, BODY, bad, NOW)).toBe(false);
    }
  });
});
