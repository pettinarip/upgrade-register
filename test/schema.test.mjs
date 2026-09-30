import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VOCABULARY } from '../scripts/lib/events.mjs';
import { enumOf, eventProblems } from '../scripts/lib/schema.mjs';

const call = { kind: 'call', ref: 'acde/246', url: null, quote: 'Moving this one to CFI.', timestamp: '1:20:35' };
const stage = (fields) => ({ type: 'eip.stage', upgrade: 'hegota', eip: 8272, stage: 'considered', date: '2026-09-24', source: call, ...fields });

test('every vocabulary meaning matches the values the schema allows', () => {
  const schemaValues = {
    'eip.stage': enumOf('eipStage', 'stage'),
    'network.fork': enumOf('networkFork', 'status'),
    'upgrade.headliner': enumOf('headliner', 'action'),
    'upgrade.deadline': enumOf('deadline', 'stage'),
  };
  for (const [type, values] of Object.entries(schemaValues)) assert.deepEqual(Object.keys(VOCABULARY[type]), values, type);
});

test('the seed file is valid', () => {
  const { events } = JSON.parse(readFileSync(new URL('../events/calls/seed.json', import.meta.url), 'utf8'));
  for (const event of events) assert.deepEqual(eventProblems(event), [], JSON.stringify(event));
});

test('a call event is valid with a quote and timestamp', () => {
  assert.deepEqual(eventProblems(stage()), []);
});

test('a call event without a quote is rejected', () => {
  const { quote, ...noQuote } = call;
  assert.equal(quote.length > 0, true);
  assert.notDeepEqual(eventProblems(stage({ source: noQuote })), []);
});

test('a call cannot record inclusion; the Meta EIP can', () => {
  assert.notDeepEqual(eventProblems(stage({ stage: 'included' })), []);
  assert.deepEqual(eventProblems(stage({ stage: 'included', source: { kind: 'meta-eip', ref: 'abc1234' } })), []);
});

test('unknown fields and imprecise dates are rejected', () => {
  assert.notDeepEqual(eventProblems(stage({ confidence: 'high' })), []);
  assert.notDeepEqual(eventProblems({ type: 'network.fork', upgrade: 'glamsterdam', network: 'hoodi', status: 'proposed', forkDate: 'late October', date: '2026-09-17', source: call }), []);
});
