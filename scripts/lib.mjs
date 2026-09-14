import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';

export const readJson = (p, fallback) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
export const writeJson = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); };
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const isoDate = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
export const now = () => new Date().toISOString();

const token = process.env.GITHUB_TOKEN ?? (() => { try { return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();
export async function gh(url) {
  const res = await fetch(url, { headers: { accept: 'application/vnd.github+json', ...(token && { authorization: `Bearer ${token}` }) } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return { json: await res.json(), link: res.headers.get('link') ?? '' };
}
export async function ghAll(url) {
  const out = [];
  let next = url;
  while (next) {
    const { json, link } = await gh(next);
    out.push(...json);
    next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return out;
}
export async function text(url) { const res = await fetch(url); return res.ok ? res.text() : null; }
export const EVENT_FILE = (name, source, events) => ({ source, recordedBy: 'bot', events });

// pm's all-forks.json is the registry. Ids are derived by one documented rule so every
// consumer lands on the same id; pm lists some upgrades once per layer, which fold into one.
export function loadUpgrades(path = 'all-forks.json') {
  const forks = readJson(path).forks;
  const out = [];
  for (const f of forks) {
    const name = f.combined_name ?? f.name.execution ?? f.name.consensus;
    const id = slug(name);
    const prev = out.find((u) => u.id === id);
    const layers = { execution: f.name.execution ?? null, consensus: f.name.consensus ?? null };
    if (prev) {
      prev.layers = { execution: prev.layers.execution ?? layers.execution, consensus: prev.layers.consensus ?? layers.consensus };
      prev.type = prev.layers.execution && prev.layers.consensus ? 'combined' : prev.type;
      prev.metaEips = [...new Set([...prev.metaEips, ...(f.meta_eips ?? [])])];
      prev.activation ??= f.activation;
      continue;
    }
    out.push({ id, name, type: f.type, layers, metaEips: f.meta_eips ?? [], activation: f.activation ?? null, upstreamStatus: f.status,
      links: { pm: 'https://github.com/ethereum/pm/blob/master/all-forks.json', ...(f.meta_eips?.[0] && { metaEip: `https://eips.ethereum.org/EIPS/eip-${f.meta_eips[0]}` }) } });
  }
  return out;
}
