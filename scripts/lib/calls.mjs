import { fetchJson, fetchText, readJson } from './io.mjs';
import { isQuoteGrounded, parseVtt } from './transcript.mjs';

export const ACD_SERIES = ['acde', 'acdc', 'acdt'];

export const callFileName = (call) => `events/calls/${call.date}-${call.series}-${call.number}.json`;

export function findCall(ref) {
  const call = readJson('mirror/calls.json').calls.find((c) => c.ref === ref);
  if (!call) throw new Error(`unknown call ${ref}`);
  return call;
}

// Some acdt calls have a second recording for the CL half, with its own clock.
export async function loadTranscripts(call) {
  const transcripts = [];
  for (const url of call.transcripts) {
    const vtt = await fetchText(url);
    if (vtt) transcripts.push({ url, cues: parseVtt(vtt) });
  }
  if (!transcripts.length) throw new Error(`${call.ref} has no transcript`);
  return transcripts;
}

export async function loadAgenda(call) {
  const number = call.issueUrl?.split('/').pop();
  if (!number) return '';
  const api = `https://api.github.com/repos/ethereum/pm/issues/${number}`;
  const issue = await fetchJson(api);
  const comments = (await fetchJson(`${api}/comments?per_page=100`)) ?? [];
  return [issue?.title, issue?.body, ...comments.map((c) => c.body)].filter(Boolean).join('\n\n---\n\n');
}

export const isGrounded = (transcripts, { quote, timestamp }) => transcripts.some((t) => isQuoteGrounded(t.cues, quote, timestamp));
