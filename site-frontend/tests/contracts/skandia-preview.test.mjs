import assert from 'node:assert/strict';
import test from 'node:test';
import { contributionTotals } from '../../src/lib/skandia-questionnaire.ts';
import { skandiaDestination } from '../../src/lib/skandia-navigation.ts';

test('Skandia sums contributions only and rejects unsafe arithmetic', () => {
  assert.deepEqual(contributionTotals({ contribution: '1500', frequency: 'Mensual', years: '10' }, 'ahorro'), { annual: 18000, total: 180000 });
  assert.deepEqual(contributionTotals({ contribution: '3000', frequency: 'Trimestral' }, 'retiro'), { annual: 12000, total: null });
  assert.deepEqual(contributionTotals({ contribution: '2500.50', frequency: 'Anual', years: '2' }, 'ahorro'), { annual: 2500.5, total: 5001 });
  for (const contribution of ['0', '-1', 'Infinity', 'not-a-number', '1e30']) {
    assert.equal(contributionTotals({ contribution, frequency: 'Mensual', years: '10' }, 'ahorro'), null);
  }
  assert.equal(contributionTotals({ contribution: '100', frequency: 'unknown', years: '10' }, 'ahorro'), null);
});

test('Skandia authentication preserves only the product and nonfinancial plan intent', () => {
  for (const candidate of ['/cliente/productos/skandia', '/cliente/productos/skandia?plan=ahorro', '/cliente/productos/skandia?plan=retiro']) assert.equal(skandiaDestination(candidate), candidate);
  for (const candidate of [null, 'https://example.com', '//example.com', '/cliente/productos/skandia?contribution=1000', '/cliente/productos/skandia?plan=ahorro&email=a@example.com', '/cliente/productos/skandia/../perfil']) assert.equal(skandiaDestination(candidate), null);
});
