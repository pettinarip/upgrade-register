import { fetchJson, writeJson } from '../lib/io.mjs';

const BASE = 'https://raw.githubusercontent.com/ethereum/pm/master/.github/ACDbot/artifacts';

const artifactUrl = (call, resource) => (call.resources?.[resource] ? `${BASE}/${call.path}/${call.resources[resource]}` : null);

export async function mirrorCalls() {
  const { series } = await fetchJson(`${BASE}/manifest.json`);
  const calls = [];
  for (const [slug, { calls: list = [] }] of Object.entries(series)) {
    for (const call of list) {
      const transcripts = [artifactUrl(call, 'transcript_corrected') ?? artifactUrl(call, 'transcript'), artifactUrl(call, 'transcript_cl')].filter(Boolean);
      calls.push({
        ref: `${slug}/${Number(call.number)}`,
        series: slug,
        number: Number(call.number),
        date: call.date,
        issueUrl: call.issue ? `https://github.com/ethereum/pm/issues/${call.issue}` : null,
        videoUrl: call.videoUrl ?? null,
        transcripts,
        tldr: artifactUrl(call, 'tldr'),
      });
    }
  }
  calls.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  writeJson('mirror/calls.json', { source: `${BASE}/manifest.json`, calls });
  console.log(`calls: ${calls.length}`);
}
