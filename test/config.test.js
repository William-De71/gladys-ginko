import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  readLanguage,
  readInterval,
  parseLines,
  parseAddedStops,
  DEFAULT_INTERVAL,
  MAX_ADDED_STOPS,
} from '../src/config.js';

test('stops, lines, interval and language from the raw config', () => {
  const config = normalizeConfig({
    api_key: ' key ',
    stop_1: ' Chamars ',
    stop_1_line: 'T1',
    stop_1_direction: 'Chalezeule',
    stop_2: '',
    stop_3: 't_gvio1',
    lines: 'T1, l3 ; 7, T1',
    interval: '30',
    language: 'de',
  });
  assert.deepEqual(config, {
    apiKey: 'key',
    stops: [
      { slot: 1, stop: 'Chamars', line: 'T1', direction: 'Chalezeule' },
      { slot: 3, stop: 't_gvio1', line: '', direction: '' },
    ],
    addedStops: [],
    lines: ['T1', 'l3', '7'],
    interval: 30,
    language: 'de',
  });
  assert.deepEqual(normalizeConfig(null), {
    apiKey: '',
    stops: [],
    addedStops: [],
    lines: [],
    interval: DEFAULT_INTERVAL,
    language: 'auto',
  });
});

test('bounds: six lines, the intervals offered, the stored language', () => {
  assert.equal(parseLines('1,2,3,4,5,6,7,8').length, 6);
  assert.deepEqual(parseLines(undefined), []);
  assert.equal(readInterval(45), DEFAULT_INTERVAL);
  assert.equal(readInterval(300), 300);
  assert.equal(readLanguage({ last_language: 'es' }, 'fr'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'fr'), 'fr');
  assert.equal(readLanguage(undefined, 'en'), 'en');
});

test('the stops added with the buttons follow the three of the form', () => {
  const added = [
    { stop: 'BQTSO01', line: '12', direction: '' },
    { stop: ' Gare Viotte ', line: '', direction: 'Temis' },
    { stop: '', line: 'T1' },
    'Chamars',
  ];
  const config = normalizeConfig({ stop_2: 'Chamars', added_stops: added });
  assert.deepEqual(config.stops, [
    { slot: 2, stop: 'Chamars', line: '', direction: '' },
    { slot: null, added: 1, stop: 'BQTSO01', line: '12', direction: '' },
    { slot: null, added: 2, stop: 'Gare Viotte', line: '', direction: 'Temis' },
  ]);
  assert.equal(config.addedStops.length, 2);
  // Stored as JSON text by an older core: read the same.
  assert.deepEqual(parseAddedStops(JSON.stringify(added)), config.addedStops);
  assert.deepEqual(parseAddedStops('not json'), []);
  assert.deepEqual(parseAddedStops(undefined), []);
  const many = Array.from({ length: 30 }, (_, n) => ({ stop: `S${n}` }));
  assert.equal(parseAddedStops(many).length, MAX_ADDED_STOPS);
});
