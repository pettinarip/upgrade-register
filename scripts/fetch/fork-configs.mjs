import { loadUpgrades, readJson, writeJson, isoDate, text, gh } from '../lib.mjs';

const upgrades = loadUpgrades();
const byConsensus = Object.fromEntries(upgrades.filter((u) => u.layers.consensus).map((u) => [u.layers.consensus.toUpperCase(), u.id]));
const allForks = readJson('all-forks.json');
const carto = Object.keys((await (await fetch('https://ethpandaops-platform-production-cartographoor.ams3.digitaloceanspaces.com/networks.json')).json()).networks);
const UNSET = 18446744073709551615n;
const yamlNum = (y, k) => { const v = y.match(new RegExp(`^${k}:\\s*(\\d+)`, 'm'))?.[1]; return v == null ? null : BigInt(v); };
const forkEpochs = (y) => [...y.matchAll(/^([A-Z0-9_]+)_FORK_EPOCH:\s*(\d+)/gm)].filter(([, k]) => k !== 'GENESIS').map(([, k, v]) => [k, BigInt(v)]).filter(([, v]) => v !== UNSET);
const nowSec = Math.floor(Date.now() / 1000);

const networks = [], configs = {}, events = {};
const activated = (upgrade, network, at, extra) => ({ type: 'network.fork', upgrade, network, status: 'activated', date: isoDate(at), ...extra, confidence: 'high' });

for (const repo of (await gh('https://api.github.com/orgs/eth-clients/repos?per_page=100')).json.map((r) => r.name)) {
  const y = await text(`https://raw.githubusercontent.com/eth-clients/${repo}/main/metadata/config.yaml`);
  const chainId = y && yamlNum(y, 'DEPOSIT_CHAIN_ID');
  if (chainId == null) continue;
  const id = repo, url = `https://github.com/eth-clients/${repo}/blob/main/metadata/config.yaml`;
  const genesis = Number((yamlNum(y, 'MIN_GENESIS_TIME') ?? 0n) + (yamlNum(y, 'GENESIS_DELAY') ?? 0n));
  const slot = Number(yamlNum(y, 'SECONDS_PER_SLOT') ?? 12n), perEpoch = Number(yamlNum(y, 'SLOTS_PER_EPOCH') ?? 32n);
  networks.push({ id, name: id.replace(/^./, (c) => c.toUpperCase()), kind: id === 'mainnet' ? 'mainnet' : 'testnet', chainId: Number(chainId), genesisTime: id === 'mainnet' ? allForks.beacon_genesis_time : genesis, deprecated: !carto.includes(id), links: { config: url } });
  configs[id] = { url, forks: {} };
  for (const [fork, epoch] of forkEpochs(y)) {
    const upgrade = byConsensus[fork];
    if (!upgrade) continue;
    const at = (id === 'mainnet' ? allForks.beacon_genesis_time : genesis) + Number(epoch) * perEpoch * slot;
    configs[id].forks[upgrade] = { epoch: Number(epoch), date: isoDate(at), activated: at <= nowSec };
    if (id !== 'mainnet' && at <= nowSec) (events[id] ??= []).push(activated(upgrade, id, at, { epoch: Number(epoch) }));
  }
}
// Mainnet activations come from pm, which also has the EL-only forks the CL config does not know.
for (const u of upgrades) {
  const a = u.activation ?? {};
  const at = a.timestamp ?? (a.epoch != null ? allForks.beacon_genesis_time + a.epoch * allForks.slots_per_epoch * allForks.seconds_per_slot : null);
  if (at == null || at > nowSec) continue;
  (events.mainnet ??= []).push(activated(u.id, 'mainnet', at, { ...(a.epoch != null && { epoch: a.epoch }), ...(a.block != null && { block: a.block }) }));
}
const my = await text('https://raw.githubusercontent.com/ethereum/consensus-specs/master/configs/mainnet.yaml');
for (const [fork, epoch] of forkEpochs(my ?? '')) {
  const upgrade = byConsensus[fork];
  if (upgrade) (configs.mainnet ??= { url: 'https://github.com/ethereum/consensus-specs/blob/master/configs/mainnet.yaml', forks: {} }).forks[upgrade] ??= { epoch: Number(epoch), date: isoDate(allForks.beacon_genesis_time + Number(epoch) * 384), activated: false, source: 'consensus-specs' };
}

networks.sort((a, b) => (a.kind === 'mainnet' ? -1 : b.kind === 'mainnet' ? 1 : a.id.localeCompare(b.id)));
writeJson('upgrades/mirror/networks.json', { source: 'eth-clients configs + pm all-forks.json + cartographoor', networks });
writeJson('upgrades/mirror/fork-configs.json', { source: 'eth-clients configs + consensus-specs mainnet.yaml', note: 'what client configs ship; the build checks recorded slots against this', configs });
for (const [id, evs] of Object.entries(events)) {
  const source = id === 'mainnet' ? { kind: 'config', ref: 'ethereum/pm all-forks.json', url: 'https://github.com/ethereum/pm/blob/master/all-forks.json' } : { kind: 'config', ref: `eth-clients/${id}`, url: configs[id].url };
  writeJson(`upgrades/events/config-${id}.json`, { source, recordedBy: 'bot', events: evs.sort((a, b) => a.date.localeCompare(b.date)) });
}
console.log(`networks: ${networks.map((n) => n.id).join(', ')}; activations: ${Object.values(events).flat().length}; future slots in configs: ${Object.values(configs).flatMap((c) => Object.values(c.forks)).filter((f) => !f.activated).length}`);
