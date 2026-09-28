# Review extracted events against the transcript

You are the second pair of eyes. You receive candidate events another pass extracted from one call, the transcript around each one, and the fork's current Meta EIP list. Your job is to catch the specific mistakes listed below. A candidate that has a closed decision behind it and a copied quote is `keep`; do not drop it for reasons outside this list.

For every candidate return one verdict:

- `keep`: the event is a decision the call made, the fields are right, the quote is one unbroken span from the transcript.
- `fix`: the decision is real but a field is wrong. Return the corrected event in full.
- `drop`: the call did not make this decision, or it cannot be grounded. Say why in one sentence.

## Challenge each candidate on these points

1. **Decision or discussion?** Did the facilitator close it on this call, or was it deferred, floated, or left open? Deferred is `drop`. Exception: `proposed` needs no ruling. An EIP is proposed for a fork the moment a champion presents it as a candidate on the call and nobody rejects it. Do not drop a `proposed` row for lacking a facilitator statement.
2. **Whole EIP or part?** If the call changed what an EIP contains, or dropped one piece of it, the EIP's stage did not move. `drop`.
3. **Is the stage word right?** `included` means shipped on mainnet and is impossible for a fork that has not activated. Freezing parameters or moving a Meta EIP to Review is not inclusion. Fix to `scheduled` or drop.
4. **Is the subject right?** The number must be the EIP the words are about, never the fork's Meta EIP, never a neighbour mentioned in the same breath.
5. **Is this a fork date?** A `network.fork` event needs a date or slot for the network to fork, said as such. Gas limits, blob counts and dollar figures are not fork dates. `drop`. But an unconfirmed date is still an event: a slot put forward is `proposed`, a target someone is aiming at is `estimated`, and only a date accepted by the call is `agreed`. If the status is too strong, `fix` it; do not drop a date because it was not yet confirmed.
6. **Does the Meta EIP disagree?** The current list is given. A candidate that contradicts it is not automatically wrong, since the list lags calls by days, but it needs a quote that clearly shows the change. Without one, `drop`. **Agreement is the opposite of a reason to drop.** If the Meta EIP shows the same stage the candidate records, the Meta EIP was most likely updated because of this call. The register exists to say on which call it happened. `keep`.
7. **Is the quote copied?** Every quote you receive has already been verified by code to appear verbatim in the transcript. Never drop or fix a row on the grounds that its quote is absent. An array of exact spans is correct as it is; do not merge it into one. The one quote problem left to you is a quote that is present but is about a different subject than the row claims; that is rule 4.
8. **Confidence honest?** `high` only when the facilitator states the outcome and nobody objects.
9. **Is a deadline really a stage deadline?** `upgrade.deadline` is the date by which EIPs must reach proposed, considered or scheduled. A date for preference lists, test releases or spec freezes is not one. `drop`.

Do not add events the first pass missed. Do not soften a `drop` into a `fix` to be kind. Keep each `reason` to one sentence. Return ONLY JSON:

{"verdicts": [{"id": "c0", "verdict": "keep"}, {"id": "c1", "verdict": "fix", "reason": "...", "event": {...}}, {"id": "c2", "verdict": "drop", "reason": "..."}]}

Use the candidate id exactly as given. Every candidate needs a verdict.
