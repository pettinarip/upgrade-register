import { fetchJson, fetchText, isoDate, readJson, writeJson } from '../lib/io.mjs';

const CARTOGRAPHOOR = 'https://ethpandaops-platform-production-cartographoor.ams3.digitaloceanspaces.com/networks.json';

// Genesis never changes once a devnet exists, so it is read from the network config only once.
async function readGenesis(network) {
  const branch = network.url?.match(/\/tree\/([^/]+)\//)?.[1] ?? 'master';
  const configPath = `${network.repository}/${branch}/${network.path}/metadata/config.yaml`;
  const yaml = await fetchText(`https://raw.githubusercontent.com/${configPath}`);
  const minGenesis = yaml?.match(/^MIN_GENESIS_TIME:\s*(\d+)/m)?.[1];
  if (!minGenesis) return { genesis: null, configUrl: null };
  const delay = yaml.match(/^GENESIS_DELAY:\s*(\d+)/m)?.[1] ?? '0';
  return {
    genesis: isoDate(Number(minGenesis) + Number(delay)),
    configUrl: `https://github.com/${network.repository}/blob/${branch}/${network.path}/metadata/config.yaml`,
  };
}

export async function mirrorDevnets() {
  const known = Object.fromEntries(readJson('mirror/devnets.json', { devnets: [] }).devnets.map((d) => [d.id, d]));
  const { networks } = await fetchJson(CARTOGRAPHOOR);
  const devnets = [];

  for (const [id, network] of Object.entries(networks)) {
    const group = network.repository?.match(/^ethpandaops\/([a-z0-9-]+?)-devnets$/)?.[1];
    if (!group) continue;
    const previous = known[id];
    const { genesis, configUrl } = previous?.genesis ? previous : await readGenesis(network);
    devnets.push({
      id,
      group,
      active: network.status === 'active',
      genesis,
      configUrl,
      specUrl: `https://notes.ethereum.org/@ethpandaops/${id}`,
    });
    delete known[id];
  }
  // A devnet that left cartographoor was shut down; keep it as history.
  for (const gone of Object.values(known)) devnets.push({ ...gone, active: false });

  devnets.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('mirror/devnets.json', { source: CARTOGRAPHOOR, devnets });
  console.log(`devnets: ${devnets.length}`);
}
