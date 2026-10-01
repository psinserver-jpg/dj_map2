import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

test('전국 압축 데이터는 원본 데이터와 정확하게 같고 전송량을 줄인다', async () => {
  const root = new URL('../data/regions/', import.meta.url);
  const regions = await readdir(root);
  let original = 0, compressed = 0;
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
  for (const region of regions) for (const name of ['meta', 'points']) {
    const script = await readFile(new URL(`${region}/${name}.js`, root), 'utf8');
    const json = script.slice(script.indexOf('=') + 1).trim().replace(/;$/, '').trim();
    const packed = await readFile(new URL(`${region}/${name}.json.gz`, root));
    assert.equal(hash(gunzipSync(packed)), hash(json), `${region}/${name}`);
    original += Buffer.byteLength(script);
    compressed += packed.length;
  }
  assert.ok(compressed < original * 0.3);
});
