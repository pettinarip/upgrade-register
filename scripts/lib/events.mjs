// What events mean, how they group into subjects, and the checks the schema cannot express.

import { eventProblems } from './schema.mjs';

// Meanings for resolve.json and the extraction prompt. The allowed values live in the schema;
// test/schema.test.mjs keeps the two in step.
export const VOCABULARY = {
  'eip.stage': {
    proposed: 'PFI',
    considered: 'CFI',
    scheduled: 'SFI',
    declined: 'DFI',
    included: 'shipped on mainnet (Meta EIP only)',
    withdrawn: 'withdrawn by its champion',
    removed: 'no longer listed in the Meta EIP (Meta EIP only)',
  },
  'network.fork': {
    estimated: 'a target someone is aiming at',
    proposed: 'a date or slot put forward, not accepted yet',
    agreed: 'accepted on a call, or shipped in a client config',
    activated: 'the fork happened',
    cancelled: 'a previously planned fork date was dropped',
  },
  'upgrade.headliner': {
    proposed: 'put forward as a headliner',
    selected: 'chosen as a headliner',
    declined: 'not chosen as a headliner',
  },
  'upgrade.deadline': {
    proposed: 'EIPs must be PFI by this date',
    considered: 'EIPs must be CFI by this date',
    scheduled: 'EIPs must be SFI by this date',
  },
};

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

// Schema problems first; only a well-formed event is checked for ids. `known` holds the ids
// events may refer to.
export function validateEvent(event, known) {
  const problems = eventProblems(event);
  if (problems.length) return problems;
  if (!known.upgrades.has(event.upgrade)) problems.push(`unknown upgrade "${event.upgrade}"`);
  if (event.network && !known.networks.has(event.network)) problems.push(`unknown network "${event.network}"`);
  return problems;
}
