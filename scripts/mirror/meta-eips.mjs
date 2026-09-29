// Walks each Hardfork Meta EIP commit by commit, from the last one seen, and records every
// bucket change as an eip.stage event dated by its commit. The first run seeds the history.

import { fetchAllPages, fetchText, readJson, writeJson } from '../lib/io.mjs';
import { diffMembership, parseMetaEip } from '../lib/meta-eip.mjs';
import { FIRST_BUCKETED_META_EIP, loadUpgrades } from '../lib/registry.mjs';

const REPO = 'ethereum/EIPs';

async function commitsSince(path, lastSha) {
  const commits = (await fetchAllPages(`https://api.github.com/repos/${REPO}/commits?path=${path}`)).reverse();
  if (!lastSha) return commits;
  const seen = commits.findIndex((c) => c.sha === lastSha);
  if (seen === -1) throw new Error(`${path}: last seen commit ${lastSha} is no longer in history`);
  return commits.slice(seen + 1);
}

function stageEvent(upgrade, change, commit) {
  return {
    type: 'eip.stage',
    upgrade,
    eip: change.eip,
    stage: change.stage,
    ...(change.track !== 'core' && { track: change.track }),
    date: commit.commit.committer.date.slice(0, 10),
    source: {
      kind: 'meta-eip',
      ref: commit.sha.slice(0, 7),
      url: commit.html_url,
      note: commit.commit.message.split('\n')[0],
    },
  };
}

async function walkMetaEip(number, upgrade, state) {
  const path = `EIPS/eip-${number}.md`;
  const file = `events/meta/eip-${number}.json`;
  const { events } = readJson(file, { events: [] });
  let { lastSha = null, membership = {} } = state[number] ?? {};

  for (const commit of await commitsSince(path, lastSha)) {
    const markdown = await fetchText(`https://raw.githubusercontent.com/${REPO}/${commit.sha}/${path}`);
    if (markdown == null) continue;
    const next = parseMetaEip(markdown);
    events.push(...diffMembership(membership, next).map((change) => stageEvent(upgrade, change, commit)));
    membership = next;
    lastSha = commit.sha;
  }

  writeJson(file, { metaEip: number, upgrade, events });
  state[number] = { upgrade, lastSha, membership };
  return events.length;
}

export async function mirrorMetaEips() {
  const state = readJson('mirror/meta-eips.json', {});
  for (const upgrade of loadUpgrades()) {
    for (const number of upgrade.metaEips.filter((n) => n >= FIRST_BUCKETED_META_EIP)) {
      const count = await walkMetaEip(number, upgrade.id, state);
      console.log(`meta-eip ${number} (${upgrade.id}): ${count} stage events`);
    }
  }
  writeJson('mirror/meta-eips.json', state);
}
