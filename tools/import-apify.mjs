import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const headers = { Authorization: 'Bearer ' + process.env.APIFY_TOKEN };
async function get(endpoint) {
  const response = await fetch('https://api.apify.com/v2/' + endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Apify HTTP ' + response.status);
  return response.json();
}
const run = (await get('actor-runs/' + encodeURIComponent(process.env.APIFY_SEED_RUN_ID))).data;
if (run.status !== 'SUCCEEDED') throw new Error('Run status: ' + run.status);
const items = await get('datasets/' + encodeURIComponent(run.defaultDatasetId) + '/items?format=json&clean=true&limit=1000');
await mkdir(path.join(root, '.local'), { recursive: true });
await writeFile(path.join(root, '.local', 'apify-seed.json'), JSON.stringify(items), 'utf8');
console.log(JSON.stringify({ status: run.status, imported: items.length, reviewCount: items.reduce((sum, item) => sum + (item.reviews?.length || 0), 0),
  sample: items.slice(0, 3).map((item) => ({ name: item.title, location: item.location, reviews: item.reviews?.length || 0, hasMenu: !!item.menu })), fields: Object.keys(items[0] || {}) }));
