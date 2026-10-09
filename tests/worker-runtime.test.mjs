import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real workerd request construction/fetch; only the external dictionary is replaced.
test('workerd lookup normalizes results and rejects redirects without following them', { timeout: 60000 }, async () => {
  let redirect = false;
  let followed = 0;
  const upstream = createServer((req, res) => {
    if (req.url === '/redirected') followed++;
    if (redirect) {
      res.writeHead(302, { Location: '/redirected' });
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ searchItems: [{ lemma: 'amō', bedeutungenFlach: ['lieben'], wortart: 'VERB' }] }]));
    }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const dir = await mkdtemp(join(tmpdir(), 'vokabulator-runtime-'));
  let child;
  let output = '';
  try {
    const source = fileURLToPath(new URL('../worker/index.mjs', import.meta.url));
    await writeFile(join(dir, 'index.mjs'), `import { handleRequest } from ${JSON.stringify(source)};
export default { fetch(request) { return handleRequest(request, (url, options) => fetch('http://127.0.0.1:${upstreamPort}/lookup', options)); } };`);
    await writeFile(join(dir, 'wrangler.toml'), 'name="vokabulator-runtime-test"\nmain="index.mjs"\ncompatibility_date="2026-10-08"\n');
    child = spawn('npx', ['--yes', 'wrangler', 'dev', '--config', join(dir, 'wrangler.toml'), '--local', '--port', String(port), '--inspector-port', '0'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const url = `http://127.0.0.1:${port}/lookup?q=amo`;
    let response;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try { response = await fetch(url, { headers: { Origin: 'http://127.0.0.1:8080' } }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, output);
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { query: 'amo', found: true, lemma: 'amō', meanings: ['lieben'], wordType: 'VERB', classLabel: '' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8080');
    redirect = true;
    assert.equal((await fetch(url)).status, 502);
    assert.equal(followed, 0);
  } finally {
    if (child) { process.kill(-child.pid, 'SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
    await new Promise(resolve => upstream.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
