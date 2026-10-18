import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { formatDuration, RecipeImporter } from '../src/recipeImport.js';

// Testseiten, wie sie Rezeptseiten typischerweise ausliefern
const PAGES = {
  '/chefkoch': `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Omas K&auml;sekuchen",
      "image":["https://img.example/kuchen.jpg"],"recipeYield":"12 Portionen","recipeCategory":["Kuchen","Backen"],
      "prepTime":"PT30M","cookTime":"PT1H","description":"Saftig &amp; locker",
      "recipeIngredient":["1 kg Quark","200 g Zucker","4 Eier"],
      "recipeInstructions":"Alles verrühren.\\nBei 180 °C backen."}</script>
    </head><body>…</body></html>`,
  '/graph': `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Recipe","Thing"],"name":"Pasta",
      "recipeYield":4,"totalTime":"PT25M","image":{"@type":"ImageObject","url":"/bild.jpg"},
      "recipeIngredient":["500 g Spaghetti"],
      "recipeInstructions":[{"@type":"HowToSection","name":"Soße","itemListElement":[{"@type":"HowToStep","text":"Tomaten <b>kochen</b>"}]},
        {"@type":"HowToStep","text":"Nudeln kochen"}]}]}</script>`,
  '/blog': '<html><head><meta property="og:title" content="Mein Lieblingsessen"><meta property="og:image" content="https://img.example/blog.jpg"></head><body><nav>Menü</nav><article><h1>Linsensuppe</h1><p>Man nehme 250 g Linsen, 1 Zwiebel und 1 l Brühe. Alles 30 Minuten köcheln lassen und mit Essig abschmecken.</p></article></body></html>',
};

let site;
let siteUrl;
let server;
let base;
const aiCalls = [];

