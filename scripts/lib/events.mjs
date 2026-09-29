// The event vocabulary and the one validator every event passes through.

export const VOCABULARY = {
  'eip.stage': {
    field: 'stage',
    values: ['proposed', 'considered', 'scheduled', 'declined', 'included', 'withdrawn', 'removed'],
    meaning: {
      proposed: 'PFI',
      considered: 'CFI',
      scheduled: 'SFI',
      declined: 'DFI',
      included: 'shipped on mainnet (Meta EIP only)',
      withdrawn: 'withdrawn by its champion',
      removed: 'no longer listed in the Meta EIP (Meta EIP only)',
    },
  },
  'network.fork': {
    field: 'status',
    values: ['estimated', 'proposed', 'agreed', 'activated', 'cancelled'],
    meaning: {
      estimated: 'a target someone is aiming at',
      proposed: 'a date or slot put forward, not accepted yet',
      agreed: 'accepted on a call, or shipped in a client config',
      activated: 'the fork happened',
      cancelled: 'a previously planned fork date was dropped',
    },
  },
  'upgrade.headliner': { field: 'action', values: ['proposed', 'selected', 'declined'] },
  'upgrade.deadline': { field: 'stage', values: ['proposed', 'considered', 'scheduled'] },
};

export const TRACKS = ['core', 'networking', 'informational'];

const SOURCE_KINDS = ['meta-eip', 'config', 'call'];
const CALL_ONLY_FORBIDDEN_STAGES = ['included', 'removed'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Dates carry their precision: 2027, 2027-Q2, 2027-06, 2027-06-16.
const FUZZY_DATE = /^\d{4}(-Q[1-4]|-\d{2}(-\d{2})?)?$/;
const TIMESTAMP = /^(\d+:)?\d{1,2}:\d{2}$/;

export function subjectKey(event) {
  switch (event.type) {
    case 'eip.stage':
    case 'upgrade.headliner':
      return `${event.type}|${event.upgrade}|${event.eip}`;
    case 'network.fork':
      return `${event.type}|${event.upgrade}|${event.network}`;
    case 'upgrade.deadline':
      return `${event.type}|${event.upgrade}|${event.stage}`;
  }
}

// Returns a list of problems; empty means valid. `known` holds the ids events may refer to.
export function validateEvent(event, known) {
  const problems = [];
  const need = (condition, message) => condition || problems.push(message);

  const vocabulary = VOCABULARY[event.type];
  need(vocabulary, `unknown type ${event.type}`);
  if (!vocabulary) return problems;

  need(vocabulary.values.includes(event[vocabulary.field]), `${vocabulary.field} "${event[vocabulary.field]}" not in ${vocabulary.values}`);
  need(DAY.test(event.date ?? ''), `date "${event.date}" is not YYYY-MM-DD`);
  need(known.upgrades.has(event.upgrade), `unknown upgrade "${event.upgrade}"`);

  if (event.type === 'eip.stage' || event.type === 'upgrade.headliner') need(Number.isInteger(event.eip), 'eip must be a number');
  if (event.type === 'eip.stage' && event.track) need(TRACKS.includes(event.track), `track "${event.track}" not in ${TRACKS}`);
  if (event.type === 'network.fork') {
    need(known.networks.has(event.network), `unknown network "${event.network}"`);
    if (event.forkDate != null) need(FUZZY_DATE.test(event.forkDate), `forkDate "${event.forkDate}" has no valid precision`);
    if (event.epoch != null) need(Number.isInteger(event.epoch), 'epoch must be an integer');
  }
  if (event.type === 'upgrade.deadline') need(FUZZY_DATE.test(event.deadline ?? ''), `deadline "${event.deadline}" has no valid precision`);

  const source = event.source ?? {};
  need(SOURCE_KINDS.includes(source.kind), `source.kind "${source.kind}" not in ${SOURCE_KINDS}`);
  need(source.ref, 'source.ref is required');
  if (source.kind === 'call') {
    need(source.quote, 'call events need a verbatim quote');
    need(TIMESTAMP.test(source.timestamp ?? ''), `timestamp "${source.timestamp}" is not H:MM:SS`);
    need(!CALL_ONLY_FORBIDDEN_STAGES.includes(event.stage) || event.type !== 'eip.stage', `a call cannot record stage "${event.stage}"`);
  }
  return problems;
}
