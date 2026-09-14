// Validates the register against upgrades/schema and compiles the connected views into dist/.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadUpgrades, readJson } from './lib.mjs';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(readJson('upgrades/schema/schema.json'));
const v = new Proxy({}, { get: (_, name) => ajv.getSchema(`schema.json#/$defs/${name}`) ?? ajv.compile({ $ref: `schema.json#/$defs/${name}` }) });
// Bump only for a breaking change to a compiled shape. Consumers pin on this.
const SCHEMA_VERSION = 1;
const errors = [], outErrors = [];
const check = (kind, label, data) => { if (!v[kind](data)) errors.push(`${label}: ${ajv.errorsText(v[kind].errors, { separator: '\n  ' })}`); };
const emit = (path, kind, body) => {
  const data = { schemaVersion: SCHEMA_VERSION, ...body };
  if (!v[kind](data)) outErrors.push(`dist/${path}: ${ajv.errorsText(v[kind].errors, { separator: '\n  ' })}`);
  writeFileSync(join('dist', path), JSON.stringify(data, null, 2) + '\n');
};
// Maintainer files: the agent's work queue and the pm gap list. Not part of the consumer contract.
const maintenance = (path, body) => writeFileSync(join('dist/maintenance', path), JSON.stringify(body, null, 2) + '\n');

// Inputs. all-forks.json is pm's and is the registry; everything else is a mirror or the register itself.
check('allForks', 'all-forks.json', readJson('all-forks.json'));
const overrides = readJson('upgrades/overrides.json'); check('overrides', 'upgrades/overrides.json', overrides);
const merge = (item, o) => (o ? { ...item, ...o, ...(o.layers && { layers: { ...item.layers, ...o.layers } }) } : item);
const upgrades = loadUpgrades().map((u) => merge(u, overrides.upgrades?.[u.id])).filter((u) => !u.hidden);
const networks = readJson('upgrades/mirror/networks.json').networks.map((n) => merge(n, overrides.networks?.[n.id]));
networks.forEach((n) => check('network', `networks.json ${n.id}`, n));
const cuts = readdirSync('upgrades/cuts').filter((f) => f.endsWith('.json')).map((f) => { const c = readJson(join('upgrades/cuts', f)); check('cut', `upgrades/cuts/${f}`, c); return merge(c, overrides.devnets?.[c.id]); });
const eipMeta = readJson('upgrades/mirror/eips.json').eips;
const metaEips = readJson('upgrades/mirror/meta-eips.json', { metaEips: [] }).metaEips;
const forkConfigs = readJson('upgrades/mirror/fork-configs.json', { configs: {} }).configs;

