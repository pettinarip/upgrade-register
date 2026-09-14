// Mirrors the ACDbot manifest: every call with a summary or transcript, flattened.
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/ethereum/pm/master/.github/ACDbot/artifacts';
const res = await fetch(`${BASE}/manifest.json`);
if (!res.ok) throw new Error(`manifest ${res.status}`);
const { series } = await res.json();
const calls = [];
for (const [slug, s] of Object.entries(series)) {
  for (const c of s.calls ?? []) {
    const r = c.resources ?? {};
    calls.push({ ref: `${slug}/${Number(c.number)}`, series: slug, seriesName: s.name, number: Number(c.number), date: c.date, issue: c.issue ?? null, videoUrl: c.videoUrl ?? null,
      tldr: r.tldr ? `${BASE}/${c.path}/${r.tldr}` : null, transcript: r.transcript_corrected ?? r.transcript ? `${BASE}/${c.path}/${r.transcript_corrected ?? r.transcript}` : null, chat: r.chat ? `${BASE}/${c.path}/${r.chat}` : null });
  }
}
calls.sort((a, b) => a.date.localeCompare(b.date));
writeFileSync('upgrades/mirror/calls.json', JSON.stringify({ source: 'ethereum/pm ACDbot manifest', calls }, null, 2) + '\n');
console.log(`calls: ${calls.length}`);
