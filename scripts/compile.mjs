// Compiles every event into dist/. Current state is always the latest history row; nothing
// here changes data, and disagreements with upstream only go to dist/checks.json.

import { rmSync, writeFileSync } from 'node:fs';
import { subjectKey, validateEvent, VOCABULARY } from './lib/events.mjs';
import { buildHistory, orderEvents } from './lib/history.mjs';
import { renderIndexPage } from './lib/index-page.mjs';
import { jsonFiles, readJson, writeJson } from './lib/io.mjs';
import { NETWORKS, loadAliases, loadUpgrades } from './lib/registry.mjs';

const EVENT_DIRS = ['events/meta', 'events/config', 'events/calls'];

const upgrades = loadUpgrades();
const aliases = loadAliases();
const devnets = readJson('mirror/devnets.json').devnets;
const metaState = readJson('mirror/meta-eips.json');
const configs = readJson('mirror/configs.json').configs;

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

function checkAgainstUpstream(upgrade, eips, forks) {
  const checks = [];
  const listed = Object.assign({}, ...upgrade.metaEips.map((n) => metaState[n]?.membership ?? {}));
  for (const entry of eips) {
    const meta = listed[entry.eip];
    const metaStage = meta?.stage ?? 'removed';
    const metaTrack = meta?.track ?? 'core';
    if (entry.stage === 'removed' && !meta) continue;
    if (entry.stage !== metaStage || (meta && entry.track !== metaTrack)) {
      const latest = entry.history.at(-1).sources.at(-1);
      checks.push({
        kind: 'stage-differs-from-meta-eip',
        upgrade: upgrade.id,
        eip: entry.eip,
        register: entry.stage,
        metaEip: meta ? meta.stage : 'not listed',
        since: `${latest.kind} ${latest.ref} (${latest.date})`,
      });
    }
  }
  for (const fork of forks) {
    const shipped = configs[fork.network]?.forks[upgrade.id];
    if (shipped && fork.epoch != null && shipped.epoch !== fork.epoch) {
      checks.push({ kind: 'epoch-differs-from-config', upgrade: upgrade.id, network: fork.network, register: fork.epoch, config: shipped.epoch });
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
    vocabulary: Object.fromEntries(Object.entries(VOCABULARY).map(([type, v]) => [type, v.meaning ?? v.values])),
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

rmSync('dist', { recursive: true, force: true });
for (const upgrade of compiled) writeJson(`dist/upgrades/${upgrade.id}.json`, upgrade);
for (const view of eipViews(compiled)) writeJson(`dist/eips/${view.eip}.json`, view);
writeJson('dist/resolve.json', resolveTable(compiled));
writeJson('dist/checks.json', { note: 'Where the register differs from the current upstream snapshot. Flags only; nothing is changed.', count: checks.length, checks });
const generatedAt = new Date().toISOString();
writeFileSync('dist/index.html', renderIndexPage({ upgrades: compiled, checkCount: checks.length, generatedAt }));
writeJson('dist/index.json', {
  generatedAt,
  upgrades: compiled.map(({ id, name, status, mainnet, eips }) => ({ id, name, status, mainnet: mainnet && { status: mainnet.status, forkDate: mainnet.forkDate }, eips: eips.length })),
  networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, name: n.name })),
});

console.log(`compiled ${compiled.length} upgrades, ${subjects.length} subjects, ${checks.length} checks`);
