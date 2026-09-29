import { readJson } from './io.mjs';

// Networks whose client configs the mirror reads. Mainnet's CL config lives in consensus-specs.
export const NETWORKS = {
  mainnet: { name: 'Mainnet', repo: 'ethereum/consensus-specs', branch: 'master', path: 'configs/mainnet.yaml' },
  sepolia: { name: 'Sepolia', repo: 'eth-clients/sepolia', branch: 'main', path: 'metadata/config.yaml' },
  hoodi: { name: 'Hoodi', repo: 'eth-clients/hoodi', branch: 'main', path: 'metadata/config.yaml' },
  holesky: { name: 'Holešky', repo: 'eth-clients/holesky', branch: 'main', path: 'metadata/config.yaml' },
};

// The first Hardfork Meta EIP written with PFI/CFI/SFI/DFI buckets.
export const FIRST_BUCKETED_META_EIP = 7569;

export const slugify = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// all-forks lists one entry per layer fork. Entries sharing a combined name (The Merge is
// Bellatrix + Paris) are one upgrade with one activation per layer.
export function loadUpgrades() {
  const { forks } = readJson('mirror/all-forks.json');
  const byId = new Map();
  for (const fork of forks) {
    const name = fork.combined_name ?? fork.name.execution ?? fork.name.consensus;
    const id = slugify(name);
    const upgrade = byId.get(id) ?? { id, name, type: fork.type, layers: { execution: null, consensus: null }, metaEips: [], activations: [] };
    upgrade.layers.execution ??= fork.name.execution;
    upgrade.layers.consensus ??= fork.name.consensus;
    upgrade.metaEips = [...new Set([...upgrade.metaEips, ...(fork.meta_eips ?? [])])];
    upgrade.activations.push(fork.activation ?? {});
    byId.set(id, upgrade);
  }
  return [...byId.values()];
}

export const loadAliases = () => readJson('aliases.json');
