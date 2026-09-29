// The landing page of the published site: a plain list of every output file.

const escape = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const link = (href, text = href) => `<a href="${escape(href)}">${escape(text)}</a>`;

function upgradeRow(upgrade) {
  const mainnet = upgrade.mainnet ? `${upgrade.mainnet.status} ${upgrade.mainnet.forkDate ?? ''}` : '';
  return `<tr><td>${link(`upgrades/${upgrade.id}.json`, upgrade.name)}</td><td>${escape(upgrade.status)}</td><td>${escape(mainnet)}</td><td>${upgrade.eips.length}</td></tr>`;
}

const STAGE_ORDER = ['included', 'scheduled', 'considered', 'proposed', 'declined', 'withdrawn'];

function eipLinks(upgrade) {
  const listed = upgrade.eips.filter((e) => e.stage !== 'removed');
  const byStage = Object.groupBy(listed, (e) => e.stage);
  const groups = STAGE_ORDER.filter((stage) => byStage[stage]).map(
    (stage) => `<p><b>${escape(stage)}</b> ${byStage[stage].map((e) => link(`eips/${e.eip}.json`, e.eip)).join(' ')}</p>`,
  );
  return `<h3>${escape(upgrade.name)}</h3>${groups.join('')}`;
}

export function renderIndexPage({ upgrades, checkCount, generatedAt }) {
  const inProgress = upgrades.filter((u) => u.status !== 'live' && u.eips.length);
  const newestFirst = [...upgrades].reverse();
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>upgrade-register</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 52rem; margin: 2.5rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .25rem .75rem .25rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  th { font-weight: 600; }
  h3 { margin: 1.25rem 0 .25rem; }
  h3 + p, p + p { margin: .25rem 0; }
  code { font-size: .9em; }
</style>
<h1>upgrade-register</h1>
<p>Sourced facts about Ethereum network upgrades, compiled from Meta EIPs, client configs and ACD calls. Code and rules: ${link('https://github.com/pettinarip/upgrade-register')}.</p>

<h2>Files</h2>
<ul>
  <li>${link('index.json')}: upgrades and networks</li>
  <li><code>upgrades/&lt;id&gt;.json</code>: one upgrade with its forks, devnets, headliners, deadlines and EIP histories (listed below)</li>
  <li><code>eips/&lt;n&gt;.json</code>: one EIP across upgrades</li>
  <li>${link('resolve.json')}: every valid id and its aliases</li>
  <li>${link('checks.json')}: where the register differs from upstream (${checkCount} now)</li>
</ul>

<h2>Upgrades</h2>
<table>
  <thead><tr><th>Upgrade</th><th>Status</th><th>Mainnet</th><th>EIPs</th></tr></thead>
  <tbody>${newestFirst.map(upgradeRow).join('')}</tbody>
</table>

<h2>EIPs in progress</h2>
${inProgress.map(eipLinks).join('\n')}

<p><small>Generated ${escape(generatedAt)}</small></p>
</html>
`;
}
