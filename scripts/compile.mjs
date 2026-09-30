// Compiles every event into dist/. Current state is always the latest history row; nothing
// here changes data, and disagreements with upstream only go to dist/checks.json.

import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { subjectKey, validateEvent, VOCABULARY } from './lib/events.mjs';
import { buildHistory, orderEvents } from './lib/history.mjs';
import { renderIndexPage } from './lib/index-page.mjs';
import { jsonFiles, readJson, writeJson } from './lib/io.mjs';
import { NETWORKS, loadAliases, loadUpgrades } from './lib/registry.mjs';
import { SCHEMA_VERSION, outputProblems } from './lib/schema.mjs';

const EVENT_DIRS = ['events/meta', 'events/config', 'events/calls'];

const upgrades = loadUpgrades();
const aliases = loadAliases();
const devnets = readJson('mirror/devnets.json').devnets;
const metaState = readJson('mirror/meta-eips.json');
const configs = readJson('mirror/configs.json').configs;
const crossChecks = readJson('mirror/cross-checks.json');

const known = {
  upgrades: new Set(upgrades.map((u) => u.id)),
  networks: new Set([...Object.keys(NETWORKS), ...devnets.map((d) => d.id)]),
};

function loadEvents() {
  const events = [];
  const problems = [];
  for (const file of EVENT_DIRS.flatMap(jsonFiles)) {
    readJson(file).events.forEach((event, index) => {
      const found = validateEvent(event, known);
      if (found.length) problems.push(`${file} #${index}: ${found.join('; ')}`);
      events.push({ ...event, source: { ...event.source, file } });
    });
  }
  if (problems.length) throw new Error(`invalid events:\n${problems.join('\n')}`);
  return orderEvents(events);
}

function groupBySubject(events) {
  const subjects = new Map();
  for (const event of events) {
    const key = subjectKey(event);
    subjects.set(key, [...(subjects.get(key) ?? []), event]);
  }
  return [...subjects.values()].map((list) => ({ first: list[0], history: buildHistory(list) }));
}

const titleOf = (eip) => Object.values(metaState).map((m) => m.membership[eip]?.title).find(Boolean) ?? null;

const devnetUpgrade = (devnet) => aliases.devnetGroups[devnet.group] ?? null;

function eipEntry({ first, history }) {
  const current = history.at(-1);
  const lastListed = history.findLast((row) => row.stage !== 'removed');
  return {
    eip: first.eip,
    title: titleOf(first.eip),
    stage: current.stage,
    track: current.track,
    ...(current.stage === 'removed' && lastListed && { lastListed: lastListed.stage }),
    history,
  };
}

function forkEntry({ first, history }) {
  const { status, forkDate, epoch } = history.at(-1);
  return { network: first.network, status, forkDate, epoch, history };
}

// live once mainnet activated, upcoming once a public network has a slot, development once a
// devnet exists, planning once any EIP is scheduled, research otherwise.
function upgradeStatus(forks, eips, devnetCount) {
  const mainnet = forks.find((f) => f.network === 'mainnet');
  if (mainnet?.status === 'activated') return 'live';
  const publicNetworks = forks.filter((f) => f.network in NETWORKS);
  if (publicNetworks.some((f) => ['proposed', 'agreed', 'activated'].includes(f.status))) return 'upcoming';
  if (devnetCount) return 'development';
  if (eips.some((e) => e.stage === 'scheduled')) return 'planning';
  return 'research';
}

const describeSource = (source) => `${source.kind} ${source.ref} (${source.date})`;

// Every table that announces fork epochs, compared with the register's fork state.
function epochTables(upgrade) {
  const tables = [];
  for (const [network, shipped] of Object.entries(configs)) {
    const fork = shipped.forks[upgrade.id];
    if (fork) tables.push({ kind: 'epoch-differs-from-config', label: `${network} config`, network, epoch: fork.epoch });
  }
  for (const number of upgrade.metaEips) {
    for (const [network, row] of Object.entries(metaState[number]?.activations ?? {})) {
      tables.push({ kind: 'epoch-differs-from-meta-eip-activation-table', label: `EIP-${number} activation table`, network, epoch: row.epoch });
    }
  }
  for (const [network, row] of Object.entries(crossChecks.pmDeployments[upgrade.id]?.deployments ?? {})) {
    tables.push({ kind: 'epoch-differs-from-pm-deployment-table', label: `${upgrade.id}-pm.md`, network, epoch: row.epoch });
  }
  return tables.filter((t) => t.epoch != null);
}

// An activated fork can carry one epoch per layer (The Merge), so any row of its history counts.
const recordsEpoch = (fork, epoch) =>
  fork?.epoch === epoch || (fork?.status === 'activated' && fork.history.some((row) => row.epoch === epoch));

