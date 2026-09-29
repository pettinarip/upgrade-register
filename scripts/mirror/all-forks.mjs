import { fetchJson, writeJson } from '../lib/io.mjs';

const URL = 'https://raw.githubusercontent.com/ethereum/pm/master/all-forks.json';

export async function mirrorAllForks() {
  const allForks = await fetchJson(URL);
  if (!allForks?.forks?.length) throw new Error('all-forks.json has no forks');
  writeJson('mirror/all-forks.json', allForks);
  console.log(`all-forks: ${allForks.forks.length} forks`);
}
