import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../data/', import.meta.url);
async function data(name, shard = false) {
  const source = await readFile(new URL(name, root), 'utf8');
  return JSON.parse(source.slice(source.indexOf(shard ? ']=' : '=') + (shard ? 2 : 1)).trim().replace(/;$/, ''));
}
const catalog = await data('regions.js');
let shops = 0, cities = 0;
for (const region of catalog.regions) {
  const prefix = `regions/${region.code}/`;
  const meta = await data(prefix + 'meta.js');
  const points = await data(prefix + 'points.js');
  assert.equal(meta.regionCode, region.code);
  assert.equal(points.n, region.count);
  for (const key of ['id', 'name', 'addr', 'lon', 'lat', 'sub', 'dist']) assert.equal(points[key].length, points.n);
  assert.equal(new Set(points.id).size, points.n);
  let end = 0;
  for (let i = 0; i < meta.dists.length; i++) {
    const city = meta.dists[i];
    assert.equal(city.start, end);
    const detail = await data(prefix + `detail/${city.code}.js`, true);
    assert.equal(detail.rows.length, city.count);
    for (let j = city.start; j < city.start + city.count; j++) {
      assert.equal(points.dist[j], i);
      assert.ok(meta.subs[points.sub[j]]);
      assert.ok(points.lon[j] > 120 && points.lon[j] < 135 && points.lat[j] > 30 && points.lat[j] < 43);
    }
    end += city.count;
    cities++;
  }
  assert.equal(end, points.n);
  shops += points.n;
}
assert.equal(shops, catalog.total);
console.log(JSON.stringify({ regions: catalog.regions.length, cities, shops, validation: 'passed' }));
