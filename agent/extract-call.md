# Extract upgrade events from a protocol call

You are given one AllCoreDevs call: `$CALL_REF`. Look it up in `upgrades/mirror/calls.json` for its date, issue URL, transcript, chat and summary. Produce exactly one file, `upgrades/events/<date>-<series>-<number>.json`, valid against the `events` definition in `upgrades/schema/schema.json`, then run `npm test`.

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

**Never invent an id.** If a name is not in the table, do not guess and do not coin a new one. Leave the event out and list the name under Unresolved in your output. An EIP number that is real but missing from the table is fine. Record it.

## What counts as an event

Record only decisions the call made. Every event carries a verbatim `quote` and a `timestamp` from the transcript.

- `eip.stage`: an EIP moved to proposed, considered, scheduled, declined, included or withdrawn for a named upgrade. Set `track` to networking or informational when the call says so.
- `upgrade.headliner`: an EIP was proposed, presented, selected or declined as a headliner.
- `network.fork`: a fork slot or date for a devnet, testnet or mainnet. Use `estimated` for a target someone is aiming at, `proposed` for a slot put forward, `agreed` once accepted, `activated` once it has happened. Include `epoch`, `slot` or `block` whenever a number is spoken. **A date does not need to be confirmed to be an event.** "The proposal is to fork Sepolia on the 28th", "we're floating Hoodi for end of October, not confirmed yet" are `proposed`. Record them; the later call that confirms or moves the date is a separate event. Only skip a date when no slot or date for the network was actually put forward.
- `upgrade.deadline`: the date by which EIPs must reach proposed, considered or scheduled for an upgrade. Dates for preference lists, test releases, devnet cuts or spec freezes are not deadlines here.

## The mistakes to avoid

Each of these has happened. Check every candidate event against all five before you keep it.

**A decision about part of an EIP is not a decision about the EIP.** "We're dropping the SELFDESTRUCT refund change from 8037" and "there's no support for this, we're going ahead with not implementing it" about one mechanism inside 8037 both leave 8037 scheduled. Only record a stage change when the whole EIP moves. Before writing `declined`, ask: is the EIP number leaving the fork, or is one piece of it changing? If the Meta EIP still lists it and the words are about a piece, it is not an event.

**Deferred is not decided.** "Let's CFI 8365 next call", "we'll come back to this", "no objections so far but let's give it a week" are not stage changes. If the facilitator does not close the decision on this call, do not record it.

**`included` means shipped on mainnet.** Nothing is included until the fork is live. Calls that freeze parameters, confirm test coverage or move a Meta EIP to Review are not inclusion. For a fork that has not activated, the highest stage is `scheduled`.

**The Meta EIP is a list, not a member.** Never record a stage event whose EIP number is the fork's own Hardfork Meta EIP.

**A number in a fork conversation is not a fork date.** Gas limits, blob counts, epoch arithmetic and dollar figures come up right next to slot discussions. A `network.fork` event needs a date or slot for the network to fork, stated as such.

Also: record every PFI the call takes. An EIP becomes `proposed` when its champion presents it as a candidate for the fork and nobody rejects it; no facilitator ruling is needed for that stage. The stages above `proposed` do need one. Do not record intentions, "we should", or anything only in the pre-call summary and not in the transcript. Upgrade status is derived by the build, never recorded.

## Quotes

**A quote is copied, not composed.** One unbroken run of words exactly as they appear in the transcript, including filler and false starts. Never join two moments with an ellipsis, never tidy the grammar, never summarise. If a decision needs two separate moments, use an array: `"quote": ["...first span...", "...second span..."]`, each copied exactly. Quotes are checked against the transcript and events whose quotes cannot be found are discarded.

**Batch decisions.** When one cue names several EIPs and a later cue decides them ("DFI for all four"), write one event per EIP. `quote` points at the cue naming the EIP; put the deciding cue and its timestamp in `note`.

**Restatements.** When a facilitator restates an earlier decision ("we SFI'd this two weeks ago"), that is not a new event. Skip it.

**Transcript over chat.** The chat log is corroboration only. Chat agreement with no spoken decision is not an event.

## Fields

Use only the fields the schema defines. Keep `note` to one short sentence, and only when something needs explaining. No `ref`, `url`, `source` or `reasoning` fields on events.

- `date` is what the event refers to: the decision date for a stage change, the fork date for a fork. It may be less precise than a day (`2027-Q2`, `2026-12`).
- `confidence`: `high` when the facilitator states the outcome and nobody objects, `medium` when the facilitator states it after a contested discussion or a split poll, `low` when the outcome itself is unclear. Never drop a low-confidence event, flag it.
- Source is `{ "kind": "call", "ref": "<series>/<number>", "url": "<pm issue url>", "date": "<call date>" }` and `recordedBy` is `"agent"`.
- If the call made no upgrade decisions, write nothing and print `NO_EVENTS`.

## Output for the reviewer

Print a checklist, one line per event: the summary, the confidence, the quote, and a link to the recording at that moment (`<videoUrl>&t=<seconds>`). Then an Unresolved section listing any name you could not map.
