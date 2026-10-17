import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  readLanguage,
  readInterval,
  parseLines,
  DEFAULT_INTERVAL,
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
    lines: ['T1', 'l3', '7'],
    interval: 30,
    language: 'de',
  });
  assert.deepEqual(normalizeConfig(null), {
    apiKey: '',
    stops: [],
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
