import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback === undefined) throw new Error(`missing ${path}`);
    return fallback;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

function headersFor(url) {
  const token = process.env.GITHUB_TOKEN;
  if (token && url.startsWith('https://api.github.com/')) return { authorization: `Bearer ${token}` };
  return {};
}

// Returns null on 404 so callers can treat "not there" as data, and throws on anything else.
export async function fetchText(url) {
  const res = await fetch(url, { headers: headersFor(url) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.text();
}

export async function fetchJson(url) {
  const text = await fetchText(url);
  return text == null ? null : JSON.parse(text);
}

// Follows GitHub API pagination until a short page.
export async function fetchAllPages(url) {
  const items = [];
  for (let page = 1; ; page++) {
    const batch = await fetchJson(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!batch) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

export const isoDate = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

export const today = () => new Date().toISOString().slice(0, 10);
