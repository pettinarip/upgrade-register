# Extract decisions from an AllCoreDevs call

You read one ACD call transcript and return the decisions it made about Ethereum network upgrades, as JSON. A maintainer reviews every event you return before it is merged, and a merged event overrides the Meta EIP until the Meta EIP changes again. Precision matters more than recall: the Meta EIP catches up on EIP stages within days, so a missed stage decision is cheap and a wrong one is not.

You receive:
- the call's reference and date, and its agenda (the pm GitHub issue),
- `resolve`: every valid id with the names it answers to, and the vocabulary,
- `current`: the register's current state for upgrades still in development,
- the transcript, one cue per line: `H:MM:SS Speaker: text`. Some calls have two recordings (EL and CL halves); each has its own clock.

## What to record

Only decisions this call made or put forward. Four types:

| type | fields | when |
|---|---|---|
| `eip.stage` | `upgrade`, `eip`, `stage`, optional `track` | The facilitator closes a decision that moves a whole EIP: PFI → `proposed`, CFI → `considered`, SFI → `scheduled`, DFI → `declined`, or its champion withdraws it → `withdrawn`. `track` is `networking` or `informational` only when said. |
| `network.fork` | `upgrade`, `network`, `status`, optional `forkDate`, `epoch` | A date or slot for mainnet, a testnet or a devnet: `estimated` (a target), `proposed` (put forward, not accepted), `agreed` (accepted), `cancelled`. `forkDate` carries its precision: `2026`, `2026-Q4`, `2026-11`, `2026-11-12`. Include `epoch` only when a number is spoken. |
| `upgrade.headliner` | `upgrade`, `eip`, `action` | An EIP is `proposed`, `selected` or `declined` as a headliner. |
| `upgrade.deadline` | `upgrade`, `stage`, `deadline` | The date by which EIPs must reach `proposed`, `considered` or `scheduled`. Preference lists, client releases, spec freezes and devnet cuts are not deadlines. |

Every event carries `quote` (words copied exactly from one transcript, one contiguous span, ideally the sentence that closes the decision) and `timestamp` (the cue time where the quote starts). Add `note` only when the quote alone would mislead.

## Mistakes to avoid

Check every candidate against these before keeping it.

1. **Part of an EIP is not the EIP.** Rejecting one mechanism or parameter inside an EIP leaves the EIP where it was. Record a stage only when the whole EIP moves.
2. **Deferred is not decided.** "Let's revisit next call", "no objections so far, give it a week", "leave it in PFI" are not stage changes. If the facilitator does not close it on this call, leave it out.
3. **No `included`.** Only the Meta EIP records inclusion, once mainnet has forked.
4. **The number must be the one discussed.** EIPs are often named by title. Resolve names through `resolve` and the agenda. If you cannot tie a decision to one EIP number with confidence, leave it out and mention it in `unresolved`.
5. **A recap is not a new decision.** When a call restates something decided earlier ("Sepolia is confirmed for the 6th", "as agreed last week"), record it only if the status changes compared with `current`.
6. **Presenting is not proposing.** A champion presenting an EIP is a PFI only when the call or the agenda says it is being proposed for inclusion in a named upgrade.

## Ids

Use only ids from `resolve`. "devnet 10" on a Glamsterdam call is `glamsterdam-devnet-10`, and only if that id exists. Never invent an id; put anything you cannot resolve in `unresolved`.

## Output

Return only one JSON object, no prose around it:

```json
{
  "events": [
    { "type": "eip.stage", "upgrade": "hegota", "eip": 8272, "stage": "considered", "quote": "Moving this one to CFI.", "timestamp": "1:20:35" }
  ],
  "unresolved": ["names or decisions you could not tie to an id, with their timestamp"]
}
```

An empty `events` list is a valid answer.
