// Transcripts are WebVTT from the ACDbot. A quote is grounded when its words appear in the
// transcript close to the timestamp the event gives.

export const QUOTE_WINDOW_SECONDS = 120;

export function toSeconds(timestamp) {
  return timestamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

export function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Returns [{ start, speaker, text }] with start in seconds.
export function parseVtt(vtt) {
  const cues = [];
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing === -1) continue;
    const start = toSeconds(lines[timing].split('-->')[0].trim().split('.')[0]);
    const body = lines.slice(timing + 1).join(' ').trim();
    const speaker = body.match(/^([^:]{1,60}):\s/)?.[1] ?? null;
    cues.push({ start, speaker, text: speaker ? body.slice(speaker.length + 1).trim() : body });
  }
  return cues;
}

export const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function cuesAround(cues, timestamp, windowSeconds = QUOTE_WINDOW_SECONDS) {
  const at = toSeconds(timestamp);
  return cues.filter((cue) => Math.abs(cue.start - at) <= windowSeconds);
}

export function isQuoteGrounded(cues, quote, timestamp) {
  const nearby = normalize(cuesAround(cues, timestamp).map((cue) => cue.text).join(' '));
  return nearby.includes(normalize(quote));
}

// Compact "H:MM:SS Speaker: text" lines, the form the extraction prompt reads.
export const renderCues = (cues) =>
  cues.map((cue) => `${formatTimestamp(cue.start)} ${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text}`).join('\n');