const upgradeIds = new Set(upgrades.map((u) => u.id));
const networkIds = new Set([...networks.map((n) => n.id), ...cuts.map((c) => c.id)]);
const events = [];
for (const f of readdirSync('upgrades/events').filter((f) => f.endsWith('.json'))) {
  const file = join('upgrades/events', f), data = readJson(file);
  check('events', file, data);
  data.events?.forEach((ev, i) => {
    if (!upgradeIds.has(ev.upgrade)) errors.push(`${file} #${i}: unknown upgrade ${ev.upgrade}`);
    if (ev.type === 'network.fork' && !networkIds.has(ev.network)) errors.push(`${file} #${i}: unknown network ${ev.network}`);
    events.push({ ...ev, source: data.source, recordedBy: data.recordedBy, file: `upgrades/events/${f}`, observedAt: ev.observedAt ?? data.source.date ?? ev.date });
  });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// '2027-Q2' has to sort next to '2027-04', not after every month of 2027.
const sortKey = (d) => (d ?? '').replace(/-Q([1-4])/, (_, q) => `-${String((q - 1) * 3 + 1).padStart(2, '0')}`);
const by = (field) => (a, b) => (sortKey(a[field]) < sortKey(b[field]) ? -1 : sortKey(a[field]) > sortKey(b[field]) ? 1 : 0);
events.sort(by('date'));
const src = (e) => ({ kind: e.source.kind, ref: e.ref ?? e.source.ref ?? null, url: e.url ?? e.source.url ?? null, file: e.file, recordedBy: e.recordedBy, confidence: e.confidence, ...(e.quote && { quote: e.quote }), ...(e.timestamp && { timestamp: e.timestamp }), ...(e.note && { note: e.note }) });
const title = (n) => eipMeta[n]?.title ?? null;
const daysApart = (a, b) => Math.abs((Date.parse(sortKey(a)) - Date.parse(sortKey(b))) / 864e5);

// A call event and a Meta EIP event for the same change are one fact with two sources.
function history(list, key) {
  const rows = [];
  for (const e of list) {
    const last = rows[rows.length - 1];
    if (last && last[key] === e[key] && (last.track ?? 'core') === (e.track ?? 'core') && e.date && last.date && daysApart(e.date, last.date) <= 45 && !last.sources.some((s) => s.kind === e.source.kind && s.ref === (e.ref ?? e.source.ref))) {
      last.sources.push(src(e));
      if (e.source.kind === 'call') last.date = e.date; // the call is when it was decided
      continue;
    }
    rows.push({ [key]: e[key], ...(e.track && { track: e.track }), date: e.date, ...(e.epoch != null && { epoch: e.epoch }), ...(e.slot != null && { slot: e.slot }), ...(e.block != null && { block: e.block }), sources: [src(e)] });
  }
  return rows;
}
const cutRow = ({ id, group, active, genesis, eips, configUrl, specUrl, specs, clients }) => ({ id, group, active, genesis, eips, configUrl, specUrl, specs, clients: clients.length });

rmSync('dist', { recursive: true, force: true });
for (const d of ['upgrades', 'eips', 'maintenance']) mkdirSync(join('dist', d), { recursive: true });
const eipViews = {}, index = [], validation = [];

for (const u of upgrades) {
  const mine = events.filter((e) => e.upgrade === u.id);
  const eips = {};
  for (const [eip, list] of Object.entries(Object.groupBy(mine.filter((e) => e.type === 'eip.stage'), (e) => e.eip))) {
    const h = history(list, 'stage'), cur = h[h.length - 1];
    eips[eip] = { eip: Number(eip), title: title(eip), layer: eipMeta[eip]?.layer ?? null, stage: cur.stage, track: cur.track ?? 'core', history: h };
  }
  const headliners = Object.entries(Object.groupBy(mine.filter((e) => e.type === 'upgrade.headliner'), (e) => e.eip)).map(([eip, list]) => ({ eip: Number(eip), title: title(eip), selected: list.some((e) => e.action === 'selected'), history: history(list, 'action') }));
  const deadlines = Object.values(Object.groupBy(mine.filter((e) => e.type === 'upgrade.deadline'), (e) => e.stage)).map((list) => { const h = history([...list].sort(by('observedAt')), 'stage'); const cur = h[h.length - 1]; return { stage: cur.stage, date: cur.date, sources: h.flatMap((r) => r.sources) }; });
  // A fork's date is in the future, so recency means when we learned it. An activation is settled and outranks anything learned later.
  const forks = Object.fromEntries(Object.entries(Object.groupBy(mine.filter((e) => e.type === 'network.fork'), (e) => e.network)).map(([id, list]) => {
    const h = history([...list].sort(by('observedAt')), 'status');
    const current = h.find((r) => r.status === 'activated') ?? h[h.length - 1];
    return [id, { id, name: networks.find((n) => n.id === id)?.name ?? id, fork: (({ sources, ...f }) => f)(current), history: h }];
  }));
  const testnets = networks.filter((n) => n.kind === 'testnet' && forks[n.id]).map((n) => forks[n.id]);
  const mainnet = forks.mainnet ?? null;
  const myCuts = cuts.filter((c) => c.upgrade === u.id).sort((a, b) => sortKey(a.genesis ?? '9') < sortKey(b.genesis ?? '9') ? -1 : 1);
  const featureCuts = cuts.filter((c) => !c.upgrade && c.eips.some((n) => eips[n]));

  const status = mainnet?.fork.status === 'activated' ? 'live'
    : mainnet?.fork.status === 'agreed' || testnets.some((t) => ['agreed', 'activated', 'proposed'].includes(t.fork.status)) ? 'upcoming'
    : myCuts.length ? 'development'
    : Object.values(eips).some((e) => e.stage === 'scheduled') ? 'planning' : 'research';

  // Validation: the register against what upstream ships.
  for (const [network, cfg] of Object.entries(forkConfigs)) {
    const shipped = cfg.forks[u.id];
    const recorded = forks[network]?.fork;
    if (shipped && !shipped.activated && recorded && ['proposed', 'agreed'].includes(recorded.status) && recorded.epoch != null && recorded.epoch !== shipped.epoch)
      validation.push({ kind: 'fork-slot-mismatch', upgrade: u.id, network, message: `${network}: register says ${recorded.status} epoch ${recorded.epoch}, ${cfg.url} ships epoch ${shipped.epoch}` });
    if (shipped && !shipped.activated && !recorded)
      validation.push({ kind: 'fork-slot-unrecorded', upgrade: u.id, network, message: `${network}: config ships ${u.name} at epoch ${shipped.epoch} (${shipped.date}) but the register has no decision for it` });
  }
  if (u.type === 'combined' && (!u.layers.execution || !u.layers.consensus))
    validation.push({ kind: 'upgrade-missing-layers', upgrade: u.id, message: `${u.name} has no layer names in all-forks.json` });


  const view = {
    id: u.id, name: u.name, type: u.type, layers: u.layers, metaEips: u.metaEips, links: u.links,
    status, mainnet, testnets,
    devnets: myCuts.map(cutRow), featureDevnets: featureCuts.map(cutRow),
    deadlines: deadlines.sort((a, b) => sortKey(a.date) < sortKey(b.date) ? -1 : 1),
    headliners: headliners.sort((a, b) => Number(b.selected) - Number(a.selected) || a.eip - b.eip),
    eips: Object.values(eips).sort((a, b) => a.eip - b.eip),
    unsourced: mine.filter((e) => e.date == null || e.confidence === 'low').length,
  };
  emit(`upgrades/${u.id}.json`, 'distUpgrade', view);
  index.push({ id: u.id, name: u.name, type: u.type, status, mainnet: mainnet?.fork ?? null, eips: view.eips.length, events: mine.length });
  for (const e of view.eips) (eipViews[e.eip] ??= { eip: e.eip, title: e.title, upstreamStatus: eipMeta[e.eip]?.status ?? null, layer: e.layer, upgrades: [], devnets: cuts.filter((c) => c.eips.includes(e.eip)).map((c) => c.id) }).upgrades.push({ upgrade: u.id, stage: e.stage, track: e.track, headliner: headliners.some((h) => h.eip === e.eip && h.selected), history: e.history });
}
for (const e of Object.values(eipViews)) emit(`eips/${e.eip}.json`, 'distEip', e);
for (const m of metaEips) if (!upgrades.some((u) => u.metaEips.includes(m.eip))) validation.push({ kind: 'meta-eip-not-in-all-forks', eip: m.eip, message: `Hardfork Meta EIP-${m.eip} (${m.name}) exists but pm all-forks.json does not list it` });

// The name-to-id table an extraction agent resolves against. Nothing else may invent an id.
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
emit('resolve.json', 'distResolve', {
  generatedAt: new Date().toISOString(),
  note: 'Resolve every name spoken on a call to an id here. If a name is absent, do not guess an id; report it as unresolved.',
  upgrades: upgrades.map((u) => ({ id: u.id, name: u.name, aliases: [...new Set([u.name, u.layers.execution, u.layers.consensus].filter(Boolean).map(norm))] })),
  networks: networks.map((n) => ({ id: n.id, name: n.name, kind: n.kind, deprecated: n.deprecated, aliases: [...new Set([norm(n.name), norm(n.id)])] })),
  devnets: Object.entries(Object.groupBy(cuts, (c) => c.upgrade ?? c.group)).map(([ctx, list]) => ({ context: ctx, note: `"devnet 3" on a call about ${ctx} means ${ctx}-devnet-3`, ids: list.map((c) => c.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) })),
  eips: [...new Set(events.filter((e) => e.eip).map((e) => e.eip))].sort((a, b) => a - b).map((n) => {
    const t = eipMeta[n]?.title ?? null, acronym = t?.match(/\(([A-Za-z][A-Za-z0-9-]{1,9})\)/)?.[1];
    return { eip: n, title: t, aliases: [...new Set([`eip ${n}`, String(n), ...(t ? [norm(t)] : []), ...(acronym ? [norm(acronym)] : []), ...(overrides.eipAliases?.[n] ?? []).map(norm)])] };
  }),
  vocabulary: {
    'eip.stage': { pfi: 'proposed', 'proposed for inclusion': 'proposed', cfi: 'considered', 'considered for inclusion': 'considered', sfi: 'scheduled', 'scheduled for inclusion': 'scheduled', dfi: 'declined', 'declined for inclusion': 'declined', included: 'included', withdrawn: 'withdrawn' },
    'network.fork': { 'aiming for': 'estimated', targeting: 'estimated', 'proposed slot': 'proposed', 'put forward': 'proposed', agreed: 'agreed', 'locked in': 'agreed', forked: 'activated', cancelled: 'cancelled' },
    'upgrade.deadline': { 'pfi deadline': 'proposed', 'cfi deadline': 'considered', 'sfi deadline': 'scheduled', 'cut-off': 'the stage named next to it' },
  },
});
const unknownEips = [...new Set(events.filter((e) => e.eip && !eipMeta[e.eip]).map((e) => e.eip))];
if (unknownEips.length) console.warn(`note: ${unknownEips.length} EIP(s) not in the mirror yet, titles fill in on the next fetch: ${unknownEips.join(', ')}`);

const backlog = events.filter((e) => e.date == null || e.confidence === 'low' || (e.source.kind === 'meta-eip' && !events.some((c) => c.source.kind === 'call' && c.type === e.type && c.eip === e.eip && c.upgrade === e.upgrade && c.stage === e.stage)))
  .map((e) => ({ file: e.file, type: e.type, upgrade: e.upgrade, eip: e.eip, network: e.network, value: e.stage ?? e.status ?? e.action, date: e.date, confidence: e.confidence, reason: e.date == null ? 'no date' : e.confidence === 'low' ? 'low confidence' : 'no call reference yet' }));
maintenance('backlog.json', { count: backlog.length, items: backlog });
maintenance('validation.json', { count: validation.length, items: validation });
emit('index.json', 'distIndex', { generatedAt: new Date().toISOString(), upgrades: index, networks: networks.map(({ links, ...n }) => n), devnetGroups: [...new Set(cuts.map((c) => c.group))], events: events.length, eips: Object.keys(eipViews).length });

if (outErrors.length) { console.error(`compiled output does not match its published schema:\n${outErrors.join('\n')}`); process.exit(1); }
console.log(`ok: ${upgrades.length} upgrades, ${networks.length} networks, ${cuts.length} cuts, ${events.length} events, ${Object.keys(eipViews).length} eips, ${backlog.length} backlog, ${validation.length} validation`);
