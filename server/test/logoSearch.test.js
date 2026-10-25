import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LogoFinder } from '../src/logoSearch.js';

const png = Buffer.from('89504e470d0a1a0a', 'hex');

describe('Logo-Suche', () => {
  test('Wappen und Wikipedia-Bilder zusammen, doppelte raus', async () => {
    const finder = new LogoFinder({
      fetchImpl: async (url) => {
        if (String(url).includes('thesportsdb')) {
          return Response.json({ teams: [
            { strTeam: 'Galatasaray', strSport: 'Soccer', strCountry: 'Turkey', strBadge: 'https://r2.thesportsdb.com/gs.png' },
            { strTeam: 'Galatasaray Basketbol', strSport: 'Basketball', strBadge: null },
          ] });
        }
        return Response.json({ query: { pages: {
          2: { index: 2, title: 'Galatasaray Istanbul', thumbnail: { source: 'https://upload.wikimedia.org/gs-wiki.png' } },
          1: { index: 1, title: 'Galata', thumbnail: { source: 'https://r2.thesportsdb.com/gs.png' } },
          3: { index: 3, title: 'Ohne Bild' },
        } } });
      },
    });
    const found = await finder.search('Galatasaray');
    assert.deepEqual(found.map((r) => [r.label, r.image]), [
      ['Galatasaray', 'https://r2.thesportsdb.com/gs.png'],
      ['Galatasaray Istanbul', 'https://upload.wikimedia.org/gs-wiki.png'],
    ]);
    assert.equal(found[0].detail, 'Fußball · Turkey');
    await assert.rejects(finder.search(' '), /Suchbegriff/);
  });

  test('fällt eine Quelle aus, gibt es die andere', async () => {
    const finder = new LogoFinder({
      fetchImpl: async (url) => (String(url).includes('thesportsdb') ? new Response('kaputt', { status: 500 }) : Response.json({ query: { pages: { 1: { index: 1, title: 'FB', thumbnail: { source: 'https://x/fb.png' } } } } })),
    });
    assert.equal((await finder.search('Fenerbahce')).length, 1);
  });

  test('Bild laden: Google-Link, Weiterleitung, nur Bilder', async () => {
    const seen = [];
    const finder = new LogoFinder({
      allowPrivate: true,
      fetchImpl: async (url) => {
        seen.push(String(url));
        if (String(url).endsWith('/alt.png')) return new Response(null, { status: 302, headers: { location: '/neu.png' } });
        if (String(url).endsWith('/seite')) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
        return new Response(png, { headers: { 'content-type': 'image/png' } });
      },
    });
    const image = await finder.download('https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.org%2Falt.png&tbnid=x');
    assert.equal(image, `data:image/png;base64,${png.toString('base64')}`);
    assert.deepEqual(seen, ['https://example.org/alt.png', 'https://example.org/neu.png']);
    await assert.rejects(finder.download('https://example.org/seite'), /kein Bild/);
    await assert.rejects(finder.download('ftp://example.org/x.png'), /http/);
    await assert.rejects(finder.download('kein link'), /gültige/);
  });

  test('keine Zugriffe ins interne Netz, Größe begrenzt', async () => {
    const finder = new LogoFinder({ fetchImpl: async () => new Response(Buffer.alloc(4 * 1024 * 1024), { headers: { 'content-type': 'image/png' } }) });
    await assert.rejects(finder.download('http://127.0.0.1/logo.png'), /nicht erlaubt/);
    await assert.rejects(finder.download('http://169.254.169.254/latest'), /nicht erlaubt/);
    const open = new LogoFinder({ allowPrivate: true, fetchImpl: async () => new Response(Buffer.alloc(4 * 1024 * 1024), { headers: { 'content-type': 'image/png' } }) });
    await assert.rejects(open.download('https://example.org/riesig.png'), /zu groß/);
  });
});
