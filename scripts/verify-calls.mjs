// Checks that every call event quotes its transcript within two minutes of its timestamp.
// Usage: node scripts/verify-calls.mjs [events/calls/<file>.json ...]   (default: all)

import { findCall, isGrounded, loadTranscripts } from './lib/calls.mjs';
import { jsonFiles, readJson } from './lib/io.mjs';

const files = process.argv.slice(2).length ? process.argv.slice(2) : jsonFiles('events/calls');
const transcriptsByRef = new Map();
const failures = [];
let checked = 0;

for (const file of files) {
  for (const event of readJson(file).events) {
    const { ref, quote, timestamp } = event.source;
    if (!transcriptsByRef.has(ref)) transcriptsByRef.set(ref, await loadTranscripts(findCall(ref)));
    checked++;
    if (!isGrounded(transcriptsByRef.get(ref), { quote, timestamp })) {
      failures.push(`${file}: ${ref} @${timestamp} "${quote}" is not in the transcript near that time`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`verified ${checked} call events in ${files.length} files`);
