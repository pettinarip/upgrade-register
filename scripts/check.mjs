// Smallest check that fails if the compile logic breaks. Runs after build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const g = JSON.parse(readFileSync('dist/upgrades/glamsterdam.json', 'utf8'));
const e7610 = g.eips.find((e) => e.eip === 7610);
assert.equal(e7610.stage, 'declined', 'latest stage wins');
assert.equal(e7610.history.at(-1).date, '2026-08-20', 'declined on the Meta EIP merge date');
assert.ok(e7610.history[0].sources[0].url.includes('github.com/ethereum/EIPs'), 'every row points at a commit or PR');
assert.equal(g.status, 'development', 'cuts exist, no testnet slot recorded yet');
assert.ok(g.devnets.some((d) => d.id === 'glamsterdam-devnet-8' && d.genesis === '2026-08-13'), 'cuts attach by repository and carry genesis');
assert.ok(g.devnets.some((d) => d.specs.consensus?.tag && d.clients > 0), 'a cut sheet carries spec releases and client builds');
assert.ok(g.featureDevnets.some((d) => d.group === 'bal'), 'feature devnets attach through shared EIPs');
const f = JSON.parse(readFileSync('dist/upgrades/fusaka.json', 'utf8'));
assert.equal(f.status, 'live');
assert.equal(f.mainnet.fork.epoch, 411392);
assert.equal(f.testnets.find((t) => t.id === 'hoodi').fork.date, '2025-10-28');
// An activation must outrank an estimate recorded later; ordering is by when we learned it.
assert.equal(f.mainnet.fork.status, 'activated', 'activated is terminal');

const eip = JSON.parse(readFileSync('dist/eips/7805.json', 'utf8'));
assert.deepEqual(eip.upgrades.map((u) => [u.upgrade, u.stage]), [['fusaka', 'declined'], ['glamsterdam', 'declined'], ['hegota', 'scheduled']]);
// Consumers pin on this; it must be stamped on every compiled file.
for (const f of ['index.json', 'resolve.json', 'upgrades/glamsterdam.json', 'eips/7805.json'])
  assert.equal(JSON.parse(readFileSync(`dist/${f}`, 'utf8')).schemaVersion, 1, `${f} is missing schemaVersion`);

console.log('checks ok');
