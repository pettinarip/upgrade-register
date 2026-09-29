# upgrade-register

A register of Ethereum network upgrade facts: which EIPs each fork holds at which stage, when each network forks, which devnets ran, and the headliners and deadlines. Every fact is a dated event with one source. The compiled register is published at https://pettinarip.github.io/upgrade-register/.

```
mirror (cron)  →  extract calls (agent PR, human merges)  →  compile  →  publish
```

## Rules

1. **Only two channels write events.**
   - **Bots** diff upstream snapshots (`events/meta`, `events/config`).
   - **Calls** are agent-drafted PRs a maintainer merges (`events/calls`).
   - The only hand-edited file is `aliases.json`: nicknames for resolving spoken names.
2. **A bot emits only on change.** The Meta EIP bot emits when an EIP's bucket differs between two consecutive commits. The config bot emits when a fork epoch appears, changes or activates.
3. **Latest event wins.** A subject's current value is its latest event by date. On the same date, a bot event applies after a call event.
4. **A merged call event is a fact.** It overrides the Meta EIP until a later Meta EIP change moves that EIP again.
5. **Map, don't infer.** Every event is one upstream line or one quote. An EIP leaving a Meta EIP list is `removed`, with `lastListed` giving the stage it had.
6. **History rows merge on equal values.** Consecutive events with the same value become one row, dated by the earliest event and keeping every source.
7. **Disagreements are flagged, never resolved.** `dist/checks.json` lists where the register differs from the current Meta EIPs or client configs.

## Sources

| Fact | Source | Channel |
|---|---|---|
| Upgrades, layers, Meta EIPs, mainnet activations | ethereum/pm `all-forks.json` | bot |
| EIP stage per upgrade | Hardfork Meta EIPs (7569 onward), commit by commit | bot |
| EIP stage per upgrade, before the Meta EIP catches up | ACD transcripts | call |
| Testnet and mainnet fork epochs | eth-clients `metadata/config.yaml`, consensus-specs `configs/mainnet.yaml`. A shipped epoch not yet reached is `agreed`. | bot |
| Fork dates before a config ships | ACD transcripts | call |
| Headliners, stage deadlines | ACD transcripts | call |
| Devnets: existence, liveness, genesis | ethpandaops cartographoor and network-configs | snapshot |

Calls are extracted from 2026-09-28 on. `events/calls/seed.json` holds the few call-only facts that were still open when the register started.

## Layout

```
mirror/            snapshots: all-forks.json, calls.json, configs.json, devnets.json, meta-eips.json
events/meta/       bot: stage changes per Meta EIP
events/config/     bot: fork events per network
events/calls/      call events, one file per call, plus seed.json
aliases.json       spoken names for ids
prompts/extract.md the extraction prompt
scripts/           mirror.mjs, compile.mjs, extract.mjs, verify-calls.mjs, lib/
test/              parser, history and transcript tests with Meta EIP fixtures
```

## Output

| File | Contents |
|---|---|
| `index.json` | upgrades with status and mainnet date, networks |
| `upgrades/<id>.json` | status, mainnet, testnets, devnets, headliners, deadlines, every EIP with its stage history |
| `eips/<n>.json` | one EIP across upgrades |
| `resolve.json` | every valid id with its aliases, and the vocabulary |
| `checks.json` | differences from the current upstream snapshot |

## Event shape

```json
{
  "type": "eip.stage",
  "upgrade": "hegota",
  "eip": 8272,
  "stage": "considered",
  "date": "2026-09-24",
  "source": { "kind": "call", "ref": "acde/246", "url": "https://github.com/ethereum/pm/issues/2223", "quote": "Moving this one to CFI.", "timestamp": "1:20:35" }
}
```

| type | value field | values |
|---|---|---|
| `eip.stage` | `stage` (+ `track`: core, networking, informational) | proposed, considered, scheduled, declined, included, withdrawn, removed |
| `network.fork` | `status` (+ `forkDate`, `epoch`) | estimated, proposed, agreed, activated, cancelled |
| `upgrade.headliner` | `action` | proposed, selected, declined |
| `upgrade.deadline` | `stage` + `deadline` | proposed, considered, scheduled |

Calls cannot record `included` or `removed`. Every call event must quote its transcript within two minutes of its timestamp; `npm run verify` checks this in CI.

## Workflows

- `mirror.yml`, every 6 hours: `npm run mirror`, `npm test`, then commits `mirror/` and the bot events.
- `extract.yml`, hourly: drafts the oldest pending ACD call and opens a PR `calls/<ref>`. An empty events file is still a PR, so the call counts as read.
- `publish.yml`, on push, PRs and after each mirror run: tests, verifies call quotes, and deploys `dist/` to Pages from `main`.

## Commands

```
npm run mirror     # refresh snapshots and bot events (needs GITHUB_TOKEN for the API rate limit)
npm test           # unit tests, then compile dist/
npm run verify     # check every call quote against its transcript
npm run extract -- acde/247   # draft one call (needs ANTHROPIC_API_KEY; optional ANTHROPIC_BASE_URL, EXTRACT_MODEL)
```
