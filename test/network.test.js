// Lines and stops: typed the way users read them, kept in /data, read again
// daily (lines) or weekly (stops).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fold,
  slug,
  lineOf,
  stopOf,
  findLine,
  findStop,
  searchStops,
  createNetwork,
} from '../src/network.js';
import { createGinkoClient } from '../src/ginko-api.js';
import { createStore } from '../src/store.js';
import { newDaySince } from '../src/time.js';
import { fakeGinko, KEY, LINES, STOPS, NOW, TZ, storePath, silent } from './helpers/fixtures.js';

const lines = LINES.objets.map(lineOf);
const stops = STOPS.objets.map(stopOf);

test('fold and slug ignore case, accents and punctuation', () => {
  assert.equal(fold('Pôle  Témis-Est'), 'pole temis est');
  assert.equal(slug('République'), 'republique');
  assert.equal(slug("Thise - Église de l'Assomption", 12), 'thise-eglise');
});

test('lines: public names, "3" for L3, internal ids', () => {
  assert.equal(findLine(lines, 'T1').id, '101');
  assert.equal(findLine(lines, 't 2').id, '102');
  assert.equal(findLine(lines, 'l3').id, '3');
  assert.equal(findLine(lines, '3').name, 'L3');
  assert.equal(findLine(lines, 'plan b').id, '110');
  assert.equal(findLine(lines, 'Citadelle').name, 'Ginko Citadelle');
  assert.equal(findLine(lines, '71').id, '71');
  assert.equal(findLine(lines, '101').name, 'T1');
  assert.equal(findLine(lines, 'T9'), null);
  assert.equal(findLine(lines, ''), null);
  const t1 = lines[0];
  assert.deepEqual(
    [t1.mode, t1.typology, t1.label, t1.directions],
    ['tram', 10, 'Hauts du Chazal <> Chalezeule', ['Chalezeule', 'Hauts du Chazal']],
  );
});

test('stops: a name for both sides, an id for one, a unique partial name', () => {
  assert.deepEqual(findStop(stops, 'chamars'), { kind: 'place', id: null, name: 'Chamars' });
  assert.deepEqual(findStop(stops, 'T_CHAM1'), { kind: 'stop', id: 't_cham1', name: 'Chamars' });
  assert.deepEqual(findStop(stops, 'viotte'), { kind: 'place', id: null, name: 'Gare Viotte' });
  assert.deepEqual(findStop(stops, 'republique'), { kind: 'place', id: null, name: 'République' });
  assert.equal(findStop(stops, 'nowhere'), null);
  assert.equal(findStop(stops, '  '), null);
  const found = searchStops(stops, 'gare');
  assert.equal(found[0].name, 'Gare Viotte');
  assert.ok(found[0].ids.includes('t_gvio1') && found[0].ids.includes('GAREVIO1'));
  assert.deepEqual(searchStops(stops, ''), []);
});

test('the network is kept in /data and read again after 04:00 or seven days', async () => {
  const fetch = fakeGinko();
  const store = createStore({ path: storePath(), logger: silent });
  const clock = { now: NOW };
  const network = createNetwork({
    api: createGinkoClient({ getApiKey: () => KEY, fetch }),
    store,
    now: () => clock.now,
    isNewDay: (since) => newDaySince(since, clock.now, TZ),
    logger: silent,
  });
  assert.equal((await network.resolveLine('T2')).id, '102');
  assert.equal((await network.resolveStop('Chamars')).name, 'Chamars');
  assert.equal(network.peekLine('3').name, 'L3');
  const count = fetch.calls.length;
  await network.resolveLine('L3');
  assert.equal(fetch.calls.length, count, 'no reading while fresh');
  // 2026-10-18 04:10 in Paris: a new day of the network.
  clock.now = Date.parse('2026-10-18T02:10:00Z');
  fetch.state.fail = 'network';
  assert.equal((await network.resolveLine('L3')).id, '3', 'a failure keeps the known lines');
  fetch.state.fail = null;
  await network.lines();
  assert.equal(fetch.calls.filter((c) => c.method === 'DR/getLignes').length, 3);
  // A name the list does not hold: the fuzzy search of the API, asked once.
  fetch.state.places['la gare'] = fetch.state.places['gare viotte'];
  assert.deepEqual(await network.resolveStop('La gare'), {
    kind: 'place',
    id: null,
    name: 'Gare Viotte',
  });
  const asked = fetch.calls.length;
  assert.equal((await network.resolveStop('la  GARE')).name, 'Gare Viotte');
  assert.equal(await network.resolveStop('Nulle part'), null);
  assert.equal(await network.resolveStop('nulle part'), null);
  assert.equal(fetch.calls.length, asked + 1, 'each unknown name is asked once');
  // Kept in the store, written to /data.
  assert.equal(store.data.network.stops.length, stops.length);
  const path = storePath();
  const saved = createStore({ path, logger: silent });
  saved.data = store.data;
  await saved.save();
  const again = createStore({ path, logger: silent });
  await again.load();
  assert.equal(again.data.network.lines.length, lines.length);
});
