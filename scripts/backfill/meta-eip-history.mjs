// BACKFILL, run once: EIP stage history from the git history of each Hardfork Meta EIP, plus open PFI PRs.
// It exists because the Meta EIP records buckets without dates. In the target state a decision is
// recorded when made and nobody diffs commits; keep this to seed history, not as a scheduled job.

const SINCE_META_EIP = 7569; // Dencun onward; older Meta EIPs predate the PFI/CFI/SFI process
const upgrades = loadUpgrades();
const state = readJson('upgrades/mirror/meta-eip-state.json', {});

const BUCKETS = [
  [/scheduled for inclusion/i, { stage: 'scheduled' }],
  [/considered for inclusion/i, { stage: 'considered' }],
  [/proposed for inclusion/i, { stage: 'proposed' }],
  [/declined for inclusion/i, { stage: 'declined' }],
  [/^included(\s+eips)?$/i, { stage: 'included' }],
  [/networking/i, { stage: 'scheduled', track: 'networking' }],
  [/informational/i, { stage: 'scheduled', track: 'informational' }],
];
// Returns { eip: { stage, track } } for one version of a Meta EIP.
function membership(md) {
  const out = {};
  let bucket = null, bucketLevel = 0;
  for (const line of md.split('\n')) {
    const h = line.match(/^(#{2,4})\s+(.*)/);
    if (h) {
      const level = h[1].length, title = h[2].trim();
      const hit = BUCKETS.find(([re]) => re.test(title))?.[1];
      if (hit) { bucket = hit; bucketLevel = level; }
      else if (level <= bucketLevel || level === 2) bucket = null;
      continue;
    }
    if (!bucket) continue;
    for (const m of line.matchAll(/\[EIP-(\d+)\]/g)) out[Number(m[1])] = { stage: bucket.stage, track: bucket.track ?? 'core' };
  }
  return out;
}
const diff = (prev, next) => {
  const events = [];
  for (const [eip, v] of Object.entries(next)) if (prev[eip]?.stage !== v.stage || (prev[eip]?.track ?? 'core') !== v.track) events.push({ eip: Number(eip), ...v });
  // Dropping a bucket section (e.g. when the Meta EIP moves to Review) is not a new decision for EIPs already declined, withdrawn or included.
  for (const [eip, v] of Object.entries(prev)) if (!next[eip] && !['declined', 'withdrawn', 'included'].includes(v.stage)) events.push({ eip: Number(eip), stage: v.stage === 'proposed' ? 'withdrawn' : 'declined', track: v.track, removed: true });
  return events;
};

for (const u of upgrades) {
  for (const meta of u.metaEips.filter((m) => m >= SINCE_META_EIP && ![7568].includes(m))) {
    const path = `EIPS/eip-${meta}.md`;
    const commits = (await ghAll(`https://api.github.com/repos/ethereum/EIPs/commits?path=${path}&per_page=100`)).reverse();
    const st = state[meta] ?? { lastSha: null, membership: {}, events: [] };
    const start = st.lastSha ? commits.findIndex((c) => c.sha === st.lastSha) + 1 : 0;
    let prev = st.membership;
    for (const c of commits.slice(start)) {
      const md = await text(`https://raw.githubusercontent.com/ethereum/EIPs/${c.sha}/${path}`);
      if (md == null) continue;
      const next = membership(md);
      const subject = c.commit.message.split('\n')[0];
      const pr = subject.match(/\(#(\d+)\)\s*$/)?.[1];
      for (const d of diff(prev, next)) {
        st.events.push({ type: 'eip.stage', eip: d.eip, upgrade: u.id, stage: d.stage, ...(d.track !== 'core' && { track: d.track }), date: c.commit.committer.date.slice(0, 10), confidence: 'high',
          ref: pr ? `ethereum/EIPs#${pr}` : c.sha.slice(0, 7), url: pr ? `https://github.com/ethereum/EIPs/pull/${pr}` : c.html_url, note: d.removed ? `Removed from EIP-${meta}: ${subject}` : subject });
      }
      prev = next; st.lastSha = c.sha;
    }
    st.membership = prev;
    state[meta] = st;

    // Open PRs that add an EIP to the Proposed bucket are the PFI signal before merge.
    const prs = (await gh(`https://api.github.com/search/issues?q=repo:ethereum/EIPs+is:pr+is:open+in:title+${meta}`)).json.items ?? [];
    const proposed = [];
    for (const pr of prs) {
      const { json: full } = await gh(pr.pull_request.url);
      const md = await text(`https://raw.githubusercontent.com/${full.head.repo?.full_name ?? 'ethereum/EIPs'}/${full.head.sha}/${path}`);
      if (!md) continue;
      for (const [eip, v] of Object.entries(membership(md))) {
        if (v.stage === 'proposed' && !prev[eip]) proposed.push({ type: 'eip.stage', eip: Number(eip), upgrade: u.id, stage: 'proposed', date: pr.created_at.slice(0, 10), confidence: 'medium', ref: `ethereum/EIPs#${pr.number}`, url: pr.html_url, note: `Open PR: ${pr.title}` });
      }
    }
    const events = [...st.events, ...proposed];
    if (events.length) writeJson(`upgrades/events/meta-eip-${meta}.json`, { source: { kind: 'meta-eip', ref: `EIP-${meta}`, url: `https://eips.ethereum.org/EIPS/eip-${meta}` }, recordedBy: 'bot', events });
    console.log(`EIP-${meta} (${u.id}): ${commits.length} commits, ${st.events.length} stage events, ${proposed.length} open PFI`);
  }
}
writeJson('upgrades/mirror/meta-eip-state.json', state);
