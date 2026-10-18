import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { AppRelease } from '../src/appRelease.js';
import { openDatabase } from '../src/db.js';

async function withServer(options, fn) {
  const app = createApp(openDatabase(':memory:'), options);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

describe('App-Updates', () => {
  test('neueste Version aus GitHub-Releases, mit Zwischenspeicher', async () => {
    let calls = 0;
    const release = new AppRelease('Gerjocad/FamilyConnect', {
      fetchImpl: async (url) => {
        calls += 1;
        assert.equal(url, 'https://github.com/Gerjocad/FamilyConnect/releases/latest/download/version.json');
        return Response.json({ versionCode: 107, versionName: '2.7' });
      },
    });
    await withServer({ appRelease: release }, async (base) => {
      const first = await (await fetch(`${base}/api/app/latest`)).json();
      assert.deepEqual(first, {
        versionCode: 107,
        versionName: '2.7',
        apkUrl: 'https://github.com/Gerjocad/FamilyConnect/releases/latest/download/FamilyConnect.apk',
      });
      await fetch(`${base}/api/app/latest`);
      assert.equal(calls, 1, 'zweite Anfrage aus dem Zwischenspeicher');
    });
  });

  test('noch kein Release oder GitHub nicht erreichbar → 404', async () => {
    const none = new AppRelease('x/y', { fetchImpl: async () => new Response('Not Found', { status: 404 }) });
    const broken = new AppRelease('x/y', { fetchImpl: async () => { throw new Error('offline'); } });
    for (const appRelease of [none, broken, undefined]) {
      await withServer({ appRelease }, async (base) => {
        assert.equal((await fetch(`${base}/api/app/latest`)).status, 404);
      });
    }
  });

  test('index.html wird nie zwischengespeichert, Assets dauerhaft', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-static-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
      writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
      await withServer({ staticDir: dir }, async (base) => {
        assert.equal((await fetch(`${base}/`)).headers.get('cache-control'), 'no-cache');
        assert.equal((await fetch(`${base}/kalender`)).headers.get('cache-control'), 'no-cache');
        assert.match((await fetch(`${base}/assets/index-abc.js`)).headers.get('cache-control'), /immutable/);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
