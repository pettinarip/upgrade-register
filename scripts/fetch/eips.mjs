// Refreshes upgrades/mirror/eips.json from ethereum/EIPs for every EIP referenced in events.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const path = 'upgrades/mirror/eips.json';
const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { eips: {} };
const referenced = new Set();
for (const f of readdirSync('upgrades/events')) for (const ev of JSON.parse(readFileSync(join('upgrades/events', f), 'utf8')).events) if (ev.eip) referenced.add(ev.eip);
for (const u of JSON.parse(readFileSync('all-forks.json', 'utf8')).forks) (u.meta_eips ?? []).forEach((n) => referenced.add(n));
for (const f of readdirSync('upgrades/cuts')) JSON.parse(readFileSync(join('upgrades/cuts', f), 'utf8')).eips.forEach((n) => referenced.add(n));

const frontmatter = (md) => Object.fromEntries([...md.match(/^---\n([\s\S]*?)\n---/)?.[1].matchAll(/^([a-z-]+):\s*(.*)$/gm) ?? []].map(([, k, v]) => [k, v.trim()]));
const eips = {};
for (const n of [...referenced].sort((a, b) => a - b)) {
  const res = await fetch(`https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-${n}.md`);
  if (!res.ok) { eips[n] = current.eips[n] ?? { title: null, status: null, type: null, category: null, layer: null }; continue; }
  const fm = frontmatter(await res.text());
  eips[n] = { title: fm.title ?? null, status: fm.status ?? null, type: fm.type ?? null, category: fm.category ?? null, layer: current.eips[n]?.layer ?? null };
}
writeFileSync(path, JSON.stringify({ source: 'ethereum/EIPs@master', eips }, null, 2) + '\n');
console.log(`eips: ${Object.keys(eips).length}`);
