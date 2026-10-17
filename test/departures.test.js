// The passages of a stop, from real answers: waits, times after an hour,
// words replacing the time, arrivals left out, filters by line and direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePassages,
  passageOf,
  directionTerms,
  minutesLeft,
  servedPassages,
  routeOf,
} from '../src/departures.js';
import { CHAMARS, VIOTTE, NOW, passage } from './helpers/fixtures.js';

test('Gare Viotte: arrivals left out, waits and times, soonest first', () => {
  const passages = parsePassages(VIOTTE.objets, {}, NOW);
  // The three T2 trams ending at Gare Viotte are arrivals: nobody boards them.
  assert.equal(passages.length, 15);
  assert.ok(passages.every((p) => p.destination !== 'Gare Viotte'));
  const [first] = passages;
  assert.deepEqual(
    [first.line, first.destination, first.wait, first.kind, first.served, first.reliable],
    ['T2', 'Hauts du Chazal', 60, 'wait', true, false],
  );
  const late = passages.find((p) => p.kind === 'time');
  assert.equal(late.display, '23:30');
  assert.equal(late.at, NOW + late.wait * 1000);
  assert.ok(passages.every((p, i) => i === 0 || passages[i - 1].wait <= p.wait));
});

test('filters: the line, the words of the direction (with alternatives)', () => {
  const l3 = parsePassages(VIOTTE.objets, { lineId: '3' }, NOW);
  assert.deepEqual([...new Set(l3.map((p) => p.line))], ['L3']);
  const temis = parsePassages(VIOTTE.objets, { lineId: '3', direction: 'temis' }, NOW);
  assert.ok(temis.length === 3 && temis.every((p) => p.destination.startsWith('Pôle Temis')));
  // "par Campus": the route words count too.
  const either = parsePassages(VIOTTE.objets, { direction: 'Bregille | Hauts du Chazal' }, NOW);
  assert.deepEqual([...new Set(either.map((p) => p.line))].sort(), ['L5', 'T2']);
  assert.deepEqual(directionTerms(' Chalezeule |  | Gare '), ['chalezeule', 'gare']);
});

test('Chamars: the trams do not serve the stop, with the word of Ginko', () => {
  const passages = parsePassages(CHAMARS.objets, { lineId: '101' }, NOW);
  assert.equal(passages.length, 6);
  assert.ok(passages.every((p) => !p.served && p.reason === 'Non desservi' && p.kind === 'text'));
  assert.equal(passages[0].trafficId, 30233);
  assert.deepEqual(servedPassages(passages, NOW), []);
});

test('a full bus alternating with its wait still serves the stop', () => {
  const full = passageOf(
    passage({ typeDeTemps: 2, temps: 'Bus complet', alternance: true, tempsEnSeconde: 420 }),
    NOW,
  );
  assert.deepEqual(
    [full.served, full.note, full.reason, full.wait],
    [true, 'Bus complet', '', 420],
  );
  const crowd = passageOf(passage({ affluence: 2 }), NOW);
  assert.equal(crowd.crowd, 2);
  assert.equal(passageOf(passage({ affluence: -2 }), NOW).crowd, null);
});

test('minutes left, rounded down like the screens; the route of a passage', () => {
  const p = passageOf(passage({ tempsEnSeconde: 179 }), NOW);
  assert.equal(minutesLeft(p, NOW), 2);
  assert.equal(minutesLeft(p, NOW + 200000), 0);
  assert.equal(minutesLeft({ at: null }, NOW), null);
  assert.equal(routeOf(p), '102|1|hauts du chazal');
  assert.deepEqual(servedPassages([p], NOW + 179000 + 31000), []);
});
