// The scene triggers (pure logic): reminders close to their mark and once,
// stops not served once per transition, line changes after a baseline; the
// payloads hold exactly the declared keys, the outputs exactly the declared
// outputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRIGGERS,
  REMINDER_MINUTES,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_TRAFFIC_OUTPUTS,
  tolerance,
  detectReminders,
  detectNotServed,
  detectLineChanges,
  reminderData,
  notServedData,
  lineEvent,
  nextDeparturesOutputs,
  lineTrafficOutputs,
  pick,
} from '../src/events.js';
import { parsePassages, passageOf } from '../src/departures.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, TZ, CHAMARS, VIOTTE, STATES, MESSAGES, passage } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declared = (key) => {
  const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
  return [...trigger.fields, ...trigger.variables].map((entry) => entry.key).sort();
};
const outputs = (key) =>
  manifest.scene_actions.find((entry) => entry.key === key).outputs.map((entry) => entry.key);
const FOLLOWED = {
  key: 'n-gare-viotte_102',
  name: 'Gare Viotte (T2)',
  deviceId: 'ext:ginko:stop:n-gare-viotte_102',
  stop: { kind: 'place', id: null, name: 'Gare Viotte' },
};
const T1 = { id: '101', name: 'T1', deviceId: 'ext:ginko:line:101' };
const L4 = { id: '4', name: 'L4', deviceId: 'ext:ginko:line:4' };

/**
 * @description A flat payload: scalars only, 30 keys at most, strings ≤ 1000.
 * @param {object} data - The payload.
 */
function assertFlat(data) {
  assert.ok(Object.keys(data).length <= 30);
  for (const [key, value] of Object.entries(data)) {
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      `${key}: ${typeof value}`,
    );
    if (typeof value === 'string') {
      assert.ok(value.length <= 1000, key);
    }
  }
}

test('the reminder marks never overlap', () => {
  for (let i = 1; i < REMINDER_MINUTES.length; i += 1) {
    const mark = REMINDER_MINUTES[i];
    assert.ok(mark - tolerance(mark) >= REMINDER_MINUTES[i - 1], `${mark}`);
  }
  assert.deepEqual(
    manifest.scene_triggers
      .find((entry) => entry.key === TRIGGERS.DEPARTURE_SOON)
      .fields.find((field) => field.key === 'minutes')
      .options.map((option) => option.value),
    REMINDER_MINUTES.map(String),
  );
});

test('reminders: close to the mark, once per passage, even when its time drifts', () => {
  const read = (seconds, now = NOW) => [passageOf(passage({ tempsEnSeconde: seconds }), now)];
  // 5 min 20 s: nothing; 4 min 50 s: the 5-minute mark.
  assert.deepEqual(detectReminders({ passages: read(320), now: NOW }).due, []);
  let { due, fired } = detectReminders({ passages: read(290), now: NOW });
  assert.deepEqual(
    due.map((d) => d.mark),
    [5],
  );
  // A minute later, the same tram announced 30 s later: the mark is known.
  ({ due, fired } = detectReminders({
    passages: read(260, NOW + 60000),
    fired,
    now: NOW + 60000,
  }));
  assert.deepEqual(due, []);
  // 2 min 40 s left: the 3-minute mark; 1 min 40 s: the 2-minute mark.
  ({ due, fired } = detectReminders({
    passages: read(160, NOW + 120000),
    fired,
    now: NOW + 120000,
  }));
  assert.deepEqual(
    due.map((d) => d.mark),
    [3],
  );
  ({ due, fired } = detectReminders({
    passages: read(100, NOW + 180000),
    fired,
    now: NOW + 180000,
  }));
  assert.deepEqual(
    due.map((d) => d.mark),
    [2],
  );
  // A passage not serving the stop never fires.
  const word = [
    passageOf(passage({ typeDeTemps: 2, temps: 'Déviation', tempsEnSeconde: 290 }), NOW),
  ];
  assert.deepEqual(detectReminders({ passages: word, now: NOW }).due, []);
  // Old reminders are forgotten.
  assert.deepEqual(detectReminders({ passages: [], fired, now: NOW + 3600000 }).fired, []);
});

test('reminder payload: the declared keys, flat, in every language', () => {
  const [p] = [passageOf(passage({ tempsEnSeconde: 290, fiable: false }), NOW)];
  for (const language of LANGUAGES) {
    const data = reminderData(FOLLOWED, p, 5, { language, timeZone: TZ });
    assert.deepEqual(Object.keys(data).sort(), declared(TRIGGERS.DEPARTURE_SOON));
    assertFlat(data);
    assert.equal(data.minutes, '5');
    assert.equal(data.time, '22:23');
    assert.equal(data.reliable, false);
  }
  assert.equal(
    reminderData(FOLLOWED, p, 5, { language: 'fr', timeZone: TZ }).summary,
    'T2 vers Hauts du Chazal est attendu à Gare Viotte dans 5 min (22:23, horaire théorique : le véhicule n’est pas localisé).',
  );
});

test('stop not served: a baseline first, then once per route until it is served again', () => {
  const chamars = parsePassages(CHAMARS.objets, {}, NOW);
  let { newly, memory } = detectNotServed({ passages: chamars, memory: null, now: NOW });
  assert.deepEqual(newly, [], 'the first reading is a baseline');
  assert.equal(Object.keys(memory.routes).length, 4);
  // Served again on the T1 towards Chalezeule, then not served once more.
  const served = chamars.map((p) =>
    p.lineId === '101' && p.outbound ? { ...p, served: true, reason: '' } : p,
  );
  ({ newly, memory } = detectNotServed({ passages: served, memory, now: NOW }));
  assert.deepEqual(newly, []);
  assert.equal(Object.keys(memory.routes).length, 3);
  ({ newly, memory } = detectNotServed({ passages: chamars, memory, now: NOW }));
  assert.deepEqual(
    newly.map((p) => `${p.line} ${p.destination}`),
    ['T1 Chalezeule'],
  );
  // A route with no passage at all keeps its state.
  ({ newly } = detectNotServed({ passages: [], memory, now: NOW }));
  assert.deepEqual(newly, []);
  for (const language of LANGUAGES) {
    const data = notServedData(FOLLOWED, chamars[0], { language });
    assert.deepEqual(Object.keys(data).sort(), declared(TRIGGERS.STOP_NOT_SERVED));
    assertFlat(data);
  }
});

