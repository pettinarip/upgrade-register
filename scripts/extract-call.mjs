// Extracts upgrade events from one call transcript.
// Inputs are gathered here and the output is validated here, so the model does one
// structured job: read the transcript, return events. Works against any
// Anthropic-compatible endpoint (ANTHROPIC_BASE_URL), including a gateway.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readJson, loadUpgrades } from './lib.mjs';

const ref = process.argv[2];
if (!ref) throw new Error('usage: node scripts/extract-call.mjs <series>/<number>');
const BASE = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
const MODEL = process.env.EXTRACT_MODEL ?? 'claude-sonnet-4-6';
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error('ANTHROPIC_API_KEY is not set');

const call = readJson('upgrades/mirror/calls.json').calls.find((c) => c.ref === ref);
if (!call) throw new Error(`unknown call ${ref}`);
const text = async (u) => (u ? ((r) => (r.ok ? r.text() : null))(await fetch(u)) : null);

const vtt = await text(call.transcript);
if (!vtt) throw new Error(`no transcript for ${ref}`);
// One line per cue: "H:MM:SS text". Cheaper than raw VTT and keeps the timestamps a reviewer needs.
const flat = [];
const lines = vtt.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].match(/^(\d{2}):(\d{2}):(\d{2})\.\d+\s+-->/);
  if (!t) continue;
  const stamp = `${Number(t[1])}:${t[2]}:${t[3]}`;
  const body = [];
  for (let j = i + 1; j < lines.length && lines[j].trim() && !/-->/.test(lines[j]); j++) body.push(lines[j].trim());
  if (body.length) flat.push(`${stamp} ${body.join(' ')}`);
}
const transcript = flat.join('\n');
const tldr = await text(call.tldr);

const file = `upgrades/events/${call.date}-${call.series}-${call.number}.json`;
const prompt = readFileSync('agent/extract-call.md', 'utf8');
const resolve = JSON.parse(readFileSync('dist/resolve.json', 'utf8'));
const schema = JSON.parse(readFileSync('upgrades/schema/schema.json', 'utf8'));
const slim = {
  upgrades: resolve.upgrades.map((u) => ({ id: u.id, aliases: u.aliases })),
  networks: resolve.networks.map((n) => ({ id: n.id, aliases: n.aliases })),
  devnets: resolve.devnets,
  vocabulary: resolve.vocabulary,
  eips: resolve.eips.map((e) => ({ eip: e.eip, aliases: e.aliases })),
};

const system = `${prompt}

## This run

You are not writing files. Return ONLY a JSON object, no prose and no code fence, of the form:
{"events": [ ... ]}
Each event must validate against the "event" definition below. If the call made no
recordable upgrade decisions, return {"events": []}.

## Event schema (definitions from upgrades/schema/schema.json)
${JSON.stringify({ event: schema.$defs.event, eipStage: schema.$defs.eipStage, headliner: schema.$defs.headliner, networkFork: schema.$defs.networkFork, deadline: schema.$defs.deadline, date: schema.$defs.date, nullableDate: schema.$defs.nullableDate, common: schema.$defs.common })}

## Resolver: the only valid ids
${JSON.stringify(slim)}`;

const user = `Call ${ref} on ${call.date}. Agenda issue: https://github.com/ethereum/pm/issues/${call.issue}
${tldr ? `\nPre-call summary (a guide to where to look; the transcript decides):\n${tldr.slice(0, 20000)}\n` : ''}
Transcript, one line per cue as "H:MM:SS text":
${transcript}`;

