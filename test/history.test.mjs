import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHistory, orderEvents } from '../scripts/lib/history.mjs';

const stage = (date, value, kind, ref) => ({ type: 'eip.stage', upgrade: 'hegota', eip: 1, stage: value, date, source: { kind, ref } });

test('the latest event wins', () => {
  const rows = buildHistory(orderEvents([stage('2026-09-17', 'declined', 'call', 'acdc/187'), stage('2026-08-01', 'proposed', 'meta-eip', 'aaa')]));
  assert.equal(rows.at(-1).stage, 'declined');
});

test('on the same day the Meta EIP applies after the call', () => {
  const rows = buildHistory(orderEvents([stage('2026-09-24', 'proposed', 'meta-eip', 'bbb'), stage('2026-09-24', 'considered', 'call', 'acde/246')]));
  assert.equal(rows.at(-1).stage, 'proposed');
});

test('a reaffirmation joins the row and keeps the earliest date', () => {
  const rows = buildHistory(orderEvents([
    stage('2026-08-13', 'proposed', 'call', 'acde/243'),
    stage('2026-08-25', 'proposed', 'meta-eip', 'ac450a4'),
    stage('2026-09-24', 'proposed', 'call', 'acde/246'),
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-08-13');
  assert.deepEqual(rows[0].sources.map((s) => s.ref), ['acde/243', 'ac450a4', 'acde/246']);
});

test('a fork row picks up the epoch a later config ships for the same date', () => {
  const fork = (date, kind, epoch) => ({ type: 'network.fork', upgrade: 'glamsterdam', network: 'sepolia', status: 'agreed', forkDate: '2026-10-06', epoch, date, source: { kind, ref: kind } });
  const rows = buildHistory(orderEvents([fork('2026-09-03', 'call'), fork('2026-09-24', 'config', 353024)]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].epoch, 353024);
});
