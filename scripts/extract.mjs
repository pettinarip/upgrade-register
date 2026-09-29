// Drafts the events file for one ACD call. A maintainer reviews it as a PR before merge.
// Usage: node scripts/extract.mjs [call-ref]   (no ref: the oldest pending call)
// Writes events/calls/<date>-<series>-<n>.json and the PR body to extract-summary.md.

import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ACD_SERIES, callFileName, findCall, isGrounded, loadAgenda, loadTranscripts } from './lib/calls.mjs';
import { validateEvent } from './lib/events.mjs';
import { readJson, writeJson } from './lib/io.mjs';
import { cuesAround, renderCues } from './lib/transcript.mjs';

// Calls before this date are not extracted; the seed and the Meta EIP history cover them.
const EXTRACT_FROM = '2026-09-28';
const MODEL = process.env.EXTRACT_MODEL || 'claude-opus-5-5';
const SKIP_FILE = process.env.SKIP_REFS_FILE;

function pendingCalls() {
  const skip = SKIP_FILE && existsSync(SKIP_FILE) ? readFileSync(SKIP_FILE, 'utf8').split('\n').filter(Boolean) : [];
  return readJson('mirror/calls.json').calls.filter(
    (call) => ACD_SERIES.includes(call.series) && call.date >= EXTRACT_FROM && call.transcripts.length && !existsSync(callFileName(call)) && !skip.includes(call.ref),
  );
}

function currentState() {
  const index = readJson('dist/index.json');
  return index.upgrades
    .filter((u) => u.status !== 'live' && u.status !== 'research')
    .map(({ id }) => {
      const u = readJson(`dist/upgrades/${id}.json`);
      return {
        id,
        status: u.status,
        forks: [u.mainnet, ...u.testnets, ...u.devnetForks].filter(Boolean).map(({ network, status, forkDate, epoch }) => ({ network, status, forkDate, epoch })),
        headliners: u.headliners.map(({ eip, action }) => ({ eip, action })),
        deadlines: u.deadlines.map(({ stage, deadline }) => ({ stage, deadline })),
        eips: Object.fromEntries(u.eips.filter((e) => e.stage !== 'removed').map((e) => [e.eip, e.track === 'core' ? e.stage : `${e.stage}/${e.track}`])),
      };
    });
}

function buildRequest(call, agenda, transcripts) {
  const sections = [
    `# Call ${call.ref} on ${call.date}`,
    `## Agenda\n${agenda || '(none)'}`,
    `## resolve\n${JSON.stringify(readJson('dist/resolve.json'))}`,
    `## current\n${JSON.stringify(currentState())}`,
    ...transcripts.map((t, i) => `## Transcript ${i + 1} of ${transcripts.length}\n${renderCues(t.cues)}`),
  ];
  return sections.join('\n\n');
}

async function askModel(system, user) {
  const baseURL = process.env.ANTHROPIC_BASE_URL?.replace(/\/v1\/?$/, '');
  const key = process.env.ANTHROPIC_API_KEY;
  // Gateways such as OpenRouter want a bearer token; the Anthropic API wants x-api-key.
  const client = new Anthropic({ apiKey: key, authToken: baseURL ? key : null, ...(baseURL && { baseURL }) });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`model stopped with ${response.stop_reason}`);
  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function toEvent(call, { quote, timestamp, note, ...fields }) {
  return { ...fields, date: call.date, ...(note && { note }), source: { kind: 'call', ref: call.ref, url: call.issueUrl, quote, timestamp } };
}

function knownIds() {
  const resolve = readJson('dist/resolve.json');
  return {
    upgrades: new Set(resolve.upgrades.map((u) => u.id)),
    networks: new Set([...resolve.networks.map((n) => n.id), ...resolve.devnets.map((d) => d.id)]),
  };
}

function summary(call, kept, dropped, unresolved, transcripts) {
  const context = (event) => transcripts.map((t) => renderCues(cuesAround(t.cues, event.source.timestamp, 60))).filter(Boolean).join('\n…\n');
  const describe = (e) => `\`${e.type}\` ${e.upgrade} ${e.eip ?? e.network ?? e.stage} → **${e.stage ?? e.status ?? e.action}**${e.forkDate ? ` ${e.forkDate}` : ''}${e.deadline ? ` by ${e.deadline}` : ''}`;
  const lines = [`Extracted from [${call.ref}](${call.issueUrl}) (${call.date}) with ${MODEL}. Check each event against the transcript before merging.`, ''];
  lines.push(kept.length ? `## Events (${kept.length})` : '## No events\n\nMerging records that this call was read and holds no register decisions.');
  for (const event of kept) {
    lines.push('', `### ${describe(event)}`, `> ${event.source.quote} (${event.source.timestamp})`, ...(event.note ? ['', event.note] : []), '', '<details><summary>transcript</summary>', '', '```', context(event), '```', '</details>');
  }
  if (dropped.length) lines.push('', `## Dropped (${dropped.length})`, ...dropped.map(({ event, reason }) => `- ${describe(event)}: ${reason}`));
  if (unresolved.length) lines.push('', '## Unresolved', ...unresolved.map((u) => `- ${u}`));
  return lines.join('\n');
}

const ref = process.argv[2] ?? pendingCalls()[0]?.ref;
if (!ref) {
  console.log('no pending calls');
  process.exit(0);
}

const call = findCall(ref);
const transcripts = await loadTranscripts(call);
const answer = await askModel(readFileSync('prompts/extract.md', 'utf8'), buildRequest(call, await loadAgenda(call), transcripts));
const known = knownIds();

const kept = [];
const dropped = [];
for (const raw of answer.events ?? []) {
  const event = toEvent(call, raw);
  const problems = validateEvent(event, known);
  if (problems.length) dropped.push({ event, reason: problems.join('; ') });
  else if (!isGrounded(transcripts, event.source)) dropped.push({ event, reason: 'quote not found in the transcript near its timestamp' });
  else kept.push(event);
}

writeJson(callFileName(call), { call: call.ref, events: kept });
writeFileSync('extract-summary.md', summary(call, kept, dropped, answer.unresolved ?? [], transcripts) + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `call=${call.ref}\n`);
console.log(`${call.ref}: ${kept.length} events, ${dropped.length} dropped → ${callFileName(call)}`);