test('line changes: baseline, disrupted, interrupted, restored, new messages', () => {
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  let { changes, seen } = detectLineChanges({ lines: [T1, L4], traffic, now: NOW });
  assert.deepEqual(changes, [], 'the first reading is a baseline');
  assert.equal(seen['101'].state, 'disrupted');
  // T1 back to normal, its messages gone; L4 unchanged.
  const calm = parseTraffic(
    STATES.objets.map((s) => (s.idLigne === '101' ? { ...s, etat: 1 } : s)),
    MESSAGES.objets.filter((m) => !m.lignes.includes('101')),
  );
  ({ changes, seen } = detectLineChanges({
    lines: [T1, L4],
    traffic: calm,
    seen,
    now: NOW + 60000,
  }));
  assert.deepEqual(
    changes.map((c) => [c.key, c.line.name]),
    [[TRIGGERS.LINE_RESTORED, 'T1']],
  );
  // T1 interrupted again with a new message; the old ones are remembered.
  const blocked = parseTraffic(
    STATES.objets.map((s) => (s.idLigne === '101' ? { ...s, etat: 6 } : s)),
    [
      ...MESSAGES.objets,
      { ...MESSAGES.objets[5], id: 99999, idEvenement: 4000, titre: 'Accident', etat: 6 },
    ],
  );
  ({ changes, seen } = detectLineChanges({
    lines: [T1, L4],
    traffic: blocked,
    seen,
    now: NOW + 120000,
  }));
  assert.deepEqual(
    changes.map((c) => [c.key, c.line.name, c.message?.title]),
    [
      [TRIGGERS.LINE_DISRUPTED, 'T1', 'Accident'],
      [TRIGGERS.TRAFFIC_MESSAGE, 'T1', 'Accident'],
    ],
  );
  // A line missing from the answer keeps its state: no event.
  const missing = parseTraffic([], MESSAGES.objets);
  ({ changes } = detectLineChanges({ lines: [L4], traffic: missing, seen, now: NOW + 180000 }));
  assert.deepEqual(changes, []);
});

test('line payloads: the declared keys, flat, in every language', () => {
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  const t1 = lineTraffic(traffic, '101');
  const cases = [
    { key: TRIGGERS.LINE_DISRUPTED, line: T1, traffic: t1, message: t1.messages[0] },
    { key: TRIGGERS.LINE_RESTORED, line: T1, traffic: { state: 'normal', messages: [] } },
    { key: TRIGGERS.TRAFFIC_MESSAGE, line: T1, traffic: t1, message: t1.messages[1] },
  ];
  for (const language of LANGUAGES) {
    for (const change of cases) {
      const event = lineEvent(change, { language });
      assert.equal(event.key, change.key);
      assert.deepEqual(Object.keys(event.data).sort(), declared(change.key), change.key);
      assertFlat(event.data);
    }
  }
  const disrupted = lineEvent(cases[0], { language: 'fr' }).data;
  assert.equal(disrupted.severity, 'disrupted');
  assert.equal(disrupted.summary, 'Ligne Ginko T1 : Perturbation en cours (Manifestation).');
  assert.equal(lineEvent(cases[2], { language: 'en' }).data.kind, 'information');
});

test('scene action outputs: the declared outputs, the summaries', () => {
  assert.deepEqual(NEXT_DEPARTURES_OUTPUTS, outputs('get_next_departures'));
  assert.deepEqual(LINE_TRAFFIC_OUTPUTS, outputs('get_line_traffic'));
  const viotte = parsePassages(VIOTTE.objets, { lineId: '3' }, NOW);
  const result = pick(
    nextDeparturesOutputs({
      followed: FOLLOWED,
      passages: viotte,
      now: NOW,
      language: 'fr',
      timeZone: TZ,
    }),
    NEXT_DEPARTURES_OUTPUTS,
  );
  assert.deepEqual(
    [result.found, result.line, result.minutes, result.time, result.following_minutes],
    [true, 'L3', 10, '22:29', 18],
  );
  assert.equal(
    result.summary,
    'Prochain passage à Gare Viotte : L3 vers Pôle Temis dans 10 min. Le suivant dans 18 min.',
  );
  const chamars = parsePassages(CHAMARS.objets, {}, NOW);
  const none = nextDeparturesOutputs({
    followed: FOLLOWED,
    passages: chamars,
    now: NOW,
    language: 'en',
  });
  assert.deepEqual([none.found, none.minutes, none.not_served], [false, -1, 12]);
  assert.match(none.summary, /No passage serves Gare Viotte at the moment: Non desservi/);
  assert.match(
    nextDeparturesOutputs({ followed: FOLLOWED, passages: [], now: NOW, language: 'de' }).summary,
    /Keine Abfahrt/,
  );
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  const line = lineTrafficOutputs({ line: L4, traffic: lineTraffic(traffic, '4'), language: 'es' });
  assert.deepEqual(Object.keys(line), LINE_TRAFFIC_OUTPUTS);
  assert.deepEqual([line.state, line.disrupted, line.disruption_count], ['interrupted', true, 1]);
  assert.equal(line.state_label, 'Circulación interrumpida');
});
