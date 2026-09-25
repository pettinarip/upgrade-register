// Extracts upgrade events from one call transcript.
// Inputs are gathered here and the output is validated here, so the model does one
// structured job: read the transcript, return events. Works against any
// Anthropic-compatible endpoint (ANTHROPIC_BASE_URL), including a gateway.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readJson } from './lib.mjs';

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
const { events } = JSON.parse(json);
console.log(`${ref}: ${events.length} event(s), ${out.usage?.input_tokens ?? '?'} in / ${out.usage?.output_tokens ?? '?'} out`);
if (!events.length) { console.log('NO_EVENTS'); process.exit(0); }

const file = `upgrades/events/${call.date}-${call.series}-${call.number}.json`;
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
  console.log(`- [ ] **${what}** (${e.confidence}) — "${e.quote ?? ''}" ${link(e)}`);
}
