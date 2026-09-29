import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQuoteGrounded, parseVtt } from '../scripts/lib/transcript.mjs';

const vtt = `WEBVTT

1
00:20:10.000 --> 00:20:14.000
Ansgar Dietrichs: recent roots for frame transactions.

2
00:20:18.000 --> 00:20:22.000
nixo: Makes sense to CFI these. All together.

3
00:20:35.000 --> 00:20:37.000
nixo: Moving this one to CFI.
`;

const cues = parseVtt(vtt);

test('parses speaker and start time', () => {
  assert.deepEqual(cues[1], { start: 1218, speaker: 'nixo', text: 'Makes sense to CFI these. All together.' });
});

test('a quote is grounded across cues, ignoring punctuation and case', () => {
  assert.ok(isQuoteGrounded(cues, 'makes sense to CFI these, all together. Moving this one to CFI', '0:20:30'));
});

test('a quote far from its timestamp is not grounded', () => {
  assert.ok(!isQuoteGrounded(cues, 'Moving this one to CFI.', '0:40:00'));
});

test('words that were never said are not grounded', () => {
  assert.ok(!isQuoteGrounded(cues, 'Moving this one to SFI.', '0:20:35'));
});
