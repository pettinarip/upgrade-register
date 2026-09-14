# Extract upgrade events from a protocol call

You are given one AllCoreDevs call: `$CALL_REF`. Look it up in `upgrades/mirror/calls.json` for its date, issue URL, transcript, chat and summary. Produce exactly one file, `upgrades/events/<date>-<series>-<number>.json`, valid against `upgrades/schema/schema.json (the `events` definition)`, then run `npm test`.

Read `dist/resolve.json` first. It is the only place ids come from.

## Mapping what was said to the data shape

People on a call say "Amsterdam", "FOCIL", "devnet 10", "let's PFI it". None of those are ids. Resolve every one of them through `dist/resolve.json`, which lists every valid id with the names it answers to.

| Spoken | Field | How to resolve |
|---|---|---|
| "Glamsterdam", "Amsterdam", "Gloas" | `upgrade` | `upgrades[].aliases`. Layer names resolve to the combined upgrade. |
| "FOCIL", "the BAL EIP", "7805" | `eip` | `eips[].aliases`. Always record the number, never the nickname. |
| "Sepolia", "Hoodi", "mainnet" | `network` | `networks[].aliases`. |
| "devnet 10", "the next devnet" | `network` | `devnets[]`, using the upgrade under discussion as the context. "devnet 10" on a Glamsterdam call is `glamsterdam-devnet-10`. "The next devnet" is only an id if someone names its number. |
| "PFI", "CFI", "SFI", "DFI" | `stage` | `vocabulary["eip.stage"]`. |
| "aiming for December", "the slot is locked in" | `status` | `vocabulary["network.fork"]`. |

**Never invent an id.** If a name is not in the table, do not guess and do not coin a new one. Leave the event out and list the name under Unresolved in your output, so a maintainer can add it to `upgrades/overrides.json`. The build rejects an unknown upgrade or network, so a guess fails CI rather than landing quietly.

An EIP number that is real but missing from the table is fine. Record it. The next mirror run fetches its title.

## What counts as an event

Record only decisions the call made or facts it confirmed. Every event carries a verbatim `quote` and a `timestamp` from the transcript.

- `eip.stage`: an EIP moved to proposed, considered, scheduled, declined, included or withdrawn for a named upgrade. Set `track` to networking or informational when the call says so.
- `upgrade.headliner`: an EIP was proposed, presented, selected or declined as a headliner.
- `network.fork`: a fork slot or date for a devnet, testnet or mainnet. Use `estimated` for a target someone is aiming at, `proposed` for a slot put forward, `agreed` once accepted, `activated` once it has happened. Include `epoch`, `slot` or `block` whenever a number is spoken.

Do not record: intentions, "we should", anything deferred to a later call, or anything that appears only in the pre-call summary and not in the transcript. Upgrade status is derived by the build, never recorded.

- `upgrade.deadline`: a PFI, CFI or SFI cut-off date stated for an upgrade.

**Transcript over chat.** The chat log ships with the call, but it is corroboration only. Chat agreement with no spoken decision is not an event. If the summary claims a decision the transcript does not contain, follow the transcript and say so under Notes.

**A decision is recorded once, on the call that made it.** When a facilitator restates an earlier decision ("we SFI'd this two weeks ago"), that is not a new event. The register already has it from the Meta EIP or the earlier call. Skip it.

**Batch decisions.** When one cue names several EIPs and a later cue decides them ("DFI for all four"), write one event per EIP. `quote` and `timestamp` point at the cue that names the EIP; put the deciding cue and its timestamp in `note`.

## Fields

- `date` is what the event refers to: the decision date for a stage change, the fork date for a fork. It may be less precise than a day (`2027-Q2`, `2026-12`).
- `observedAt` is only needed when it differs from the call date, which is rare. Omit it.
- `confidence`: `high` when the facilitator states the outcome and nobody objects, `medium` when the facilitator states it after a contested discussion or a split poll, `low` when the outcome itself is unclear. Never drop a low-confidence event, flag it.
- Source is `{ "kind": "call", "ref": "<series>/<number>", "url": "<pm issue url>", "date": "<call date>" }` and `recordedBy` is `"agent"`.
- If the call made no upgrade decisions, write nothing and print `NO_EVENTS`.

## Output for the reviewer

Print a checklist, one line per event: the summary, the confidence, the quote, and a link to the recording at that moment (`<videoUrl>&t=<seconds>`). The transcript clock may start before the published video does; say in Notes if you could not verify the offset. Then an Unresolved section listing any name you could not map. This becomes the pull request body, and it is what the maintainer checks against the recording.
