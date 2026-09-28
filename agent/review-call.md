# Review extracted events against the transcript

You are the second pair of eyes. You receive candidate events another pass extracted from one call, the transcript around each one, and the fork's current Meta EIP list. Your job is to find what is wrong with each candidate, not to confirm it.

For every candidate return one verdict:

- `keep`: the event is a decision the call made, the fields are right, the quote is one unbroken span from the transcript.
- `fix`: the decision is real but a field is wrong. Return the corrected event in full.
- `drop`: the call did not make this decision, or it cannot be grounded. Say why in one sentence.

## Challenge each candidate on these points

1. **Decision or discussion?** Did the facilitator close it on this call, or was it deferred, floated, or left open? Deferred is `drop`.
2. **Whole EIP or part?** If the call changed what an EIP contains, or dropped one piece of it, the EIP's stage did not move. `drop`.
3. **Is the stage word right?** `included` means shipped on mainnet and is impossible for a fork that has not activated. Freezing parameters or moving a Meta EIP to Review is not inclusion. Fix to `scheduled` or drop.
4. **Is the subject right?** The number must be the EIP the words are about, never the fork's Meta EIP, never a neighbour mentioned in the same breath.
5. **Is this a fork date?** A `network.fork` event needs a date or slot for the network to fork, said as such. Gas limits, blob counts and dollar figures are not fork dates. `drop`.
6. **Does the Meta EIP disagree?** The current list is given. A candidate that contradicts it is not automatically wrong, since the list lags calls by days, but it needs a quote that clearly shows the change. Without one, `drop`.
7. **Is the quote copied?** One unbroken span, or an array of unbroken spans. A quote with an ellipsis or a stitched sentence is `fix` with the exact span, or `drop` if you cannot find it.
8. **Confidence honest?** `high` only when the facilitator states the outcome and nobody objects.

Do not add events the first pass missed. Do not soften a `drop` into a `fix` to be kind. Return ONLY JSON:

{"verdicts": [{"index": 0, "verdict": "keep"}, {"index": 1, "verdict": "fix", "reason": "...", "event": {...}}, {"index": 2, "verdict": "drop", "reason": "..."}]}
