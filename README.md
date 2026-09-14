# upgrade-register

Structured, sourced data about Ethereum network upgrades, laid out as it would sit inside `ethereum/pm`. Which EIPs are in each fork and when that was decided, when each devnet, testnet and mainnet forks, and what was cut for each devnet. Every row points at a commit, a config file, a spec page or a call recording.

## Layout

```
all-forks.json                 pm's fork registry, vendored unchanged
upgrades/
  events/<source>.json         the register: one file per call, Meta EIP or network config
  cuts/<devnet>.json           one cut sheet per devnet
  mirror/                      bot snapshots: networks, fork configs, EIP metadata, calls, Meta EIP list
  schema/schema.json           every input and output shape, shared definitions
  overrides.json               corrections and spoken nicknames
dist/                          compiled views, built in CI, published to GitHub Pages, not committed
```

Nothing under `upgrades/` is hand-written. Bots write the mirrors, cut sheets and config-derived events. Call decisions enter through agent-drafted pull requests that a maintainer merges.

## Rules

- Facts are events. Current state is compiled from them, never stored.
- Every event names its source: commit or PR, config file, or call ref with quote and recording timestamp.
- Dates carry their precision: `2027`, `2027-Q2`, `2026-12-02`. A fork date carries its certainty: estimated, proposed, agreed, activated.
- Fork state is ordered by when a fact was learned. An activation is terminal.
- Upgrade status is derived: live once mainnet activated, upcoming once a public testnet or mainnet slot is proposed or agreed, development once a devnet has been cut, planning once any EIP is scheduled, research otherwise.

## Sources

| Data | Source | Role |
|---|---|---|
| Upgrade registry: names, layers, Meta EIPs, mainnet activations | `ethereum/pm` all-forks.json | canonical |
| Current EIP inclusion | Hardfork Meta EIP in `ethereum/EIPs` | canonical |
| Historical EIP stage changes | Meta EIP git history and open PFI PRs | backfill, run once |
| Decisions, proposed slots, deadlines, estimates | AllCoreDevs calls | agent PR |
| Testnet fork activations | eth-clients `metadata/config.yaml` | bot events |
| Future fork slots in client configs | same, plus consensus-specs mainnet.yaml | validator |
| Devnets: existence, liveness | ethpandaops cartographoor | cut sheet |
| Devnets: genesis | ethpandaops network-configs repo | cut sheet |
| Devnets: spec releases, client builds, EIP list | ethpandaops spec page | cut sheet |
| EIP titles and upstream status | `ethereum/EIPs` frontmatter | mirror |
| Call list with transcript and summary URLs | `ethereum/pm` ACDbot manifest | feeds the agent |

## Event types

`eip.stage` (proposed, considered, scheduled, declined, included, withdrawn; optional networking or informational track), `upgrade.headliner` (proposed, presented, selected, declined), `network.fork` (estimated, proposed, agreed, activated, cancelled; optional epoch, slot, block), `upgrade.deadline` (the stage an EIP must reach by a date).

## Output

| File | Contents |
|---|---|
| `dist/upgrades/<id>.json` | one upgrade: status, mainnet and testnet fork state with history, cuts, deadlines, headliners, every EIP with dated stage history |
| `dist/eips/<n>.json` | one EIP across upgrades |
| `dist/index.json` | upgrades and networks |
| `dist/resolve.json` | name-to-id table for agents |
| `dist/maintenance/backlog.json` | facts lacking a call reference; the agent's work queue, not part of the contract |
| `dist/maintenance/validation.json` | where the register and upstream disagree; not part of the contract |

Every compiled file carries `schemaVersion`, currently `1`, bumped only for a breaking change. The build validates its output against the `dist*` definitions in `upgrades/schema/schema.json` and exits non-zero on a mismatch.

## Automation

- `mirror.yml`, every 6 hours: refreshes `all-forks.json`, mirrors, cut sheets and config-derived activations. Commits to `main`.
- `extract-call.yml`, hourly: picks the oldest ACD call with a transcript and no events file, runs the agent with `agent/extract-call.md`, opens a PR.
- `ci.yml`: validates and compiles `dist/`.

## Commands

```
npm test              # validate + build + checks
npm run fetch         # refresh registry, mirrors, cuts, activations (GITHUB_TOKEN or gh auth)
npm run backfill      # one-off Meta EIP history seed
node scripts/new-calls.mjs   # calls waiting for extraction
```

## Known gaps

- Forward-looking schedule data depends on call extraction. One call has been extracted, committed as agent output awaiting review.
- Meta EIP history dates decisions by PR merge, days after the call.
- EIPs a call declines without reading their numbers aloud are not recoverable from the transcript.
- Cut sheets depend on the spec page having an EIP table and a client readiness table.
- Mainnet forks activated by block number without a timestamp in all-forks.json carry the block but no date.
- Recording links assume the published video keeps the transcript lead-in.
