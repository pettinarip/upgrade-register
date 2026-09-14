// One cut sheet per devnet: existence and liveness from cartographoor, genesis from the Pandaops
// network config, spec releases, client builds and the EIP list from the HackMD spec page.
import { readdirSync } from 'node:fs';
import { loadUpgrades, readJson, writeJson, text } from '../lib.mjs';

const upgrades = loadUpgrades();
const { networks, networkMetadata } = await (await fetch('https://ethpandaops-platform-production-cartographoor.ams3.digitaloceanspaces.com/networks.json')).json();
const existing = Object.fromEntries(readdirSync('upgrades/cuts').filter((f) => f.endsWith('.json')).map((f) => { const c = readJson(`upgrades/cuts/${f}`); return [c.id, c]; }));

const specRef = (md, repo) => {
  const m = md.match(new RegExp(`\\[([^\\]]+)\\]\\((https://github\\.com/ethereum/${repo}/releases/tag/[^)]+)\\)(?:[^\\n]{0,40}?\`([0-9a-f]{7,12})\`)?`));
  return m ? { tag: m[1].replace(/`/g, ''), url: m[2], commit: m[3] ?? null } : null;
};
const clientRows = (md) => [...md.matchAll(/^\|\s*([A-Za-z][A-Za-z0-9 -]*?)\s*\|\s*`([^`|]+)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm)]
  .filter(([, name]) => !/^(client|name|el|cl)$/i.test(name.trim()))
  .map(([, name, image, spec, status]) => ({ name: name.trim(), image: image.trim(), spec: spec.replace(/\*\*/g, '').trim() || null, status: status.trim() || null }));

let n = 0;
for (const [id, net] of Object.entries(networks)) {
  const group = net.repository?.match(/^ethpandaops\/([a-z0-9-]+?)-devnets$/)?.[1];
  if (!group) continue;
  const prev = existing[id];
  const cut = { id, group, upgrade: upgrades.find((u) => u.id === group)?.id ?? null, active: net.status === 'active',
    genesis: prev?.genesis ?? null, configUrl: prev?.configUrl ?? null, specUrl: `https://notes.ethereum.org/@ethpandaops/${id}`,
    eips: prev?.eips ?? [], specs: prev?.specs ?? { consensus: null, execution: null }, clients: prev?.clients ?? [] };
  if (!cut.genesis) {
    const branch = net.url?.match(/\/tree\/([^/]+)\//)?.[1] ?? 'master';
    const configUrl = `https://raw.githubusercontent.com/${net.repository}/${branch}/${net.path}/metadata/config.yaml`;
    const cfg = await text(configUrl);
    const min = cfg?.match(/^MIN_GENESIS_TIME:\s*(\d+)/m)?.[1], delay = cfg?.match(/^GENESIS_DELAY:\s*(\d+)/m)?.[1] ?? '0';
    if (min) { cut.genesis = new Date((Number(min) + Number(delay)) * 1000).toISOString().slice(0, 10); cut.configUrl = `https://github.com/${net.repository}/blob/${branch}/${net.path}/metadata/config.yaml`; }
  }
  if (cut.active || !cut.eips.length || !cut.specs.consensus) {
    const md = await text(`${cut.specUrl}/download`);
    if (md) {
      const section = md.split(/^##\s+.*EIP.*$/im)[1]?.split(/^##\s/m)[0] ?? md;
      const eips = [...new Set([...section.matchAll(/\[EIP-(\d+)\]/g)].map((m) => Number(m[1])))];
      if (eips.length) cut.eips = eips;
      cut.specs = { consensus: specRef(md, 'consensus-specs') ?? cut.specs.consensus, execution: specRef(md, 'execution-specs') ?? cut.specs.execution };
      const rows = clientRows(md); if (rows.length) cut.clients = rows;
    }
  }
  delete cut.groupName;
  writeJson(`upgrades/cuts/${id}.json`, cut); n++;
}
for (const c of Object.values(existing)) if (!(c.id in networks)) writeJson(`upgrades/cuts/${c.id}.json`, { ...c, active: false });
console.log(`cuts: ${n} from cartographoor (${Object.keys(networkMetadata ?? {}).length} groups)`);
