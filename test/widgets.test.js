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
  routeValue,
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

test('departures widget: one compact row per route, timetable in grey, in every language', () => {
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
    ['text', 'text', 'status'],
    'no tile, no card: the stop, its update time, a row per route',
  );
  const [heading, caption, status] = fr.components;
  assert.equal(heading.text, 'Gare Viotte');
  assert.equal(caption.text, 'Ginko · mis à jour à 22:19');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.color]),
    [
      ['T2 → Hauts du Chazal', '1 · 9 · 27 min · théorique', 'neutral'],
      ['L3 → Pôle Temis', '10 · 33 min · 23:29', 'success'],
      ['L5 → Bregille', '17 · 54 min · 23:47', 'success'],
      // A long destination keeps its row on one line: one passage less.
      ['L3 → Centre-ville - 8 Septembre', '18 · 45 min', 'success'],
      ['L5 → St Claude', '27 min · 23:28 · 00:03', 'success'],
    ],
  );
  const two = buildDeparturesWidget({
    title: 'Gare Viotte',
    passages,
    readAt: NOW,
    count: 2,
    language: 'de',
    now: NOW,
    timeZone: TZ,
  });
  assert.deepEqual(
    two.components[2].items.map((item) => item.value),
    ['1 · 9 · 27 Min. · Fahrplan', '10 · 33 Min. · 23:29'],
  );
});

test('departures widget: stops not served, mixed timetable, a full bus, nothing announced', () => {
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
  assert.deepEqual(
    content.components[2].items.map((item) => [item.label, item.value, item.color]),
    [
      ['T2 → Hauts du Chazal', 'Non desservi', 'danger'],
      ['T1 → Chalezeule', 'Non desservi', 'danger'],
      ['T2 → Gare Viotte', 'Non desservi', 'danger'],
      ['T1 → Hauts du Chazal', 'Non desservi', 'danger'],
    ],
  );
  // A located tram, then two timetable times: a star on those, and its key.
  const mixed = [
    passage({ tempsEnSeconde: 120, destination: 'Chalezeule' }),
    passage({ tempsEnSeconde: 600, destination: 'Chalezeule', fiable: false }),
    passage({ tempsEnSeconde: 1200, destination: 'Chalezeule', fiable: false }),
  ].map((raw) => passageOf(raw, NOW));
  const located = buildDeparturesWidget({
    title: 'X',
    passages: mixed,
    readAt: NOW,
    count: 6,
    language: 'fr',
    now: NOW,
    timeZone: TZ,
  });
  assertValid(located, 'mixed');
  assert.deepEqual(located.components[2].items[0], {
    label: 'T2 → Chalezeule',
    value: '2 · 10* · 20* min',
    color: 'success',
  });
  assert.equal(located.components[1].text, 'Ginko · mis à jour à 22:19 · * théorique');
  assert.deepEqual(routeValue(mixed.slice(1), { language: 'en', now: NOW, timeZone: TZ }), {
    value: '10 · 20 min · timetable',
    starred: false,
  });
  const full = [
    passageOf(
      passage({ typeDeTemps: 2, temps: 'Bus complet', alternance: true, tempsEnSeconde: 400 }),
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
  assert.equal(busy.components[2].items[0].value, '6 Min. (Bus complet)');
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
