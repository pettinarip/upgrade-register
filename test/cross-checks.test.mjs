import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseDeploymentTable } from '../scripts/lib/deployment-table.mjs';
import { parseForkChanges } from '../scripts/mirror/cross-checks.mjs';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('reads the Meta EIP activation table, not the BPO tables after it', () => {
  const table = parseDeploymentTable(fixture('eip-7607-3b1edfd6.md'), /activation/i);
  assert.deepEqual(table.mainnet, { epoch: 411392, timestamp: 1764798551 });
  assert.deepEqual(table.holesky, { epoch: 165120, timestamp: 1759308480 });
});

test('reads a pm deployment table and leaves TBD rows empty', () => {
  const markdown = `# Glamsterdam Deployments

| Network | Epoch | Start slot | Unix | UTC (+00:00) |
|---------|-------|------------|------|--------------|
| Sepolia | 353024 | 11296768 | 1791294816 | Tue, 06 Oct 2026, 13:53:36 |
| Hoodi | TBD | TBD | TBD | TBD |
`;
  assert.deepEqual(parseDeploymentTable(markdown), { sepolia: { epoch: 353024, timestamp: 1791294816 }, hoodi: { epoch: null, timestamp: null } });
});

test('reads the EIPs an execution-specs fork module lists under Changes', () => {
  const source = `"""
The Amsterdam fork ([EIP-7773]) includes block-level access lists.

### Changes

- [EIP-2780: Resource-based intrinsic transaction gas][EIP-2780]
- [EIP-7928: Block-Level Access Lists][EIP-7928]

### Releases

[EIP-7773]: https://eips.ethereum.org/EIPS/eip-7773
"""`;
  assert.deepEqual(parseForkChanges(source), [2780, 7928]);
});
