// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake Ginko API serving real (reduced) answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, IDLE_INTERVAL_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { fakeGinko, storePath, silent, passage, NOW, TZ, KEY } from './helpers/fixtures.js';

const CONFIG = {
  api_key: KEY,
  stop_1: 'gare viotte',
  stop_1_line: 'T2',
  stop_1_direction: 'Hauts du Chazal',
  stop_2: 'Chamars',
  stop_3: 'Nulle part',
  lines: 'T1, L4, T9',
  interval: '60',
  language: 'fr',
};
const PREFIX = 'ext:test-integration';
const VIOTTE = `${PREFIX}:stop:n-gare-viotte_102_hauts-du-chazal`;
const CHAMARS = `${PREFIX}:stop:n-chamars`;
const T1 = `${PREFIX}:line:101`;
const L4 = `${PREFIX}:line:4`;
const MINUTE = 60 * 1000;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, api, path, logger }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  api = fakeGinko(),
  path = storePath(),
  logger = silent,
} = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const methods = (api) => api.calls.map((call) => call.method);

test('two stops and two lines become four devices; unknown names are reported', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [VIOTTE, 'Ginko Gare Viotte (T2 → Hauts du Chazal)'],
      [CHAMARS, 'Ginko Chamars'],
      [T1, 'Ginko ligne T1'],
      [L4, 'Ginko ligne L4'],
    ],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.fr,
    'Connecté à Ginko : 2 arrêt(s), 2 ligne(s), arrêts lus toutes les 60 s. Inconnu de Ginko : Nulle part, T9.',
  );
  // The network once, the unknown name asked to the fuzzy search once, each
  // stop once, the traffic once (two methods).
  assert.deepEqual(methods(api).sort(), [
    'DR/getArrets',
    'DR/getLignes',
    'TR/getEtatLignes',
    'TR/getMessages',
    'TR/getTempsLieu',
    'TR/getTempsLieu',
    'TR/getTempsLieu',
  ]);
  assert.equal(
    api.calls.find((call) => call.method === 'TR/getTempsLieu').params.nom,
    'Nulle part',
  );
  // The first readings are a baseline; only a reminder already due fires
  // (the T2 of the fixture comes in 9 min 39 s: the 10-minute mark).
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => [event.key, event.data.minutes]),
    [[TRIGGERS.DEPARTURE_SOON, '10']],
  );
});

test('created devices get their states, sent again after the creation', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, VIOTTE);
  await created(gladys, T1);
  assert.equal(gladys.fake.lastState(`${VIOTTE}:wait`), 1);
  assert.equal(gladys.fake.lastState(`${VIOTTE}:following`), 9);
  assert.equal(gladys.fake.lastState(`${VIOTTE}:not_served`), 0);
  assert.equal(
    gladys.fake.lastState(`${VIOTTE}:next`),
    'T2 → Hauts du Chazal · 1 min (horaire théorique)',
  );
  assert.equal(gladys.fake.lastState(`${T1}:status`), 'Perturbation en cours : Manifestation');
  assert.equal(gladys.fake.lastState(`${T1}:disruptions`), 1);
  // A minute later the first tram is gone; Chamars, not created, gets nothing.
  api.state.places['gare viotte'].objets.listeTemps.splice(3, 1);
  clock.now += MINUTE;
  await app.readStops();
  assert.equal(gladys.fake.lastState(`${VIOTTE}:wait`), 9);
  assert.equal(gladys.fake.lastState(`${CHAMARS}:next`), undefined);
});

test('departure soon: fired close to its mark, once, between two readings too', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.state.places['gare viotte'].objets.listeTemps = [
    passage({ idArret: 't_gvio2', tempsEnSeconde: 400, sensAller: false }),
  ];
  const soon = () => eventsOf(gladys, TRIGGERS.DEPARTURE_SOON).slice(1);
  clock.now += MINUTE;
  await app.readStops();
  assert.deepEqual(soon(), []);
  // 6 min 40 s at the reading; 4 min 50 s left 110 s later: the 5-minute mark.
  clock.now += 110 * 1000;
  await app.checkReminders();
  const [event] = soon();
  assert.deepEqual(event.data, {
    stop: VIOTTE,
    minutes: '5',
    stop_name: 'Gare Viotte (T2 → Hauts du Chazal)',
    line: 'T2',
    destination: 'Hauts du Chazal',
    time: '22:26',
    reliable: true,
    summary: 'T2 vers Hauts du Chazal arrive à Gare Viotte dans 5 min (22:26).',
  });
  await app.checkReminders();
  assert.equal(soon().length, 1, 'once');
});