function checkAgainstUpstream(upgrade, eips, forks) {
  const checks = [];
  const flag = (kind, message, details) => checks.push({ kind, upgrade: upgrade.id, message, ...details });

  const listed = Object.assign({}, ...upgrade.metaEips.map((n) => metaState[n]?.membership ?? {}));
  for (const entry of eips) {
    const meta = listed[entry.eip];
    if (entry.stage === 'removed' && !meta) continue;
    if (!meta || entry.stage !== meta.stage || entry.track !== meta.track) {
      const since = describeSource(entry.history.at(-1).sources.at(-1));
      flag('stage-differs-from-meta-eip', `EIP-${entry.eip} is ${entry.stage} in the register (since ${since}); the Meta EIP ${meta ? `lists it as ${meta.stage}` : 'does not list it'}`, { eip: entry.eip });
    }
  }

  for (const table of epochTables(upgrade)) {
    const fork = forks.find((f) => f.network === table.network);
    if (!recordsEpoch(fork, table.epoch)) {
      const recorded = fork ? `${fork.status} at epoch ${fork.epoch ?? 'unknown'}` : 'no fork';
      flag(table.kind, `${table.network}: ${table.label} says epoch ${table.epoch}; the register has ${recorded}`, { network: table.network });
    }
  }

  const byEip = Object.fromEntries(eips.map((e) => [e.eip, e]));
  for (const eip of crossChecks.executionSpecs[upgrade.id]?.eips ?? []) {
    const stage = byEip[eip]?.stage;
    if (stage !== 'scheduled' && stage !== 'included') {
      flag('execution-specs-lists-unscheduled-eip', `execution-specs implements EIP-${eip} for ${upgrade.layers.execution}; the register has it as ${stage ?? 'absent'}`, { eip });
    }
  }
  return checks;
}

function compileUpgrade(upgrade, subjects) {
  const mine = subjects.filter((s) => s.first.upgrade === upgrade.id);
  const ofType = (type) => mine.filter((s) => s.first.type === type);

  const eips = ofType('eip.stage').map(eipEntry).sort((a, b) => a.eip - b.eip);
  const forks = ofType('network.fork').map(forkEntry);
  const headliners = ofType('upgrade.headliner').map(({ first, history }) => ({ eip: first.eip, title: titleOf(first.eip), action: history.at(-1).action, history }));
  const deadlines = ofType('upgrade.deadline').map(({ first, history }) => ({ stage: first.stage, deadline: history.at(-1).deadline, history }));
  const myDevnets = devnets.filter((d) => devnetUpgrade(d) === upgrade.id);

  return {
    upgrade: {
      id: upgrade.id,
      name: upgrade.name,
      type: upgrade.type,
      layers: upgrade.layers,
      metaEips: upgrade.metaEips,
      status: upgradeStatus(forks, eips, myDevnets.length),
      mainnet: forks.find((f) => f.network === 'mainnet') ?? null,
      testnets: forks.filter((f) => f.network !== 'mainnet' && f.network in NETWORKS),
      devnetForks: forks.filter((f) => !(f.network in NETWORKS)),
      devnets: myDevnets,
      headliners,
      deadlines,
      eips,
    },
    checks: checkAgainstUpstream(upgrade, eips, forks),
  };
}

function resolveTable(compiled) {
  const eipNumbers = new Set(compiled.flatMap((u) => u.eips.map((e) => e.eip)));
  return {
    note: 'Every id an event may use. Spoken names resolve through aliases; anything else is unresolved.',
    vocabulary: VOCABULARY,
    upgrades: upgrades.map((u) => ({
      id: u.id,
      name: u.name,
      aliases: [...new Set([u.name, u.layers.execution, u.layers.consensus, ...(aliases.upgrades[u.id] ?? [])].filter(Boolean))],
    })),
    networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, aliases: [n.name, ...(aliases.networks[id] ?? [])] })),
    devnets: devnets.map((d) => ({ id: d.id, upgrade: devnetUpgrade(d), aliases: aliases.devnets[d.id] ?? [] })),
    eips: [...eipNumbers].sort((a, b) => a - b).map((eip) => ({ eip, title: titleOf(eip), aliases: aliases.eips[eip] ?? [] })),
  };
}

function eipViews(compiled) {
  const views = {};
  for (const upgrade of compiled) {
    for (const { eip, title, ...entry } of upgrade.eips) {
      views[eip] ??= { eip, title, upgrades: [] };
      views[eip].upgrades.push({ upgrade: upgrade.id, ...entry });
    }
  }
  return Object.values(views);
}

const subjects = groupBySubject(loadEvents());
const results = upgrades.map((u) => compileUpgrade(u, subjects));
const compiled = results.map((r) => r.upgrade);
const checks = results.flatMap((r) => r.checks);

// Every output passes its schema before anything is written.
const generatedAt = new Date().toISOString();
const outputs = [
  ...compiled.map((upgrade) => ['upgrade', `upgrades/${upgrade.id}.json`, upgrade]),
  ...eipViews(compiled).map((view) => ['eip', `eips/${view.eip}.json`, view]),
  ['resolve', 'resolve.json', resolveTable(compiled)],
  ['checks', 'checks.json', { note: 'Where the register differs from its owners today. Flags only; nothing is changed.', count: checks.length, checks }],
  [
    'index',
    'index.json',
    {
      generatedAt,
      upgrades: compiled.map(({ id, name, status, mainnet, eips }) => ({ id, name, status, mainnet: mainnet && { status: mainnet.status, forkDate: mainnet.forkDate }, eips: eips.length })),
      networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, name: n.name })),
    },
  ],
].map(([kind, path, data]) => [kind, path, { schemaVersion: SCHEMA_VERSION, ...data }]);

const invalid = outputs.flatMap(([kind, path, data]) => outputProblems(kind, data).map((problem) => `${path}: ${problem}`));
if (invalid.length) throw new Error(`compiled output breaks the schema:\n${invalid.join('\n')}`);

rmSync('dist', { recursive: true, force: true });
for (const [, path, data] of outputs) writeJson(`dist/${path}`, data);
cpSync('schema', 'dist/schema', { recursive: true });
writeFileSync('dist/index.html', renderIndexPage({ upgrades: compiled, checkCount: checks.length, generatedAt, schemaVersion: SCHEMA_VERSION }));

console.log(`compiled ${compiled.length} upgrades, ${subjects.length} subjects, ${checks.length} checks`);
