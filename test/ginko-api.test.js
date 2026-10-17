// The HTTP client: the key in every request, the wrapped answers, the
// refusals told apart by their message (the API answers 200 to everything).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGinkoClient, refusalKind, GinkoError } from '../src/ginko-api.js';
import { fakeGinko, KEY } from './helpers/fixtures.js';

const client = (fetch, key = KEY) => createGinkoClient({ getApiKey: () => key, fetch });

test('the key and the parameters go in the query string, the answer is unwrapped', async () => {
  const fetch = fakeGinko();
  const api = client(fetch);
  const lines = await api.lines();
  assert.equal(lines[0].numLignePublic, 'T1');
  const answer = await api.waitTimes({ name: 'Gare Viotte' }, 9);
  assert.equal(answer.nomExact, 'Gare Viotte');
  assert.deepEqual(fetch.calls.at(-1), {
    method: 'TR/getTempsLieu',
    params: { apiKey: KEY, nom: 'Gare Viotte', nb: '5' },
  });
  await api.waitTimes({ id: 't_cham2' }, 2);
  assert.deepEqual(fetch.calls.at(-1).params, { apiKey: KEY, idArret: 't_cham2', nb: '2' });
  assert.equal((await api.lineStates()).length, 9);
  assert.equal((await api.messages()).length, 12);
  assert.equal(api.requests.total, 5);
  assert.equal(api.requests.byMethod['TR/getTempsLieu'], 2);
});

test('refusals: a wrong key, a missing key, an unknown stop, a failing server', async () => {
  const fetch = fakeGinko();
  await assert.rejects(client(fetch, 'wrong').lines(), { name: 'GinkoError', kind: 'auth' });
  await assert.rejects(client(fetch, '').lines(), { kind: 'auth', message: 'no API key' });
  assert.equal(fetch.calls.length, 1, 'no request without a key');
  await assert.rejects(client(fetch).waitTimes({ name: 'Nulle part' }), {
    kind: 'not_found',
    message: 'Aucun arrêt ne correspond à votre recherche.',
  });
  fetch.state.fail = 'network';
  await assert.rejects(client(fetch).lines(), { kind: 'unreachable', message: 'ECONNREFUSED' });
  fetch.state.fail = 503;
  await assert.rejects(client(fetch).lines(), { kind: 'unreachable', status: 503 });
  fetch.state.fail = 403;
  await assert.rejects(client(fetch).lines(), { kind: 'auth' });
  const broken = async () => new Response('<html>', { status: 200 });
  await assert.rejects(client(broken).lines(), { kind: 'invalid' });
  const notList = async () => new Response('{"ok":true,"objets":{}}', { status: 200 });
  await assert.rejects(client(notList).lines(), { kind: 'invalid' });
});

test('the kind of a refusal comes from its message', () => {
  assert.equal(refusalKind('La clé donnée en paramètre est invalide'), 'auth');
  assert.equal(refusalKind("Une clé API est nécessaire pour utiliser l'API"), 'auth');
  assert.equal(refusalKind('Aucun arrêt ne correspond à votre recherche.'), 'not_found');
  assert.equal(refusalKind('Erreur interne'), 'invalid');
  assert.ok(new GinkoError('auth', 'x') instanceof Error);
});
