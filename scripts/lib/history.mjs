// The compile rules: order events, collapse them into history rows, and take the latest row.

const CHANNEL_ORDER = { call: 0, 'meta-eip': 1, config: 1 };

// By date; on the same date a bot event applies after a call event, since the Meta EIP and
// client configs are the formal record.
export function orderEvents(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) =>
      a.event.date.localeCompare(b.event.date) ||
      CHANNEL_ORDER[a.event.source.kind] - CHANNEL_ORDER[b.event.source.kind] ||
      a.index - b.index,
    )
    .map(({ event }) => event);
}

const trackOf = (event) => event.track ?? 'core';

const epochsCompatible = (a, b) => a.epoch == null || b.epoch == null || a.epoch === b.epoch;

// Two consecutive events with the same value belong to the same history row.
const SAME_VALUE = {
  'eip.stage': (a, b) => a.stage === b.stage && trackOf(a) === trackOf(b),
  'network.fork': (a, b) => a.status === b.status && a.forkDate === b.forkDate && epochsCompatible(a, b),
  'upgrade.headliner': (a, b) => a.action === b.action,
  'upgrade.deadline': (a, b) => a.deadline === b.deadline,
};

function rowValue(event) {
  switch (event.type) {
    case 'eip.stage':
      return { stage: event.stage, track: trackOf(event) };
    case 'network.fork':
      return { status: event.status, forkDate: event.forkDate ?? null, epoch: event.epoch ?? null };
    case 'upgrade.headliner':
      return { action: event.action };
    case 'upgrade.deadline':
      return { stage: event.stage, deadline: event.deadline };
  }
}

const sourceOf = (event) => ({ date: event.date, ...event.source });

// Events must share one subject and be ordered. Each row is dated by its earliest event.
export function buildHistory(events) {
  const rows = [];
  let previous = null;
  for (const event of events) {
    const row = rows.at(-1);
    if (row && SAME_VALUE[event.type](previous, event)) {
      row.sources.push(sourceOf(event));
      if (row.epoch === null && event.epoch != null) row.epoch = event.epoch;
    } else {
      rows.push({ ...rowValue(event), date: event.date, sources: [sourceOf(event)] });
    }
    previous = event;
  }
  return rows;
}
