// Fork epochs from client configs, and mainnet activations from all-forks, as network.fork events.
// A config that ships an epoch for a fork that has not happened yet counts as agreed.

import { fetchJson, fetchText, isoDate, readJson, writeJson } from '../lib/io.mjs';
import { NETWORKS, loadUpgrades } from '../lib/registry.mjs';

const FAR_FUTURE_EPOCH = '18446744073709551615';
const SLOTS_PER_EPOCH = 32;
const ALL_FORKS_URL = 'https://github.com/ethereum/pm/blob/master/all-forks.json';

const yamlValue = (yaml, key) => yaml.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'))?.[1] ?? null;

function scheduledForkEpochs(yaml) {
  return [...yaml.matchAll(/^([A-Z0-9]+)_FORK_EPOCH:\s*(\d+)/gm)]
    .filter(([, , epoch]) => epoch !== FAR_FUTURE_EPOCH)
    .map(([, fork, epoch]) => ({ fork, epoch: Number(epoch) }));
}

async function lastChanged(repo, path) {
  const [commit] = (await fetchJson(`https://api.github.com/repos/${repo}/commits?path=${path}&per_page=1`)) ?? [];
  return commit?.commit.committer.date.slice(0, 10) ?? null;
}

const sameFork = (a, b) => a.status === b.status && a.epoch === b.epoch && a.forkDate === b.forkDate;

// Emit only on change. An activation is terminal, so one already on record is never repeated
// (The Merge has two, one per layer).
function appendIfChanged(events, event) {
  const mine = events.filter((e) => e.upgrade === event.upgrade);
  const latest = mine.at(-1);
  if (latest && sameFork(latest, event)) return false;
  if (event.status === 'activated' && mine.some((e) => sameFork(e, event))) return false;
  events.push(event);
  return true;
}

async function readNetworkConfig(id, network, genesisOverride) {
  const yaml = await fetchText(`https://raw.githubusercontent.com/${network.repo}/${network.branch}/${network.path}`);
  if (!yaml) throw new Error(`no config for ${id}`);
  const genesis = genesisOverride ?? Number(yamlValue(yaml, 'MIN_GENESIS_TIME')) + Number(yamlValue(yaml, 'GENESIS_DELAY') ?? 0);
  const secondsPerSlot = Number(yamlValue(yaml, 'SECONDS_PER_SLOT') ?? 12);
  const forks = scheduledForkEpochs(yaml).map(({ fork, epoch }) => ({ fork, epoch, at: genesis + epoch * SLOTS_PER_EPOCH * secondsPerSlot }));
  return { url: `https://github.com/${network.repo}/blob/${network.branch}/${network.path}`, genesis, forks };
}

export async function mirrorConfigs() {
  const upgrades = loadUpgrades();
  const allForks = readJson('mirror/all-forks.json');
  const byConsensusName = Object.fromEntries(upgrades.filter((u) => u.layers.consensus).map((u) => [u.layers.consensus.toUpperCase(), u.id]));
  const now = Date.now() / 1000;
  const snapshot = {};
  let added = 0;

  for (const [id, network] of Object.entries(NETWORKS)) {
    const config = await readNetworkConfig(id, network, id === 'mainnet' ? allForks.beacon_genesis_time : undefined);
    const file = `events/config/${id}.json`;
    const { events } = readJson(file, { events: [] });
    const configChanged = await lastChanged(network.repo, network.path);
    snapshot[id] = { url: config.url, genesisTime: config.genesis, forks: {} };

    for (const { fork, epoch, at } of config.forks) {
      const upgrade = byConsensusName[fork];
      if (!upgrade) continue;
      const activated = at <= now;
      snapshot[id].forks[upgrade] = { epoch, forkDate: isoDate(at), activated };
      // Mainnet activations come from all-forks below, which also covers EL-only forks.
      if (id === 'mainnet' && activated) continue;
      const source = { kind: 'config', ref: `${network.repo}/${network.path}`, url: config.url };
      added += appendIfChanged(events, {
        type: 'network.fork',
        upgrade,
        network: id,
        status: activated ? 'activated' : 'agreed',
        forkDate: isoDate(at),
        epoch,
        date: activated ? isoDate(at) : configChanged,
        source,
      });
    }

    if (id === 'mainnet') {
      for (const upgrade of upgrades) {
        for (const { timestamp, epoch, block } of upgrade.activations) {
          if (timestamp == null) continue;
          const activated = timestamp <= now;
          added += appendIfChanged(events, {
            type: 'network.fork',
            upgrade: upgrade.id,
            network: 'mainnet',
            status: activated ? 'activated' : 'agreed',
            forkDate: isoDate(timestamp),
            ...(epoch != null && { epoch }),
            ...(block != null && { block }),
            date: activated ? isoDate(timestamp) : await lastChanged('ethereum/pm', 'all-forks.json'),
            source: { kind: 'config', ref: 'ethereum/pm/all-forks.json', url: ALL_FORKS_URL },
          });
        }
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    writeJson(file, { events });
  }

  writeJson('mirror/configs.json', { source: 'eth-clients configs, consensus-specs mainnet.yaml', configs: snapshot });
  console.log(`configs: ${Object.keys(snapshot).join(', ')}; ${added} new fork events`);
}