const body = { model: MODEL, max_tokens: 16000, system, messages: [{ role: 'user', content: user }] };
const res = await fetch(`${BASE}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY, authorization: `Bearer ${KEY}`, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify(body),
});
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
const out = await res.json();
const answer = (out.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
const json = answer.match(/\{[\s\S]*\}/)?.[0];
if (!json) throw new Error(`no JSON in response: ${answer.slice(0, 300)}`);
let { events } = JSON.parse(json);

// The register's worth is its provenance, so a quote that cannot be found in the
// transcript is worse than a missing event. One retry naming the failures, then drop.
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hay = norm(transcript);
const spans = (e) => (Array.isArray(e.quote) ? e.quote : e.quote ? [e.quote] : []);
const bad = (list) => list.filter((e) => !spans(e).length || !spans(e).every((q) => hay.includes(norm(q))));

let failed = bad(events);
if (failed.length) {
  console.log(`${failed.length} quote(s) not found verbatim, asking once more`);
  const retry = await fetch(`${BASE}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, authorization: `Bearer ${KEY}`, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ ...body, messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: JSON.stringify({ events }) },
      { role: 'user', content: `These quotes are not present verbatim in the transcript:\n${failed.map((e) => `- ${e.type} ${e.eip ?? e.network}: ${JSON.stringify(e.quote)}`).join('\n')}\n\nReturn the full {"events": [...]} again. For each of those, copy an unbroken run of words exactly as it appears in the transcript, or use an array of exact spans. Drop any event you cannot ground this way. Change nothing else.` },
    ] }),
  });
  if (retry.ok) {
    const j = (await retry.json()).content?.filter((b) => b.type === 'text').map((b) => b.text).join('').match(/\{[\s\S]*\}/)?.[0];
    if (j) events = JSON.parse(j).events ?? events;
  }
  failed = bad(events);
}
if (failed.length) {
  console.log(`dropped ${failed.length} event(s) with unverifiable quotes:`);
  for (const e of failed) console.log(`  - ${e.type} ${e.eip ?? e.network} ${JSON.stringify(e.quote)?.slice(0, 120)}`);
  events = events.filter((e) => !failed.includes(e));
}
// Second pass: a reviewer that argues against each candidate, with the transcript around it
// and the fork's current Meta EIP list in hand. Judgment stays with the model; the checks
// above stay in code.
const call2 = async (systemText, userText) => {
  const r = await fetch(`${BASE}/messages`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, authorization: `Bearer ${KEY}`, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, system: systemText, messages: [{ role: 'user', content: userText }] }) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { text: (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''), usage: j.usage };
};
const reviewerNotes = [];
if (events.length) {
  const metaState = readJson('upgrades/mirror/meta-eip-state.json', {});
  const metaList = {};
  for (const u of loadUpgrades()) if (events.some((e) => e.upgrade === u.id)) for (const m of u.metaEips) Object.assign((metaList[u.id] ??= {}), metaState[m]?.membership ?? {});
  const toSec = (t) => t.split(':').reverse().reduce((a, v, i) => a + Number(v) * 60 ** i, 0);
  const cues = flat.map((l) => { const m = l.match(/^(\d+):(\d\d):(\d\d) /); return m ? { s: toSec(`${m[1]}:${m[2]}:${m[3]}`), t: l } : null; }).filter(Boolean);
  const around = (e) => { if (!e.timestamp) return '(no timestamp)'; const c = toSec(e.timestamp); return cues.filter((x) => Math.abs(x.s - c) <= 90).map((x) => x.t).join('\n'); };
  const reviewUser = `Call ${ref} on ${call.date}.\n\n## Current Meta EIP membership per upgrade (stage per EIP)\n${JSON.stringify(metaList)}\n\n## Candidates\n\n` +
    events.map((e, i) => `### candidate id c${i}\n${JSON.stringify(e)}\n\nTranscript within 90s of ${e.timestamp ?? '?'}:\n${around(e)}`).join('\n\n');
  const rv = await call2(readFileSync('agent/review-call.md', 'utf8'), reviewUser);
  const verdicts = JSON.parse(rv.text.match(/\{[\s\S]*\}/)?.[0] ?? '{"verdicts":[]}').verdicts ?? [];
  const next = [];
  events.forEach((e, i) => {
    const v = verdicts.find((x) => x.id === `c${i}` || x.index === i) ?? { verdict: 'keep' };
    if (v.verdict === 'drop') { reviewerNotes.push(`dropped: ${e.type} ${e.eip ?? e.network} — ${v.reason ?? ''}`); return; }
    if (v.verdict === 'fix' && v.event) { reviewerNotes.push(`fixed: ${e.type} ${e.eip ?? e.network} — ${v.reason ?? ''}`); next.push(v.event); return; }
    next.push(e);
  });
  const stillBad = bad(next);
  for (const e of stillBad) reviewerNotes.push(`dropped after review: ${e.type} ${e.eip ?? e.network} — quote not in transcript`);
  events = next.filter((e) => !stillBad.includes(e));
  console.log(`reviewer: ${verdicts.filter((v) => v.verdict === 'keep').length} keep, ${verdicts.filter((v) => v.verdict === 'fix').length} fix, ${verdicts.filter((v) => v.verdict === 'drop').length} drop (${rv.usage?.input_tokens ?? '?'} in / ${rv.usage?.output_tokens ?? '?'} out)`);
}
console.log(`${events.length} events kept, all quotes verified`);
console.log(`${ref}: ${events.length} event(s), ${out.usage?.input_tokens ?? '?'} in / ${out.usage?.output_tokens ?? '?'} out`);
if (reviewerNotes.length) { console.log('\n### Reviewer notes\n'); for (const n of reviewerNotes) console.log(`- ${n}`); }
if (!events.length) {
  // A re-run that finds nothing must retract the old file, or the stale events stay on main.
  if (existsSync(file)) { unlinkSync(file); console.log(`removed stale ${file}`); }
  console.log('NO_EVENTS'); process.exit(0);
}

writeFileSync(file, JSON.stringify({
  source: { kind: 'call', ref, url: `https://github.com/ethereum/pm/issues/${call.issue}`, date: call.date },
  recordedBy: 'agent', events,
}, null, 2) + '\n');
console.log(`wrote ${file}`);
execFileSync('npm', ['test'], { stdio: 'inherit' });

const link = (e) => (call.videoUrl && e.timestamp ? `${call.videoUrl}&t=${e.timestamp.split(':').reverse().reduce((a, v, i) => a + Number(v) * 60 ** i, 0)}` : '');
console.log('\n## Review checklist\n');
for (const e of events) {
  const what = e.type === 'eip.stage' ? `EIP-${e.eip} ${e.stage} for ${e.upgrade}`
    : e.type === 'upgrade.headliner' ? `EIP-${e.eip} headliner ${e.action} for ${e.upgrade}`
    : e.type === 'upgrade.deadline' ? `${e.upgrade} ${e.stage} deadline ${e.date}`
    : `${e.network} fork ${e.status} ${e.date} for ${e.upgrade}`;
  const q = (Array.isArray(e.quote) ? e.quote : [e.quote ?? '']).map((x) => `"${x}"`).join(' … ');
  console.log(`- [ ] **${what}** (${e.confidence}) — ${q} ${link(e)}`);
}
