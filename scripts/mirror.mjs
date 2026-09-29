// Refreshes every upstream snapshot and appends bot events. Order matters: later steps read
// all-forks.json to know the upgrades.

import { mirrorAllForks } from './mirror/all-forks.mjs';
import { mirrorCalls } from './mirror/calls.mjs';
import { mirrorConfigs } from './mirror/configs.mjs';
import { mirrorDevnets } from './mirror/devnets.mjs';
import { mirrorMetaEips } from './mirror/meta-eips.mjs';

await mirrorAllForks();
await mirrorCalls();
await mirrorDevnets();
await mirrorConfigs();
await mirrorMetaEips();
