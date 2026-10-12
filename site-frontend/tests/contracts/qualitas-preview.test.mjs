import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoWizard } from '../../src/lib/demo-product-wizard.ts';
import { qualitasSteps, validateQualitas } from '../../src/lib/qualitas-questionnaire.ts';
import { productDestination } from '../../src/lib/product-navigation.ts';

const sample = { brand: 'Toyota', model: 'Corolla', year: '2023', postalCode: '01010', use: 'Particular', driver: 'Yo', ageGroup: '25 a 39 años', coverage: 'Amplia', priority: 'Proteger mi auto', urgency: 'Solo estoy explorando', insurer: 'Otra aseguradora', currentCoverage: 'Limitada', expiry: '2026-12-31', change: 'Coberturas', consent: 'on' };

for (const journey of ['cotizar', 'mejorar']) {
  test(`${journey}: complete synthetic journey reaches review then simulation, back and restart work`, () => {
    const state = createDemoWizard(qualitasSteps[journey].length);
    let now = 0;
    for (let step = 0; step < qualitasSteps[journey].length; step++) {
      assert.equal(state.step, step);
      assert.equal(validateQualitas(sample, journey, step, 2026), null);
      assert.equal(state.advance(true, now += 500), true);
      assert.equal(state.advance(true, now + 50), false, 'repeat must not skip the next step');
    }
    assert.equal(state.complete, false, 'review is not confirmation');
    state.back(); assert.equal(state.step, 4);
    state.advance(true, now += 500); assert.equal(state.complete, false);
    state.advance(true, now += 500); assert.equal(state.complete, true);
    assert.equal(state.advance(true, now + 500), false);
    state.back(); assert.equal(state.step, 5);
    state.reset(); assert.equal(state.step, 0); assert.equal(state.complete, false);
    assert.equal(state.advance(false, now), false); assert.equal(state.step, 0);
  });
}

test('vehicle rejects incomplete input, malformed CP, future years and excessive text; leading zeros survive', () => {
  for (const name of ['brand', 'model', 'year', 'postalCode', 'use']) assert.equal(validateQualitas({ ...sample, [name]: '' }, 'cotizar', 0, 2026)?.field, name);
  assert.equal(validateQualitas(sample, 'cotizar', 0, 2026), null);
  for (const year of ['-123', '202', 'abcd', '9999', '2023.5', '0000']) assert.equal(validateQualitas({ ...sample, year }, 'cotizar', 0, 2026)?.field, 'year');
  for (const postalCode of ['1010', 'ABCDE', '010101', '-1010']) assert.equal(validateQualitas({ ...sample, postalCode }, 'cotizar', 0, 2026)?.field, 'postalCode');
  assert.equal(validateQualitas({ ...sample, brand: 'A'.repeat(41) }, 'cotizar', 0, 2026)?.field, 'brand');
  assert.equal(validateQualitas({ ...sample, use: 'Invented option' }, 'cotizar', 0, 2026)?.field, 'use');
});

test('policy expiry must be a calendar date; an already expired or other-insurer policy is allowed', () => {
  for (const expiry of ['', '2026-02-30', '2026-13-01', 'not-a-date']) assert.equal(validateQualitas({ ...sample, expiry }, 'mejorar', 2, 2026)?.field, 'expiry');
  assert.equal(validateQualitas({ ...sample, expiry: '2024-02-29' }, 'mejorar', 2, 2026), null);
  assert.equal(validateQualitas({ ...sample, expiry: '2023-02-29' }, 'mejorar', 2, 2026)?.field, 'expiry');
});

test('demo consent is explicit and cannot be inferred from a complete profile', () => {
  for (const journey of ['cotizar', 'mejorar']) {
    assert.equal(validateQualitas({ ...sample, consent: '' }, journey, 4, 2026)?.field, 'consent');
    assert.equal(validateQualitas(sample, journey, 4, 2026), null);
  }
});

test('authentication keeps both products and only their allowed journey choices', () => {
  for (const path of ['/cliente/productos/skandia', '/cliente/productos/qualitas', '/cliente/productos/skandia?plan=ahorro', '/cliente/productos/skandia?plan=retiro', '/cliente/productos/qualitas?plan=cotizar', '/cliente/productos/qualitas?plan=mejorar']) assert.equal(productDestination(path), path);
  for (const path of ['https://example.com', '//example.com', '/cliente/productos/qualitas?plan=ahorro', '/cliente/productos/qualitas?plan=mejorar&postalCode=01010', '/cliente/productos/skandia?plan=retiro&income=100', '/cliente/productos/qualitas#details', null]) assert.equal(productDestination(path), null);
});
