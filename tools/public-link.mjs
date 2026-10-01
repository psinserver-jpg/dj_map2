import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '2026.9.3';
const digest = 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2';
const download = `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-windows-amd64.exe`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('이 실행 파일은 64비트 윈도우 서버용입니다.');
  const health = await fetch('http://127.0.0.1:8080/api/health', { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!health?.ok || (await health.json()).status !== 'ok') throw new Error('start-server.cmd를 먼저 실행하고 그 창을 열어 두세요.');
  const dir = path.join(root, '.local');
  await mkdir(dir, { recursive: true });
  const binary = path.join(dir, `cloudflared-${version}.exe`);
  let bytes = await readFile(binary).catch(() => null);
  if (!bytes || hash(bytes) !== digest) {
    console.log('Cloudflare 공식 연결 프로그램을 내려받고 파일을 검증합니다.');
    const response = await fetch(download, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`다운로드 실패 (${response.status}). 인터넷 연결을 확인해 주세요.`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== digest) throw new Error('파일 검증에 실패했습니다. 실행하지 않았습니다.');
    await writeFile(binary + '.download', bytes);
    await rename(binary + '.download', binary);
  }
  console.log('임시 HTTPS 주소를 만들고 있습니다. 서버 창과 이 창을 모두 열어 두세요.');
  console.log('이 주소는 재실행하면 바뀝니다. 고정 운영 주소는 별도 설정이 필요합니다.');
  const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8080'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let announced = false;
  for (const stream of [child.stdout, child.stderr]) {
    const lines = createInterface({ input: stream });
    lines.on('line', line => {
      console.log(line);
      const url = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
      if (url && !announced) {
        announced = true;
        console.log(`\n이 주소를 채팅에 보내주세요: ${url}\n`);
        writeFile(path.join(dir, 'public-address.txt'), url + '\r\n').catch(error => console.error('주소 파일 저장 실패:', error.message));
      }
    });
  }
  process.once('SIGINT', () => child.kill());
  process.once('SIGTERM', () => child.kill());
  const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
  if (result && result !== 0) throw new Error(`연결이 종료됐습니다 (${result}). 위 오류를 확인해 주세요.`);
}

main().catch(error => { console.error('\n연결 실패:', error.message); process.exitCode = 1; });