before(async () => {
  site = createServer((req, res) => {
    if (req.url === '/weiter') return res.writeHead(302, { Location: '/chefkoch' }).end();
    const page = PAGES[req.url];
    res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }).end(page ?? 'nicht da');
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${site.address().port}`;

  // Anthropic-API wird simuliert, alles andere geht an die Testseite
  const fetchImpl = async (url, options) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
      aiCalls.push(JSON.parse(options.body));
      const answer = { found: true, title: 'Linsensuppe', category: 'Suppe', servings: '4', duration: '40 Min.', ingredients: ['250 g Linsen', '1 Zwiebel'], instructions: ['Köcheln lassen', 'Abschmecken'], notes: '' };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: `Hier: ${JSON.stringify(answer)}` }] }), { status: 200 });
    }
    return fetch(url, options);
  };
  const app = createApp(openDatabase(':memory:'), {
    recipeImporter: new RecipeImporter({ fetchImpl, allowPrivate: true, apiKey: 'test-key' }),
  });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server.close();
  site.close();
});

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

let n = 0;
async function family() {
  n += 1;
  const { data } = await api('/auth/register', { method: 'POST', body: { name: 'Koch', email: `koch${n}@rezept.test`, password: 'geheim123' } });
  const { data: fam } = await api('/families', { token: data.token, method: 'POST', body: { name: 'F' } });
  return { token: data.token, fid: fam.id };
}

describe('Rezepte', () => {
  test('anlegen, bearbeiten, löschen', async () => {
    const { token, fid } = await family();
    const { status, data } = await api(`/families/${fid}/recipes`, {
      token, method: 'POST', body: { title: 'Pfannkuchen', servings: 4, ingredients: '250 g Mehl\n3 Eier', instructions: 'Verrühren\nBraten' },
    });
    assert.equal(status, 201);
    assert.equal(data.servings, 4);
    assert.equal(data.image_url, '');
    assert.equal((await api(`/families/${fid}/recipes/${data.id}`, { token, method: 'PATCH', body: { servings: null } })).data.servings, null);
    assert.equal((await api(`/families/${fid}/recipes`, { token, method: 'POST', body: { title: 'X', image_url: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await api(`/families/${fid}/recipes`, { token, method: 'POST', body: { title: 'X', servings: 0 } })).status, 400);
    assert.equal((await api(`/families/${fid}/recipes/${data.id}`, { token, method: 'DELETE' })).status, 204);
    assert.deepEqual((await api(`/families/${fid}/recipes`, { token })).data, []);
  });

  test('Import aus schema.org-Daten (inkl. Weiterleitung)', async () => {
    const { token, fid } = await family();
    const { status, data } = await api(`/families/${fid}/recipes/import`, { token, method: 'POST', body: { url: `${siteUrl}/weiter` } });
    assert.equal(status, 200);
    assert.equal(data.method, 'schema');
    assert.equal(data.title, 'Omas Käsekuchen');
    assert.equal(data.servings, 12);
    assert.equal(data.category, 'Kuchen');
    assert.equal(data.duration, '1 Std. 30 Min.');
    assert.equal(data.ingredients, '1 kg Quark\n200 g Zucker\n4 Eier');
    assert.equal(data.instructions, 'Alles verrühren.\nBei 180 °C backen.');
    assert.equal(data.notes, 'Saftig & locker');
    assert.equal(data.image_url, 'https://img.example/kuchen.jpg');
    assert.equal(data.source_url, `${siteUrl}/chefkoch`);
    // Der Entwurf lässt sich direkt speichern
    assert.equal((await api(`/families/${fid}/recipes`, { token, method: 'POST', body: data })).status, 201);
  });

  test('Import mit @graph, Abschnitten und relativem Bild', async () => {
    const { token, fid } = await family();
    const { data } = await api(`/families/${fid}/recipes/import`, { token, method: 'POST', body: { url: `${siteUrl}/graph` } });
    assert.equal(data.title, 'Pasta');
    assert.equal(data.servings, 4);
    assert.equal(data.duration, '25 Min.');
    assert.equal(data.instructions, 'Soße:\nTomaten kochen\nNudeln kochen');
    assert.equal(data.image_url, `${siteUrl}/bild.jpg`);
  });

  test('Seite ohne Rezept-Daten und eingefügter Text gehen über die KI', async () => {
    const { token, fid } = await family();
    assert.deepEqual((await api(`/families/${fid}/recipes/import`, { token })).data, { ai: true });
    const { status, data } = await api(`/families/${fid}/recipes/import`, { token, method: 'POST', body: { url: `${siteUrl}/blog` } });
    assert.equal(status, 200);
    assert.equal(data.method, 'ai');
    assert.equal(data.servings, 4);
    assert.equal(data.ingredients, '250 g Linsen\n1 Zwiebel');
    assert.equal(data.image_url, 'https://img.example/blog.jpg');
    const prompt = aiCalls.at(-1).messages[0].content;
    assert.match(prompt, /Linsensuppe/);
    assert.doesNotMatch(prompt, /Menü/);

    const fromText = await api(`/families/${fid}/recipes/import`, { token, method: 'POST', body: { text: 'Linsen mit Zwiebel 30 Minuten kochen …' } });
    assert.equal(fromText.status, 200);
    assert.equal(fromText.data.source_url, '');
  });

  test('vom Handy geladene Seite auswerten', async () => {
    const { token, fid } = await family();
    const html = PAGES['/chefkoch'] + ' '.repeat(500_000);
    const { status, data } = await api(`/families/${fid}/recipes/import`, { token, method: 'POST', body: { url: 'https://www.chefkoch.de/rezepte/1/kuchen.html', html } });
    assert.equal(status, 200);
    assert.equal(data.title, 'Omas Käsekuchen');
    assert.equal(data.source_url, 'https://www.chefkoch.de/rezepte/1/kuchen.html');
  });

  test('Fehlerfälle', async () => {
    const { token, fid } = await family();
    const post = (body) => api(`/families/${fid}/recipes/import`, { token, method: 'POST', body });
    assert.equal((await post({ url: 'kein link' })).status, 400);
    assert.equal((await post({ url: 'file:///etc/passwd' })).status, 400);
    assert.equal((await post({ url: `${siteUrl}/fehlt` })).status, 502);
    // Ohne Anmeldung nichts
    assert.equal((await api(`/families/${fid}/recipes/import`, { method: 'POST', body: { url: siteUrl } })).status, 401);
  });

  test('ohne KI-Schlüssel und ins interne Netz', async () => {
    const importer = new RecipeImporter();
    assert.equal(importer.aiEnabled, false);
    await assert.rejects(importer.fromUrl(`${siteUrl}/blog`), { status: 400, message: /nicht erlaubt/ });
    await assert.rejects(importer.fromUrl('http://[::1]:1/'), { status: 400 });
    const local = new RecipeImporter({ allowPrivate: true });
    await assert.rejects(local.fromUrl(`${siteUrl}/blog`), { status: 422, message: /kein Rezept erkannt/ });
    await assert.rejects(local.fromText('Ein langer Text über Linsensuppe'), { status: 422 });
  });

  test('Dauer lesbar', () => {
    assert.equal(formatDuration('PT90M'), '1 Std. 30 Min.');
    assert.equal(formatDuration('PT2H'), '2 Std.');
    assert.equal(formatDuration('P0DT0H45M'), '45 Min.');
    assert.equal(formatDuration('quatsch'), '');
  });
});
