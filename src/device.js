// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Ginko <stop> (<line> → <direction>)": one per followed stop. Read-only
// features:
//   - `next`        text: the next passage, "T1 → Chalezeule · 3 min";
//   - `wait`        duration (minutes): the wait of the next passage serving
//                   the stop;
//   - `following`   duration (minutes): the wait of the one after;
//   - `not_served`  counter: the announced passages that do not serve the
//                   stop ("Non desservi", "Déviation", "Travaux").
//
// "Ginko line <line>": one per followed line. Read-only features:
//   - `status`       text: "Disruption under way: Manifestation";
//   - `disruptions`  counter: the disruptions under way (messages of a
//                    disrupted or interrupted line).
//
// External ids: the stop as typed — its name folded (`n-chamars`) or its id
// (`i-t_cham1`) — then the internal id of the line and the direction
// (`ext:ginko:stop:n-chamars_101_chalezeule`); the internal id of a line
// (`ext:ginko:line:101`). Typing a name with other accents keeps the device.
// `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, passageText, lineStateText } from './i18n.js';
import { slug } from './network.js';
import { minutesLeft, servedPassages } from './departures.js';
import { seriousMessages, SERIOUS } from './traffic.js';

const DEVICE_TYPES = { STOP: 'stop', LINE: 'line' };
const FEATURE_KEYS = {
  NEXT: 'next',
  WAIT: 'wait',
  FOLLOWING: 'following',
  NOT_SERVED: 'not_served',
  STATUS: 'status',
  DISRUPTIONS: 'disruptions',
};
const MAX_WAIT = 180;
const MAX_COUNT = 20;
const TEXT_MAX = 250;

/**
 * @description The identifier of a followed stop.
 * @param {{ kind: string, id: string|null, name: string }} stop - The resolved stop.
 * @param {{ id: string }|null} line - The resolved line, when set.
 * @param {string} direction - The direction typed, '' when none.
 * @returns {string} "n-chamars_101_chalezeule".
 * @example
 * stopKey({ kind: 'place', name: 'Chamars' }, { id: '101' }, 'Chalezeule'); // 'n-chamars_101_chalezeule'
 */
function stopKey(stop, line, direction) {
  const parts = [
    stop.kind === 'stop'
      ? `i-${String(stop.id)
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')}`
      : `n-${slug(stop.name)}`,
  ];
  if (line) {
    parts.push(line.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  }
  const words = slug(direction, 24);
  if (words) {
    parts.push(words);
  }
  return parts.join('_');
}

/**
 * @description The name of a followed stop: "Chamars (T1 → Chalezeule)".
 * @param {object} followed - `{ stop, line, direction }`.
 * @returns {string} The name.
 */
function followedName({ stop, line, direction }) {
  const detail = [line?.name, direction && `→ ${direction}`].filter(Boolean).join(' ');
  const where = stop.kind === 'stop' ? `${stop.name} [${stop.id}]` : stop.name;
  return detail ? `${where} (${detail})` : where;
}

/**
 * @description The external ids of a followed stop or line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - DEVICE_TYPES.
 * @param {string} key - The stop key, or the line id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type, key) => gladys.externalIds(type, String(key).toLowerCase());

/**
 * @description What a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {{ type: string, key: string }|null} The type and key.
 * @example
 * parseExternalId('ext:ginko:line:101'); // -> { type: 'line', key: '101' }
 */
function parseExternalId(externalId) {
  // A feature id ends with ":<feature key>": the device key stops before it.
  const match = /:(stop|line):([a-z0-9_-]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? { type: match[1], key: match[2] } : null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const textShape = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
};
const waitShape = {
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  keep_history: false,
  min: 0,
  max: MAX_WAIT,
};
const counterShape = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  min: 0,
  max: MAX_COUNT,
};

/**
 * @description Build the device of a followed stop.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed stop (`key`, `name`, `stop`, `line`).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStopDevice(gladys, followed, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.STOP, followed.key);
  const params = [
    {
      name: 'GINKO_STOP',
      value: followed.stop.kind === 'stop' ? followed.stop.id : followed.stop.name,
    },
  ];
  if (followed.line) {
    params.push({ name: 'GINKO_LINE', value: followed.line.name });
  }
  if (followed.direction) {
    params.push({ name: 'GINKO_DIRECTION', value: followed.direction });
  }
  return {
    name: t('stopDeviceName', language, { stop: followed.name }),
    external_id: ids.device,
    model: 'Ginko',
    should_poll: false,
    params,
    features: [
      sensor({
        name: t('featureNext', language),
        external_id: ids.feature(FEATURE_KEYS.NEXT),
        ...textShape,
      }),
      sensor({
        name: t('featureWait', language),
        external_id: ids.feature(FEATURE_KEYS.WAIT),
        ...waitShape,
      }),
      sensor({
        name: t('featureFollowing', language),
        external_id: ids.feature(FEATURE_KEYS.FOLLOWING),
        ...waitShape,
      }),
      sensor({
        name: t('featureNotServed', language),
        external_id: ids.feature(FEATURE_KEYS.NOT_SERVED),
        ...counterShape,
      }),
    ],
  };
}

/**
 * @description The states of a followed stop. Without a passage (the night),
 * the waits are left untouched: a 0 would fake a passage now.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed stop.
 * @param {object[]} passages - Its passages (parsePassages).
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {object[]} The states.
 */
function buildStopStates(gladys, followed, passages, { language, now, timeZone }) {
  const ids = idsOf(gladys, DEVICE_TYPES.STOP, followed.key);
  const upcoming = passages.filter((p) => p.at === null || p.at > now - 30000);
  const served = servedPassages(upcoming, now);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT),
      text: passageText(upcoming[0] ?? null, { language, now, timeZone }).slice(0, TEXT_MAX),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NOT_SERVED),
      state: Math.min(MAX_COUNT, upcoming.filter((p) => !p.served).length),
    },
  ];
  [FEATURE_KEYS.WAIT, FEATURE_KEYS.FOLLOWING].forEach((key, index) => {
    if (served[index]) {
      states.push({
        device_feature_external_id: ids.feature(key),
        state: Math.min(MAX_WAIT, minutesLeft(served[index], now)),
      });
    }
  });
  return states;
}

