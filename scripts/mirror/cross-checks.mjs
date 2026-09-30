// Snapshots the sources the register only checks against, never reads facts from:
// pm's <fork>-pm.md deployment tables and the execution-specs fork definitions.

import { fetchJson, fetchText, writeJson } from '../lib/io.mjs';
import { parseDeploymentTable } from '../lib/deployment-table.mjs';
import { FIRST_BUCKETED_META_EIP, loadUpgrades } from '../lib/registry.mjs';

const PM_RAW = 'https://raw.githubusercontent.com/ethereum/pm/master';

// Only the active forks' docs at the repo root carry a table; archived ones are free text.
async function pmDeployments(upgrade) {
  const path = `${upgrade.id}-pm.md`;
  const markdown = await fetchText(`${PM_RAW}/${path}`);
  if (!markdown) return null;
  return { url: `https://github.com/ethereum/pm/blob/master/${path}`, deployments: parseDeploymentTable(markdown) };
}

// Each fork module's docstring lists its EIPs under "### Changes".
export function parseForkChanges(source) {
  const changes = source.split(/^### Changes\s*$/m)[1]?.split(/^###\s/m)[0] ?? '';
  return [...new Set([...changes.matchAll(/EIP-(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

async function executionSpecsEips(upgrade, branch) {
  if (!upgrade.layers.execution) return null;
  const module = upgrade.layers.execution.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const path = `src/ethereum/forks/${module}/__init__.py`;
  const source = await fetchText(`https://raw.githubusercontent.com/ethereum/execution-specs/${branch}/${path}`);
  if (!source) return null;
  return { url: `https://github.com/ethereum/execution-specs/blob/${branch}/${path}`, eips: parseForkChanges(source) };
}

export async function mirrorCrossChecks() {
  const { default_branch: branch } = await fetchJson('https://api.github.com/repos/ethereum/execution-specs');
  const snapshot = { pmDeployments: {}, executionSpecs: {} };
  for (const upgrade of loadUpgrades().filter((u) => u.metaEips.some((n) => n >= FIRST_BUCKETED_META_EIP))) {
    const pm = await pmDeployments(upgrade);
    if (pm) snapshot.pmDeployments[upgrade.id] = pm;
    const specs = await executionSpecsEips(upgrade, branch);
    if (specs?.eips.length) snapshot.executionSpecs[upgrade.id] = specs;
  }
  writeJson('mirror/cross-checks.json', { source: 'ethereum/pm <fork>-pm.md tables, ethereum/execution-specs fork modules', ...snapshot });
  console.log(`cross-checks: pm tables for ${Object.keys(snapshot.pmDeployments).join(', ')}; execution-specs for ${Object.keys(snapshot.executionSpecs).join(', ')}`);
}