test('stop not served and line changes fire once, after the baseline', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  // Gare Viotte: the next T2 is diverted.
  api.state.places['gare viotte'].objets.listeTemps = [
    passage({ idArret: 't_gvio2', typeDeTemps: 2, temps: 'Déviation', sensAller: false }),
  ];
  // T1 back to normal, L4 still interrupted, a new message on L4.
  api.state.states.objets.find((s) => s.idLigne === '101').etat = 1;
  api.state.messages.objets.push({
    ...api.state.messages.objets[0],
    id: 31000,
    idEvenement: 3600,
    titre: 'Arrêt Lanchy reporté',
    etat: 5,
  });
  clock.now += 5 * MINUTE;
  await app.readStops();
  await app.trafficTick();
  const [notServed] = eventsOf(gladys, TRIGGERS.STOP_NOT_SERVED);
  assert.equal(notServed.data.stop, VIOTTE);
  assert.equal(notServed.data.reason, 'Déviation');
  assert.equal(
    notServed.data.summary,
    'T2 vers Hauts du Chazal ne dessert pas Gare Viotte : Déviation.',
  );
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.LINE_RESTORED).map((e) => [e.data.line, e.data.state]),
    [[T1, 'normal']],
  );
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.TRAFFIC_MESSAGE).map((e) => [e.data.line, e.data.kind, e.data.title]),
    [[L4, 'disrupted', 'Arrêt Lanchy reporté']],
  );
  const count = gladys.fake.sceneEvents.length;
  clock.now += 5 * MINUTE;
  await app.readStops();
  await app.trafficTick();
  assert.equal(gladys.fake.sceneEvents.length, count, 'nothing new: no event');
});

test('a restart never fires the same event twice', async (t) => {
  const path = storePath();
  const api = fakeGinko();
  const first = await startApp({ path, api });
  api.state.states.objets.find((s) => s.idLigne === '101').etat = 6;
  first.clock.now += 5 * MINUTE;
  await first.app.trafficTick();
  assert.equal(eventsOf(first.gladys, TRIGGERS.LINE_DISRUPTED).length, 1);
  await first.gladys.fake.shutdown();
  const second = await startApp({ path, api });
  t.after(() => second.gladys.fake.shutdown());
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
  assert.ok(
    !methods(api).slice(-4).includes('DR/getLignes'),
    'the network is read from /data, not again',
  );
});

test('a quiet stop is read every 10 minutes, the others at the interval', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.state.places['gare viotte'].objets.listeTemps = [];
  clock.now += MINUTE;
  await app.readStops();
  const reads = () => api.calls.filter((c) => c.method === 'TR/getTempsLieu').length;
  const before = reads();
  clock.now += MINUTE;
  await app.readStops();
  assert.equal(reads(), before + 1, 'only Chamars');
  clock.now += IDLE_INTERVAL_MS;
  await app.readStops();
  assert.equal(reads(), before + 3);
});

test('a refused key, then an API down: clear statuses, the last passages kept', async (t) => {
  const { gladys, app, api, clock } = await startApp({ config: { ...CONFIG, api_key: 'old' } });
  t.after(() => gladys.fake.shutdown());
  let status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.equal(
    status.message.en,
    'Ginko refuses the API key (La clé donnée en paramètre est invalide). A temporary key only lasts 24 hours.',
  );
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  api.state.fail = 'network';
  clock.now += MINUTE;
  await app.readStops();
  await app.trafficTick();
  status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /^L’API Ginko ne répond pas \(ECONNREFUSED\)/);
  const widget = await gladys.fake.widgetGet(WIDGETS.DEPARTURES, { language: 'en' });
  assert.equal(widget.data.content.components[0].text, 'Gare Viotte (T2 → Hauts du Chazal)');
  api.state.fail = null;
  clock.now += 2 * MINUTE;
  await app.readStops();
  await app.trafficTick();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('without a key: nothing is read, the status says what to do', async (t) => {
  const { gladys, api } = await startApp({ config: { stop_1: 'Chamars' } });
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(api.calls, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.de, /Ginko-API-Schlüssel/);
  const widget = await gladys.fake.widgetGet(WIDGETS.TRAFFIC, { language: 'fr' });
  assert.match(widget.data.content.components[0].text, /clé d’API Ginko/);
});

test('widgets: followed stops, a typed stop, lines; valid in every language', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const events = gladys.fake.sceneEvents.length;
  const cases = [
    [WIDGETS.DEPARTURES, {}],
    [WIDGETS.DEPARTURES, { stop: CHAMARS }],
    [WIDGETS.DEPARTURES, { stop_name: 'viotte', line: 'L5', count: 3 }],
    [WIDGETS.DEPARTURES, { stop_name: 'Nowhere' }],
    [WIDGETS.TRAFFIC, {}],
    [WIDGETS.TRAFFIC, { lines: 'T2, Plan B' }],
    [WIDGETS.TRAFFIC, { lines: 'Z9' }],
  ];
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const [key, settings] of cases) {
      const answer = await gladys.fake.widgetGet(key, { settings, language });
      assert.equal(answer.success, true, `${key} ${JSON.stringify(settings)} ${language}`);
      assert.deepEqual(validateWidgetContent(answer.data.content), [], `${key} ${language}`);
    }
  }
  const typed = await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
    settings: { stop_name: 'viotte', line: 'L5', count: 3 },
    language: 'fr',
  });
  const [heading, , list] = typed.data.content.components;
  assert.equal(heading.text, 'Gare Viotte (L5)');
  assert.equal(list.items.length, 3);
  assert.ok(list.items.every((item) => item.title.startsWith('L5 → ')));
  const lines = await gladys.fake.widgetGet(WIDGETS.TRAFFIC, {
    settings: { lines: 'T2, Plan B' },
    language: 'en',
  });
  assert.deepEqual(
    lines.data.content.components[1].items.map((item) => item.label),
    ['T2', 'Plan B'],
  );
  assert.equal(gladys.fake.sceneEvents.length, events, 'a widget never fires an event');
});

