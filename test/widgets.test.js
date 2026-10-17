// The widget contents pass the validator of the SDK (what the core would
// drop or truncate), in every language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildDeparturesWidget,
  buildTrafficWidget,
  messageContent,
  readCount,
  BOARD_COUNT,
} from '../src/widgets.js';
import { parsePassages, passageOf } from '../src/departures.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, TZ, CHAMARS, VIOTTE, STATES, MESSAGES, passage } from './helpers/fixtures.js';

/**
 * @description Assert that the core would keep the content whole.
 * @param {object} content - The content.
 * @param {string} label - For the message.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
}

test('departures widget: next wait, passages with badges, update time, in every language', () => {
  const passages = parsePassages(VIOTTE.objets, {}, NOW);
  for (const language of LANGUAGES) {
    const content = buildDeparturesWidget({
      title: 'Gare Viotte',
      passages,
      readAt: NOW,
      count: 6,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(content, language);
    assert.equal(content.ttl_seconds, 60);
  }
  const fr = buildDeparturesWidget({
    title: 'Gare Viotte',
    passages,
    readAt: NOW,
    count: 6,
    language: 'fr',
    now: NOW,
    timeZone: TZ,
  });
  assert.deepEqual(
    fr.components.map((c) => c.type),
    ['text', 'value', 'card-list', 'text'],
  );
  const [, tile, list, caption] = fr.components;
  assert.deepEqual([tile.value, tile.label], [1, 'Prochain · T2']);
  assert.deepEqual(list.items[0], {
    title: 'T2 → Hauts du Chazal',
    badge: { text: '1 min', color: 'neutral' },
    subtitle: 'Horaire théorique (véhicule non localisé)',
  });
  assert.deepEqual(list.items[1].badge, { text: '9 min', color: 'neutral' });
  assert.equal(caption.text, 'Ginko · mis à jour à 22:19');
});

test('departures widget: stops not served, a full bus, nothing announced', () => {
  const chamars = parsePassages(CHAMARS.objets, {}, NOW);
  const content = buildDeparturesWidget({
    title: 'Chamars',
    passages: chamars,
    readAt: NOW,
    count: 8,
    language: 'en',
    now: NOW,
    timeZone: TZ,
  });
  assertValid(content, 'chamars');
  assert.equal(content.components[1].type, 'card-list', 'no wait tile: nothing serves the stop');
  assert.deepEqual(content.components[1].items[0].badge, { text: 'Non desservi', color: 'danger' });
  const full = [
    passageOf(
      passage({
        typeDeTemps: 2,
        temps: 'Bus complet',
        alternance: true,
        affluence: 2,
        tempsEnSeconde: 400,
      }),
      NOW,
    ),
  ];
  const busy = buildDeparturesWidget({
    title: 'X',
    passages: full,
    readAt: NOW,
    count: 6,
    language: 'de',
    now: NOW,
    timeZone: TZ,
  });
  assertValid(busy, 'full');
  assert.equal(busy.components[2].items[0].subtitle, 'Bus complet · Stark besetzt');
  const empty = buildDeparturesWidget({
    title: 'X',
    passages: [],
    readAt: NOW,
    count: 6,
    language: 'es',
    now: NOW,
    timeZone: TZ,
  });
  assertValid(empty, 'empty');
  assert.equal(empty.ttl_seconds, 300);
  assert.equal(empty.components[1].text, 'Ningún paso anunciado. Ginko · actualizado a las 22:19.');
});

test('traffic widget: states, messages with their text and link, in every language', () => {
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  const lines = [
    { id: '101', name: 'T1' },
    { id: '4', name: 'L4' },
    { id: '110', name: 'Plan B' },
  ].map((line) => ({ line, traffic: lineTraffic(traffic, line.id) }));
  for (const language of LANGUAGES) {
    const content = buildTrafficWidget({ lines, readAt: NOW, language, timeZone: TZ });
    assertValid(content, language);
  }
  const fr = buildTrafficWidget({ lines, readAt: NOW, language: 'fr', timeZone: TZ });
  assert.deepEqual(
    fr.components[1].items.map((item) => [item.label, item.value, item.color]),
    [
      ['T1', 'Perturbation en cours', 'warning'],
      ['L4', 'Circulation interrompue', 'danger'],
      ['Plan B', 'Ne circule pas en ce moment', 'neutral'],
    ],
  );
  const [first] = fr.components[2].items;
  // One card for the demonstration on T1 and T2 (one message per line for Ginko).
  assert.deepEqual(
    [first.title, first.subtitle, first.badge],
    ['Manifestation', 'Perturbation en cours', { text: 'T1', color: 'warning' }],
  );
  const both = buildTrafficWidget({
    lines: [
      { line: { id: '101', name: 'T1' }, traffic: lineTraffic(traffic, '101') },
      { line: { id: '102', name: 'T2' }, traffic: lineTraffic(traffic, '102') },
    ],
    readAt: NOW,
    language: 'en',
    timeZone: TZ,
  });
  assert.deepEqual(
    both.components[2].items.map((item) => [item.title, item.badge.text]),
    [
      ['Manifestation', 'T1 · T2'],
      ['Travaux Ginko - P+R Ile de France', 'T1 · T2'],
    ],
  );
  assert.equal(first.links[0].url.startsWith('https://www.ginko.voyage/'), true);
  assert.ok(first.description.length > 20);
  const calm = buildTrafficWidget({
    lines: [{ line: { id: '7', name: '7' }, traffic: { state: 'normal', messages: [] } }],
    readAt: NOW,
    language: 'en',
    timeZone: TZ,
  });
  assertValid(calm, 'calm');
  assert.equal(
    calm.components[2].text,
    'No traffic message for these lines. Ginko · updated at 22:19.',
  );
});

test('messages and settings', () => {
  assertValid(messageContent('Hello'), 'message');
  assert.equal(readCount('3', BOARD_COUNT), 3);
  assert.equal(readCount(99, BOARD_COUNT), 8);
  assert.equal(readCount('', BOARD_COUNT), 6);
});
