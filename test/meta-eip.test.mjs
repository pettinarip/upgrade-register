import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { diffMembership, parseMetaEip } from '../scripts/lib/meta-eip.mjs';

const fixture = (name) => parseMetaEip(readFileSync(new URL(`fixtures/${name}.md`, import.meta.url), 'utf8'));
const stageOf = (listed, eip) => listed[eip] && `${listed[eip].stage}/${listed[eip].track}`;

test('Networking EIPs nested under CFI stay considered (7773 @ d05499b)', () => {
  const listed = fixture('eip-7773-d05499b0');
  assert.equal(stageOf(listed, 8189), 'considered/networking');
  assert.equal(stageOf(listed, 8070), 'considered/networking');
  assert.equal(stageOf(listed, 2780), 'considered/core');
});

test('a Networking heading beside CFI still belongs to CFI (7773 @ c79a376)', () => {
  assert.equal(stageOf(fixture('eip-7773-c79a3768'), 8136), 'considered/networking');
});

test('Other EIPs at bucket level is scheduled, with the track from its sub-heading (7773 @ 7b761e3)', () => {
  const listed = fixture('eip-7773-7b761e3d');
  assert.equal(stageOf(listed, 8070), 'scheduled/networking');
  assert.equal(stageOf(listed, 7904), 'scheduled/informational');
  assert.equal(stageOf(listed, 2780), 'scheduled/core');
});

test('dropping the PFI section removes 8163, it does not withdraw it (7773 @ e338bc9)', () => {
  const [change] = diffMembership({ 8163: { stage: 'proposed', track: 'core' } }, fixture('eip-7773-e338bc94')).filter((c) => c.eip === 8163);
  assert.deepEqual(change, { eip: 8163, stage: 'removed', track: 'core' });
});

test('Fusaka lists its 13 included EIPs, core and other alike', () => {
  const listed = fixture('eip-7607-3b1edfd6');
  const included = Object.keys(listed).filter((eip) => listed[eip].stage === 'included').map(Number).sort();
  assert.deepEqual(included, [7594, 7642, 7823, 7825, 7883, 7892, 7910, 7917, 7918, 7934, 7935, 7939, 7951]);
});

test('Hegotá after ACDE 246: DFIs from ACDC 187 and the CFIs from ACDE 246 are read', () => {
  const listed = fixture('eip-8081-95176db6');
  assert.equal(stageOf(listed, 8146), 'declined/core');
  assert.equal(stageOf(listed, 8243), 'declined/core');
  assert.equal(stageOf(listed, 8253), 'considered/core');
  assert.equal(stageOf(listed, 8272), 'considered/core');
  assert.equal(listed[8279].title, 'Block Access List Byte Floor');
});

test('diff emits only changes', () => {
  const before = { 1: { stage: 'proposed', track: 'core' }, 2: { stage: 'considered', track: 'core' } };
  const after = { 1: { stage: 'proposed', track: 'core' }, 2: { stage: 'scheduled', track: 'core' } };
  assert.deepEqual(diffMembership(before, after), [{ eip: 2, stage: 'scheduled', track: 'core' }]);
});
