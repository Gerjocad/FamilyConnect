import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LogoFinder, mergeOpponents, opponentsFromTitles } from '../src/logoSearch.js';

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

  test('Gegner aus dem Kalender', () => {
    const titles = ['Fenerbahçe – Galatasaray', 'Beşiktaş vs. Fenerbahce (Pokal)', 'Fenerbahçe : Slavia Prag, Champions League', 'Arzt', 'Galatasaray – Trabzonspor', 'Galatasaray - Fenerbahçe'];
    assert.deepEqual(opponentsFromTitles(titles, 'Fenerbahçe'), ['Galatasaray', 'Beşiktaş', 'Slavia Prag', 'Galatasaray']);
  });

  test('Gegner zusammenführen, vorhandene Logos weglassen', () => {
    const merged = mergeOpponents(
      ['Galatasaray', 'Galatasaray', 'Slavia Prag'],
      [
        { name: 'Galatasaray SK', badge: 'gs.png', source: 'Turkish Super Lig' },
        { name: 'Beşiktaş', badge: 'bjk.png', source: 'Turkish Super Lig' },
        { name: 'Alanyaspor', badge: 'a.png', source: 'Turkish Super Lig' },
        { name: 'Fenerbahçe', badge: 'fb.png', source: 'Turkish Super Lig' },
      ],
      ['Fenerbahce', 'besiktas'],
    );
    assert.deepEqual(merged.map((m) => [m.name, m.games, m.badge, m.sources]), [
      ['Galatasaray', 2, 'gs.png', ['Kalender', 'Turkish Super Lig']],
      ['Slavia Prag', 1, null, ['Kalender']],
      ['Alanyaspor', 0, 'a.png', ['Turkish Super Lig']],
    ]);
  });

  test('Gegner aus der Sport-Datenbank: ganze Liga über die Saisonspiele, dazu eigene Spiele', async () => {
    const asked = [];
    const finder = new LogoFinder({
      fetchImpl: async (url) => {
        const u = String(url);
        asked.push(u.replace(/^.*\/123\//, ''));
        if (u.includes('searchteams')) return Response.json({ teams: [{ idTeam: '1', strTeam: 'Fenerbahçe', strSport: 'Soccer', idLeague: '4339', strLeague: 'Turkish Super Lig' }] });
        if (u.includes('eventsseason') && u.includes('2026-2027')) {
          return Response.json({ events: [
            { idHomeTeam: '2', strHomeTeam: 'Galatasaray', strHomeTeamBadge: 'gs.png', idAwayTeam: '3', strAwayTeam: 'Trabzonspor', strAwayTeamBadge: 'ts.png' },
            { idHomeTeam: '1', strHomeTeam: 'Fenerbahçe', idAwayTeam: '4', strAwayTeam: 'Kasımpaşa', strAwayTeamBadge: 'k.png' },
          ] });
        }
        if (u.includes('eventslast')) return Response.json({ results: [{ idHomeTeam: '1', strHomeTeam: 'Fenerbahçe', idAwayTeam: '9', strAwayTeam: 'Slavia Prague', strAwayTeamBadge: 's.png', strLeague: 'UEFA Champions League' }] });
        return Response.json({ events: null });
      },
    });
    const found = await finder.opponents('Fenerbahce', new Date(2026, 9, 25));
    assert.deepEqual(found.map((o) => [o.name, o.source]).sort(), [
      ['Galatasaray', 'Turkish Super Lig'], ['Kasımpaşa', 'Turkish Super Lig'], ['Slavia Prague', 'UEFA Champions League'], ['Trabzonspor', 'Turkish Super Lig'],
    ]);
    assert.ok(asked.includes('eventsseason.php?id=4339&s=2026-2027'));
  });
});
