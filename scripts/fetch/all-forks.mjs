// Vendors ethereum/pm all-forks.json unchanged and mirrors the Hardfork Meta listing.
// The build warns when a Meta EIP exists that pm has not registered; the fix is a PR to pm, not here.
import { writeFileSync } from 'node:fs';
import { writeJson, text } from '../lib.mjs';

const raw = await text('https://raw.githubusercontent.com/ethereum/pm/master/all-forks.json');
if (!raw) throw new Error('all-forks.json unavailable');
JSON.parse(raw);
writeFileSync('all-forks.json', raw.endsWith('\n') ? raw : raw + '\n');

const html = await text('https://eips.ethereum.org/meta');
const metaEips = [];
for (const row of html.split('<tr')) {
  const eip = Number(row.match(/eip-(\d+)/)?.[1]);
  const name = row.match(/Hardfork Meta\s*[-:]\s*([^<]+)/)?.[1]?.trim();
  if (eip && name && !/backfill/i.test(name)) metaEips.push({ eip, name });
}
writeJson('upgrades/mirror/meta-eips.json', { source: 'eips.ethereum.org/meta', metaEips });
console.log(`all-forks.json vendored; ${metaEips.length} Hardfork Meta EIPs listed`);
