import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

test('production server serves the built app and routes assessment requests safely', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PORT: '18089', ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    const [output] = await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(([code]) => { throw new Error(`Server exited before listening (${code})`); }),
    ]);
    assert.match(String(output), /Listening on 0.0.0.0:18089/);
    const base = 'http://127.0.0.1:18089';
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /FoundryIQ/);
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    const script = await fetch(base + asset);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    for (const path of ['/api/unknown', '/server.js', '/package.json', '/%2e%2e%2fpackage.json']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base + '/api/assess')).status, 405);
    assert.equal((await fetch(base + '/api/assess', { method: 'OPTIONS' })).status, 204);
    const post = (body, type = 'application/json') => fetch(base + '/api/assess', { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal((await post('{}', 'text/plain')).status, 415);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('{"files":[null]}')).status, 400);
    const missingKey = await post('{"files":[]}');
    assert.equal(missingKey.status, 500);
    assert.match((await missingKey.json()).error, /ANTHROPIC_API_KEY/);
    assert.equal((await post(JSON.stringify({ text: 'a'.repeat(6 * 1024 * 1024) }))).status, 413);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
});
