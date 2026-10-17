// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  stopKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  buildLineStates,
  lineStatusText,
  DEVICE_TYPES,
} from '../src/device.js';
import { parsePassages } from '../src/departures.js';
import { parseTraffic, lineTraffic } from '../src/traffic.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, NOW, TZ, CHAMARS, VIOTTE, STATES, MESSAGES } from './helpers/fixtures.js';

const VIOTTE_T2 = {
  stop: { kind: 'place', id: null, name: 'Gare Viotte' },
  line: { id: '102', name: 'T2' },
  direction: 'Hauts du Chazal',
};
VIOTTE_T2.key = stopKey(VIOTTE_T2.stop, VIOTTE_T2.line, VIOTTE_T2.direction);
VIOTTE_T2.name = followedName(VIOTTE_T2);
const CHAMARS_ID = {
  stop: { kind: 'stop', id: 't_cham1', name: 'Chamars' },
  line: null,
  direction: '',
};
CHAMARS_ID.key = stopKey(CHAMARS_ID.stop, null, '');
CHAMARS_ID.name = followedName(CHAMARS_ID);
const T1 = { id: '101', name: 'T1', label: 'Hauts du Chazal <> Chalezeule' };

const devices = (language) => [
  buildStopDevice(fakeGladys, VIOTTE_T2, language),
  buildStopDevice(fakeGladys, CHAMARS_ID, language),
  buildLineDevice(fakeGladys, T1, language),
];

// Pairs with an icon and a label in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, undefined],
  [
    DEVICE_FEATURE_CATEGORIES.DURATION,
    DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    DEVICE_FEATURE_UNITS.MINUTES,
  ],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, undefined],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(feature.read_only, true, feature.external_id);
        assert.equal(feature.has_feedback, false, feature.external_id);
        assert.ok(feature.name.length > 0 && feature.name.length <= 255);
      }
      const names = new Set(device.features.map((feature) => feature.name));
      assert.equal(names.size, device.features.length, 'every feature has its own name');
    }
  }
});

test('category / type / unit pairs known to the Gladys front, from the SDK constants', () => {
  for (const feature of devices('en').flatMap((device) => device.features)) {
    assert.ok(
      PAIRS.some(
        ([category, type, unit]) =>
          feature.category === category && feature.type === type && feature.unit === unit,
      ),
      `${feature.external_id}: ${feature.category}/${feature.type}/${feature.unit}`,
    );
  }
});

test('ids from the stop as typed, the line id and the direction; read back', () => {
  const [viotte, chamars, t1] = devices('fr');
  assert.equal(viotte.external_id, 'ext:ginko:stop:n-gare-viotte_102_hauts-du-chazal');
  assert.equal(viotte.name, 'Ginko Gare Viotte (T2 → Hauts du Chazal)');
  assert.equal(chamars.external_id, 'ext:ginko:stop:i-t_cham1');
  assert.equal(chamars.name, 'Ginko Chamars [t_cham1]');
  assert.equal(t1.external_id, 'ext:ginko:line:101');
  assert.equal(t1.name, 'Ginko ligne T1');
  assert.deepEqual(parseExternalId('ext:ginko:stop:i-t_cham1:wait'), {
    type: 'stop',
    key: 'i-t_cham1',
  });
  assert.deepEqual(parseExternalId('ext:ginko:line:101'), { type: 'line', key: '101' });
  assert.equal(parseExternalId('something'), null);
  // Other accents or case: the same device.
  assert.equal(stopKey({ kind: 'place', name: 'GARE  VIÖTTE' }, null, ''), 'n-gare-viotte');
  assert.deepEqual(
    viotte.params.map((param) => [param.name, param.value]),
    [
      ['GINKO_STOP', 'Gare Viotte'],
      ['GINKO_LINE', 'T2'],
      ['GINKO_DIRECTION', 'Hauts du Chazal'],
    ],
  );
});

test('stop states: the next passage, the two waits, the passages not serving it', () => {
  const passages = parsePassages(
    VIOTTE.objets,
    { lineId: '102', direction: VIOTTE_T2.direction },
    NOW,
  );
  const states = buildStopStates(fakeGladys, VIOTTE_T2, passages, {
    language: 'fr',
    now: NOW,
    timeZone: TZ,
  });
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
  );
  assert.deepEqual(byKey, {
    next: 'T2 → Hauts du Chazal · 1 min (horaire théorique)',
    not_served: 0,
    wait: 1,
    following: 9,
  });
  // Nothing served (Chamars): the waits are left untouched.
  const chamars = parsePassages(CHAMARS.objets, {}, NOW);
  const none = buildStopStates(fakeGladys, CHAMARS_ID, chamars, {
    language: 'en',
    now: NOW,
    timeZone: TZ,
  });
  assert.deepEqual(
    none.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
    [
      ['next', 'T2 → Hauts du Chazal · Non desservi'],
      ['not_served', 12],
    ],
  );
  const empty = buildStopStates(fakeGladys, CHAMARS_ID, [], { language: 'es', now: NOW });
  assert.equal(empty[0].text, 'Ningún paso anunciado');
});

test('line states: the state with the title of the disruption, the count', () => {
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  const t1 = lineTraffic(traffic, '101');
  assert.deepEqual(
    buildLineStates(fakeGladys, T1, t1, 'fr').map((s) => s.text ?? s.state),
    ['Perturbation en cours : Manifestation', 1],
  );
  assert.equal(lineStatusText({ state: 'normal', messages: [] }, 'de'), 'Normaler Betrieb');
  assert.equal(lineStatusText(lineTraffic(traffic, '7'), 'en'), 'No information');
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices([
      buildStopDevice(gladys, VIOTTE_T2, language),
      buildLineDevice(gladys, T1, language),
    ]);
  }
  const [stop, line] = gladys.fake.discoveredDevices;
  await gladys.fake.deviceCreated(stop);
  await gladys.fake.deviceCreated(line);
  const passages = parsePassages(VIOTTE.objets, { lineId: '102' }, NOW);
  await gladys.publishStates(
    buildStopStates(gladys, VIOTTE_T2, passages, { language: 'en', now: NOW }),
  );
  const traffic = parseTraffic(STATES.objets, MESSAGES.objets);
  await gladys.publishStates(buildLineStates(gladys, T1, lineTraffic(traffic, '101'), 'en'));
  assert.equal(idsOf(gladys, DEVICE_TYPES.STOP, VIOTTE_T2.key).device, stop.external_id);
  assert.equal(gladys.fake.lastState(`${stop.external_id}:wait`), 1);
  assert.equal(gladys.fake.lastState(`${line.external_id}:disruptions`), 1);
});