/**
 * @description Build the device of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string, name: string, label: string }} line - The resolved line.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildLineDevice(gladys, line, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return {
    name: t('lineDeviceName', language, { line: line.name }),
    external_id: ids.device,
    model: 'Ginko',
    should_poll: false,
    params: [
      { name: 'GINKO_LINE', value: line.name },
      ...(line.label ? [{ name: 'GINKO_ROUTE', value: line.label }] : []),
    ],
    features: [
      sensor({
        name: t('featureStatus', language),
        external_id: ids.feature(FEATURE_KEYS.STATUS),
        ...textShape,
      }),
      sensor({
        name: t('featureDisruptions', language),
        external_id: ids.feature(FEATURE_KEYS.DISRUPTIONS),
        ...counterShape,
      }),
    ],
  };
}

/**
 * @description The one-line status of a line: "Disruption under way: <title>".
 * @param {{ state: string, messages: object[] }} traffic - lineTraffic().
 * @param {string} language - The language.
 * @returns {string} The status.
 */
function lineStatusText(traffic, language) {
  const state = lineStateText(traffic.state, language);
  const [first] = SERIOUS.includes(traffic.state) ? seriousMessages(traffic) : [];
  return first?.title ? t('stateWithTitle', language, { state, title: first.title }) : state;
}

/**
 * @description The number of disruptions under way on a line.
 * @param {{ state: string, messages: object[] }} traffic - lineTraffic().
 * @returns {number} The count (at least 1 for a disrupted line).
 */
function disruptionCount(traffic) {
  const count = seriousMessages(traffic).length;
  return Math.min(MAX_COUNT, SERIOUS.includes(traffic.state) ? Math.max(1, count) : count);
}

/**
 * @description The states of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string }} line - The resolved line.
 * @param {object} traffic - Its traffic (lineTraffic).
 * @param {string} language - Language of the text.
 * @returns {object[]} The states.
 */
function buildLineStates(gladys, line, traffic, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.STATUS),
      text: lineStatusText(traffic, language).slice(0, TEXT_MAX),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.DISRUPTIONS),
      state: disruptionCount(traffic),
    },
  ];
}

export {
  DEVICE_TYPES,
  FEATURE_KEYS,
  MAX_WAIT,
  MAX_COUNT,
  stopKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  lineStatusText,
  disruptionCount,
  buildLineStates,
};
