import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/lib/rewards-member.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { memberNumber, giftCardReadiness } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('member number groups an existing canonical ID without mutation', () => {
  assert.deepEqual(memberNumber('123456789'), { canonical: '123456789', display: '123 456 789' });
  for (const value of [null, undefined, '', 'RWD-legacy', '012345678', '123 456 789', '123456789 ', 123456789, '１２３４５６７８９']) assert.equal(memberNumber(value), null);
});
test('level explanation fails closed for unavailable, restricted and missing identity', () => {
  for (const level of ['GOLD', 'PLATINUM', 'TITANIUM']) {
    assert.equal(giftCardReadiness('ACTIVE', level, '123456789'), 'level_met');
    assert.equal(giftCardReadiness('ACTIVE', level, ''), 'identity_pending');
    for (const state of ['BLOCKED','INACTIVE']) assert.equal(giftCardReadiness(state, level, '123456789'), 'restricted');
  }
  for (const level of ['BRONZE','SILVER']) assert.equal(giftCardReadiness('ACTIVE', level, '123456789'), 'below_level');
  assert.equal(giftCardReadiness('INVITED', null, '123456789'), 'below_level');
  for (const [state,level] of [[null,null],['ACTIVE',null],['ACTIVE','DIAMOND'],['unexpected','GOLD']]) assert.equal(giftCardReadiness(state,level,'123456789'), 'unavailable');
});
