// Prints call refs that have a summary or transcript but no events file yet, oldest first.
import { readFileSync, readdirSync } from 'node:fs';
const { calls } = JSON.parse(readFileSync('upgrades/mirror/calls.json', 'utf8'));
const covered = new Set(readdirSync('upgrades/events').map((f) => f.match(/^\d{4}-\d{2}-\d{2}-([a-z]+)-(\d+)\.json$/)).filter(Boolean).map(([, s, n]) => `${s}/${Number(n)}`));
const SERIES = new Set(['acde', 'acdc', 'acdt']);
// PoC scope: only the recent calls, where the two active forks are still being decided.
// Widen or drop this once the pipeline has earned a full backfill.
const since = process.argv[2] ?? '2026-07-20';
const pending = calls.filter((c) => SERIES.has(c.series) && c.date >= since && (c.tldr || c.transcript) && !covered.has(c.ref));
console.log(pending.map((c) => c.ref).join('\n'));