test('scene actions: next passages of a stop, traffic of a line', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const events = gladys.fake.sceneEvents.length;
  const next = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, {
    stop: VIOTTE,
  });
  assert.equal(next.success, true);
  assert.deepEqual(
    [next.data.outputs.line, next.data.outputs.minutes, next.data.outputs.following_minutes],
    ['T2', 1, 9],
  );
  assert.equal(
    next.data.outputs.summary,
    'Prochain passage à Gare Viotte : T2 vers Hauts du Chazal dans 1 min (horaire théorique). Le suivant dans 9 min.',
  );
  const chamars = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, {
    stop: CHAMARS,
  });
  assert.equal(chamars.data.outputs.found, false);
  const line = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_LINE_TRAFFIC, { line: L4 });
  assert.deepEqual(
    [line.data.outputs.state, line.data.outputs.disrupted, line.data.outputs.state_label],
    ['interrupted', true, 'Circulation interrompue'],
  );
  const first = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_LINE_TRAFFIC, {});
  assert.equal(first.data.outputs.line_name, 'T1', 'empty: the first line');
  assert.equal(gladys.fake.sceneEvents.length, events, 'an action never fires an event');
});

test('configuration actions: test, find a stop, diagnostic without the key', async (t) => {
  const lines = [];
  const logger = { ...silent, info: (line) => lines.push(line) };
  const { gladys } = await startApp({ logger });
  t.after(() => gladys.fake.shutdown());
  const tested = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(
    tested.data.message.fr,
    'Clé d’API acceptée, 9 lignes aujourd’hui · Gare Viotte (T2 → Hauts du Chazal) : 3 passage(s), prochain T2 dans 1 min · Chamars : 12 passage(s), prochain – · Ligne T1 : Perturbation en cours · Ligne L4 : Circulation interrompue · inconnu : Nulle part · inconnu : T9',
  );
  const found = await gladys.fake.action(ACTIONS.SEARCH_STOP, { query: 'gare' });
  assert.match(found.data.message.en, /Gare Viotte \(.*t_gvio1.*\)/);
  const short = await gladys.fake.action(ACTIONS.SEARCH_STOP, { query: 'g' });
  assert.match(short.data.message.es, /al menos dos letras/);
  const none = await gladys.fake.action(ACTIONS.SEARCH_STOP, { query: 'zzz' });
  assert.match(none.data.message.fr, /Aucun arrêt Ginko ne correspond à « zzz »/);
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.fr, /Diagnostic écrit/);
  const report = lines.filter((line) => line.startsWith('Ginko diagnostic')).join('');
  assert.match(report, /"key":"n-gare-viotte_102_hauts-du-chazal"/);
  assert.match(report, /"apiKey":"set"/);
  assert.doesNotMatch(report, new RegExp(KEY));
});

test('an id typed for one side of the street reads only that stop', async (t) => {
  const { gladys, api } = await startApp({
    config: { api_key: KEY, stop_1: 'T_CHAM2', stop_1_line: 'T1' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [[`${PREFIX}:stop:i-t_cham2_101`, 'Ginko Chamars [t_cham2] (T1)']],
  );
  const call = api.calls.find((c) => c.method === 'TR/getTempsLieu');
  assert.equal(call.params.idArret, 't_cham2');
});
