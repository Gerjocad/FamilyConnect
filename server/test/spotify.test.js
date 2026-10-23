import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { SpotifyClient, parseSpotifyUri } from '../src/spotify.js';

const calls = [];
let devices = [{ id: 'gh1', name: 'Wohnzimmer', type: 'Speaker', is_active: false, volume_percent: 30 }];

async function fakeSpotify(url, options = {}) {
  const u = new URL(url);
  calls.push(`${options.method ?? 'GET'} ${u.pathname}${u.search}`);
  if (u.host === 'accounts.spotify.com') {
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('cid:secret').toString('base64')}`);
    const body = new URLSearchParams(options.body);
    if (body.get('grant_type') === 'authorization_code') {
      assert.equal(body.get('code'), 'abc');
      return Response.json({ access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 });
    }
    return Response.json({ access_token: 'at2', expires_in: 3600 });
  }
  assert.match(options.headers.Authorization, /^Bearer at[12]$/);
  if (u.pathname === '/v1/me') return Response.json({ id: 'u1', display_name: 'Mama', product: 'premium' });
  if (u.pathname === '/v1/me/player/devices') return Response.json({ devices });
  if (u.pathname === '/v1/me/player/play') return new Response(null, { status: 204 });
  if (u.pathname === '/v1/me/playlists') return Response.json({ items: [{ uri: 'spotify:playlist:aaaaaaaaaaaaaaaaaaaaaa', name: 'Kinderlieder', images: [{ url: 'https://i.scdn.co/x.jpg' }], owner: { display_name: 'Mama' } }] });
  if (u.pathname === '/v1/search') return Response.json({ playlists: { items: [null, { uri: 'spotify:playlist:bbbbbbbbbbbbbbbbbbbbbb', name: 'Kinder Disco', images: [], owner: { display_name: 'X' } }] } });
  return Response.json({ error: { message: 'not found' } }, { status: 404 });
}

let server;
let base;
before(async () => {
  const spotify = new SpotifyClient({ config: { client_id: 'cid', client_secret: 'secret' }, fetchImpl: fakeSpotify });
  const app = createApp(openDatabase(':memory:'), { spotify, publicUrl: 'https://familie.example' });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

describe('Musik (Spotify)', () => {
  test('Links erkennen', () => {
    assert.equal(parseSpotifyUri('https://open.spotify.com/intl-de/playlist/37i9dQZF1DX0XUsuxWHRQd?si=123'), 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd');
    assert.equal(parseSpotifyUri('spotify:album:4aawyAB9vmqN3uQ7FjRGTy'), 'spotify:album:4aawyAB9vmqN3uQ7FjRGTy');
    assert.equal(parseSpotifyUri('hallo'), null);
  });

  test('verbinden, Karten, abspielen per App und Aufkleber', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@musik.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const f = `/families/${fam.id}`;

    let { data: status } = await api(`${f}/spotify`, { token: lea });
    assert.deepEqual([status.configured, status.connected, status.redirect_uri], [true, false, 'https://familie.example/api/spotify/callback']);
    assert.equal((await api(`${f}/spotify/connect`, { token: lea, method: 'POST' })).status, 403, 'nur Admins');
    const { data: connect } = await api(`${f}/spotify/connect`, { token: mama, method: 'POST' });
    const auth = new URL(connect.url);
    assert.equal(auth.searchParams.get('redirect_uri'), 'https://familie.example/api/spotify/callback');
    const state = auth.searchParams.get('state');

    const cb = await fetch(`${base}/api/spotify/callback?code=abc&state=${state}`);
    assert.equal(cb.status, 200);
    assert.match(await cb.text(), /Spotify ist verbunden/);
    assert.equal((await fetch(`${base}/api/spotify/callback?code=abc&state=${state}`)).status, 400, 'Link nur einmal gültig');
    status = (await api(`${f}/spotify`, { token: lea })).data;
    assert.deepEqual(status.account, { name: 'Mama', premium: true });

    const { data: found } = await api(`${f}/spotify/search?q=kinder`, { token: mama });
    assert.deepEqual(found.map((p) => p.name), ['Kinderlieder', 'Kinder Disco']);
    assert.equal((await api(`${f}/music`, { token: lea, method: 'POST', body: { name: 'X', uri: found[0].uri } })).status, 403);
    assert.equal((await api(`${f}/music`, { token: mama, method: 'POST', body: { name: 'X', uri: 'quatsch' } })).status, 400);
    const { data: card } = await api(`${f}/music`, { token: mama, method: 'POST', body: { name: 'Kinderlieder', uri: 'https://open.spotify.com/playlist/aaaaaaaaaaaaaaaaaaaaaa', image: found[0].image, emoji: '🧸' } });
    assert.equal(card.uri, 'spotify:playlist:aaaaaaaaaaaaaaaaaaaaaa');
    assert.match(card.token, /^[0-9a-f]{32}$/);

    // ohne festen Lautsprecher: der erste verfügbare
    const played = await api(`${f}/music/${card.id}/play`, { token: lea, method: 'POST' });
    assert.deepEqual(played.data, { device: 'Wohnzimmer', card: { id: card.id, name: 'Kinderlieder', image: card.image } });
    assert.ok(calls.includes('PUT /v1/me/player/play?device_id=gh1'));

    // fester Lautsprecher, der gerade nicht erreichbar ist → verständliche Meldung
    await api(`${f}/spotify/device`, { token: mama, method: 'PUT', body: { id: 'gh2', name: 'Kinderzimmer' } });
    const missing = await api(`/music/by-token/${card.token}/play`, { token: lea, method: 'POST' });
    assert.equal(missing.status, 409);
    assert.match(missing.data.error, /Kinderzimmer.*nicht erreichbar/);
    devices = [...devices, { id: 'gh2', name: 'Kinderzimmer', type: 'Speaker', is_active: false }];
    const byTag = await api(`/music/by-token/${card.token}/play`, { token: lea, method: 'POST' });
    assert.equal(byTag.data.device, 'Kinderzimmer');
    assert.equal(byTag.data.family_id, fam.id);

    assert.equal((await api(`${f}/spotify/player`, { token: lea, method: 'POST', body: { action: 'volume', value: 150 } })).status, 400);
    assert.equal((await api(`${f}/spotify`, { token: mama, method: 'DELETE' })).status, 204);
    assert.equal((await api(`${f}/music/${card.id}/play`, { token: lea, method: 'POST' })).status, 409, 'nicht mehr verbunden');
  });
});
