// Reads the "network | epoch | timestamp" tables that Meta EIPs and pm's <fork>-pm.md files use
// to announce activations. Used only for cross-checks.

import { NETWORKS } from './registry.mjs';

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.replace(/`/g, '').trim());

const isDivider = (line) => /^\|?[\s:|-]+\|?$/.test(line.trim());

const number = (cell) => (/^\d+/.test(cell ?? '') ? Number(cell.match(/^\d+/)[0]) : null);

const networkId = (name) => {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return Object.entries(NETWORKS).find(([id, n]) => id === plain || n.name.toLowerCase() === name.toLowerCase())?.[0] ?? null;
};

// The first table after a heading matching `heading` (or the first table at all).
// Returns { [network]: { epoch, timestamp } } for rows that name a known network.
export function parseDeploymentTable(markdown, heading = null) {
  const lines = markdown.split('\n');
  let start = 0;
  if (heading) {
    start = lines.findIndex((line) => /^#{2,6}\s/.test(line) && heading.test(line));
    if (start === -1) return {};
  }
  const tableStart = lines.findIndex((line, i) => i > start && line.trim().startsWith('|'));
  if (tableStart === -1) return {};

  const header = cells(lines[tableStart]).map((h) => h.toLowerCase());
  const column = (pattern) => header.findIndex((h) => pattern.test(h));
  const networkColumn = column(/network/);
  const epochColumn = column(/epoch/);
  const timestampColumn = column(/timestamp|unix/);

  const deployments = {};
  for (const line of lines.slice(tableStart + 1)) {
    if (!line.trim().startsWith('|')) break;
    if (isDivider(line)) continue;
    const row = cells(line);
    const network = networkId(row[networkColumn] ?? '');
    if (!network) continue;
    deployments[network] = { epoch: number(row[epochColumn]), timestamp: timestampColumn === -1 ? null : number(row[timestampColumn]) };
  }
  return deployments;
}
