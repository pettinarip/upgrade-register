// Reads which EIPs a Hardfork Meta EIP lists, and in which bucket.

const BUCKETS = [
  [/scheduled for inclusion/i, 'scheduled'],
  [/considered for inclusion/i, 'considered'],
  [/proposed for inclusion/i, 'proposed'],
  [/declined for inclusion/i, 'declined'],
  [/^included\b/i, 'included'],
  [/^other eips$/i, 'scheduled'],
];

const TRACKS = [
  [/networking/i, 'networking'],
  [/informational/i, 'informational'],
];

const matchFirst = (rules, text) => rules.find(([pattern]) => pattern.test(text))?.[1];

// A heading deeper than the open bucket is a sub-list of it. A Networking or Informational
// heading at bucket level still belongs to the bucket above it (7773 @ c79a376 wrote it that way).
function nextBucket(open, level, title) {
  const track = matchFirst(TRACKS, title);
  if (open && level > open.level) return { ...open, track: track ?? open.track };
  const stage = matchFirst(BUCKETS, title);
  if (stage) return { stage, level, track: 'core' };
  if (open && track) return { ...open, track };
  return null;
}

const plainText = (markdown) => markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();

// Returns { [eip]: { stage, track, title } }.
export function parseMetaEip(markdown) {
  const listed = {};
  let bucket = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      bucket = nextBucket(bucket, heading[1].length, heading[2]);
      continue;
    }
    const item = line.match(/^\s*(?:[*-]|\d+\.)\s+\[?EIP-(\d+)\]?(?:\([^)]*\))?\s*:?\s*(.*)$/i);
    if (item && bucket) {
      listed[Number(item[1])] = { stage: bucket.stage, track: bucket.track, title: plainText(item[2]) || null };
    }
  }
  return listed;
}

// Stage changes between two parsed versions. An EIP that disappears is 'removed'.
export function diffMembership(before, after) {
  const changes = [];
  for (const [eip, now] of Object.entries(after)) {
    const was = before[eip];
    if (!was || was.stage !== now.stage || was.track !== now.track) {
      changes.push({ eip: Number(eip), stage: now.stage, track: now.track });
    }
  }
  for (const eip of Object.keys(before)) {
    if (!(eip in after)) changes.push({ eip: Number(eip), stage: 'removed', track: 'core' });
  }
  return changes.sort((a, b) => a.eip - b.eip);
}
