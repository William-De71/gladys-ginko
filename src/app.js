// -----------------------------------------------------------------------------
// The Ginko integration: every handler, registered on a Gladys client.
//
// Brings the bus and tram network of Besançon (Ginko) into Gladys, through
// its open data API (a free key):
//   - devices (device.js): one per followed stop — the three of the form and
//     the ones added with the "Add a stop" button, filtered by line and
//     direction — with the next passage and the waits; one per followed
//     line — up to six — with its traffic;
//   - scene triggers (events.js): departure soon, stop not served, line
//     disrupted, line back to normal, new traffic message;
//   - scene actions: read the next passages of a stop, read the traffic of a
//     line;
//   - dashboard widgets (widgets.js): departures, traffic.
//
// The API has no push: the stops are read on the integration's own timer
// (every 30 s to 5 min, 1 min by default; every 10 min while a stop announces
// nothing, at night), the traffic every 5 min, never on a Gladys poll. The
// lines and stops of the network are kept in /data (network.js).
// Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  parseLines,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
  MAX_ADDED_STOPS,
} from './config.js';
import { createGinkoClient } from './ginko-api.js';
import { createNetwork, fold } from './network.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { parsePassages, servedPassages } from './departures.js';
import { parseTraffic, lineTraffic } from './traffic.js';
import {
  DEVICE_TYPES,
  stopKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  buildLineStates,
} from './device.js';
import {
  detectReminders,
  detectNotServed,
  detectLineChanges,
  reminderData,
  notServedData,
  lineEvent,
  nextDeparturesOutputs,
  lineTrafficOutputs,
  pick,
  TRIGGERS,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_TRAFFIC_OUTPUTS,
} from './events.js';
import {
  WIDGETS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildDeparturesWidget,
  buildTrafficWidget,
} from './widgets.js';
import { defaultTimeZone, newDaySince, MINUTE_MS } from './time.js';
import { t, all, lineStateText, passageWhen, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  SEARCH_STOP: 'search_stop',
  ADD_STOP: 'add_stop',
  REMOVE_STOP: 'remove_stop',
  LIST_STOPS: 'list_stops',
  DIAGNOSTIC: 'diagnostic',
};
const SCENE_ACTIONS = {
  GET_NEXT_DEPARTURES: 'get_next_departures',
  GET_LINE_TRAFFIC: 'get_line_traffic',
};
// Passages asked per line and direction (the API allows 1 to 5).
const PASSAGES_PER_ROUTE = 3;
// A stop announcing nothing (the night) is read this often.
const IDLE_INTERVAL_MS = 10 * MINUTE_MS;
const TRAFFIC_INTERVAL_MS = 5 * MINUTE_MS;
const REMINDER_TICK_MS = 30 * 1000;
// A widget or a scene action reuses a reading this fresh.
const SNAPSHOT_MAX_AGE_MS = 90 * 1000;
const BOARD_MAX_AGE_MS = 60 * 1000;
const TRAFFIC_MAX_AGE_MS = 3 * MINUTE_MS;
// Names that could not be resolved for a network reason are tried again.
const RESOLVE_RETRY_MS = 5 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
// "Find a stop" reads the directions of this many stops (one request each);
// the user narrows the name for the others.
const SEARCH_ROUTES_MAX = 12;
const SEARCH_DESTINATIONS_MAX = 5;
const ACTION_TEXT_MAX = 1500;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description The directions of one stop, for "Find a stop".
 * @param {Array<{ destination: string, lines: string[] }>} routes - The directions.
 * @returns {string} "Prés de Vaux (12), Trey (D4)".
 * @example
 * routesText([{ destination: 'Trey', lines: ['D4'] }]); // -> 'Trey (D4)'
 */
function routesText(routes) {
  if (routes.length === 0) {
    return '–';
  }
  const shown = routes
    .slice(0, SEARCH_DESTINATIONS_MAX)
    .map(({ destination, lines }) => `${destination} (${lines.join(', ')})`);
  return routes.length > SEARCH_DESTINATIONS_MAX ? `${shown.join(', ')}, …` : shown.join(', ');
}

/**
 * @description Cut a text of several lines at a line break, under a bound.
 * @param {string} text - The text.
 * @param {number} max - The bound.
 * @returns {string} The whole lines that fit, then "…".
 */
function clipLines(text, max) {
  if (text.length <= max) {
    return text;
  }
  const cut = text.lastIndexOf('\n', max - 2);
  return `${text.slice(0, cut > 0 ? cut : max - 2)}\n…`;
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of the Ginko API (tests).
 * @param {string} [options.baseUrl] - The API root (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of the times (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timers (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // The raw values last read, internal keys included: the base of setConfig.
  let rawConfig = {};
  // The stops added with the buttons, one change at a time.
  let writingStops = Promise.resolve();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`. French
  // until a widget is shown: the network serves Besançon.
  let language = 'fr';
  let createdDevices = new Set();
  // The followed stops and lines, resolved, and what Ginko does not know.
  let stops = [];
  // config.stops[i] -> its followed stop (null when unknown to Ginko), for
  // "List the stops".
  let entries = [];
  let lines = [];
  let notFound = [];
  // stop key -> { passages, readAt } of its last reading, and its last error.
  const snapshots = new Map();
  const stopErrors = new Map();
  // The last reading of the traffic.
  let traffic = { data: null, readAt: 0, error: null };
  let trafficPending = null;
  // typed stop -> { passages, readAt, title }, for the widgets of other stops.
  const boards = new Map();
  let resolveError = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let stopTimer = null;
  let trafficTimer = null;
  let reminderTimer = null;
  let resolveTimer = null;
  let readingStops = null;
  let stopped = false;

  const api = createGinkoClient({
    getApiKey: () => config.apiKey,
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const network = createNetwork({
    api,
    store,
    now,
    isNewDay: (since) => newDaySince(since, now(), timeZone),
    logger,
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err?.kind === 'auth') {
      return t('errorInvalidKey', lang);
    }
    if (err?.kind === 'not_found') {
      return t('errorNotFound', lang);
    }
    return t('errorUnreachable', lang);
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.apiKey) {
      await reportStatus(false, all('noApiKey'));
      return;
    }
    const errors = [
      resolveError,
      ...stopErrors.values(),
      lines.length > 0 ? traffic.error : null,
    ].filter(Boolean);
    const auth = errors.find((err) => err.kind === 'auth');
    if (auth) {
      await reportStatus(false, all('statusInvalidKey', { detail: auth.message.slice(0, 80) }));
      return;
    }
    const sources = stops.length + (lines.length > 0 ? 1 : 0);
    const failing = [...stopErrors.values()].filter((err) => err.kind !== 'not_found').length;
    const trafficFailing = lines.length > 0 && traffic.error ? 1 : 0;
    if (resolveError || (sources > 0 && failing + trafficFailing >= sources)) {
      const err = resolveError ?? traffic.error ?? [...stopErrors.values()][0];
      await reportStatus(
        false,
        all('statusUnreachable', {
          detail: String(err?.message ?? '').slice(0, 80),
          minutes: Math.round(Math.max(config.interval * 1000, MINUTE_MS) / MINUTE_MS),
        }),
      );
      return;
    }
    const unknown = notFound.length
      ? (l) => ` ${t('statusNotFound', l, { names: notFound.join(', ') })}`
      : () => '';
    if (sources === 0) {
      await reportStatus(
        true,
        Object.fromEntries(LANGUAGES.map((l) => [l, `${t('statusNothing', l)}${unknown(l)}`])),
      );
      return;
    }
    await reportStatus(
      true,
      Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          `${t('statusConnected', l, { stops: stops.length, lines: lines.length, interval: config.interval })}${unknown(l)}`,
        ]),
      ),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(`${data.stop_name ?? data.line_name}: ${key}`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Stops and lines ---------------------------------------------------------------

  /**
   * @description Resolve one stop of the configuration.
   * @param {object} entry - `{ slot, added, stop, line, direction }`.
   * @returns {Promise<object>} The followed stop, or `{ unknown }`: the typed
   * stop or line Ginko does not know.
   */
  async function resolveEntry(entry) {
    const line = entry.line ? await network.resolveLine(entry.line) : null;
    if (entry.line && !line) {
      return { unknown: entry.line };
    }
    const stop = await network.resolveStop(entry.stop);
    if (!stop) {
      return { unknown: entry.stop };
    }
    const key = stopKey(stop, line, entry.direction);
    const followed = {
      slot: entry.slot,
      added: entry.added ?? null,
      stop,
      line,
      direction: entry.direction,
      key,
    };
    return {
      ...followed,
      name: followedName(followed),
      deviceId: idsOf(gladys, DEVICE_TYPES.STOP, key).device,
    };
  }

  /**
   * @description Resolve the configured stops and lines.
   * @returns {Promise<void>}
   */
  async function resolveConfig() {
    clearTimeout(resolveTimer);
    if (!config.apiKey) {
      stops = [];
      entries = [];
      lines = [];
      notFound = [];
      resolveError = null;
      return;
    }
    const resolvedStops = [];
    const resolvedEntries = [];
    const resolvedLines = [];
    const unknown = [];
    try {
      for (const entry of config.stops) {
        const followed = await resolveEntry(entry);
        if (followed.unknown) {
          unknown.push(followed.unknown);
          resolvedEntries.push(null);
          continue;
        }
        const known = resolvedStops.find((other) => other.key === followed.key);
        if (!known) {
          resolvedStops.push(followed);
        }
        resolvedEntries.push(known ?? followed);
      }
      for (const typed of config.lines) {
        const line = await network.resolveLine(typed);
        if (!line) {
          unknown.push(typed);
        } else if (!resolvedLines.some((known) => known.id === line.id)) {
          resolvedLines.push({
            ...line,
            deviceId: idsOf(gladys, DEVICE_TYPES.LINE, line.id).device,
          });
        }
      }
      resolveError = null;
    } catch (err) {
      // Keep what was resolved before; try again later.
      logger.warn(`Unable to read the Ginko network (${err.kind ?? 'error'}): ${err.message}`);
      resolveError = err;
      if (err.kind !== 'auth' && timers && !stopped) {
        resolveTimer = setTimeout(() => {
          applyConfig().catch(() => {});
        }, RESOLVE_RETRY_MS);
        resolveTimer.unref?.();
      }
      return;
    }
    stops = resolvedStops;
    entries = resolvedEntries;
    lines = resolvedLines;
    notFound = unknown;
    for (const key of [...snapshots.keys()]) {
      if (!stops.some((followed) => followed.key === key)) {
        snapshots.delete(key);
        stopErrors.delete(key);
      }
    }
  }

  /**
   * @description Offer a device per stop and per line on the Discovery screen,
   * when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = [
      ...stops.map((followed) => buildStopDevice(gladys, followed, lang)),
      ...lines.map((line) => buildLineDevice(gladys, line, lang)),
    ];
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- Reading the stops -------------------------------------------------------------

  /**
   * @description Publish the states of a stop, when its device exists.
   * @param {object} followed - The followed stop.
   * @returns {Promise<void>}
   */
  async function publishStopStates(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot || !createdDevices.has(followed.deviceId)) {
      return;
    }
    await gladys
      .publishChangedStates(
        buildStopStates(gladys, followed, snapshot.passages, {
          language: textLanguage(),
          now: now(),
          timeZone,
        }),
      )
      .catch((err) =>
        logger.warn(`Unable to publish the states of ${followed.name}: ${err.message}`),
      );
  }

  /**
   * @description The reminders due on the last reading of a stop.
   * @param {object} followed - The followed stop.
   * @returns {object[]} The events.
   */
  function reminderEvents(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot) {
      return [];
    }
    const { due, fired } = detectReminders({
      passages: snapshot.passages,
      fired: store.data.seen.reminders[followed.key],
      now: now(),
    });
    store.data.seen.reminders[followed.key] = fired;
    return due.map(({ passage, mark }) => ({
      key: TRIGGERS.DEPARTURE_SOON,
      data: reminderData(followed, passage, mark, { language: textLanguage(), timeZone }),
    }));
  }

  /**
   * @description Read the passages of a followed stop.
   * @param {object} followed - The followed stop.
   * @param {Map} [answers] - The answers of this reading round, by stop: two
   * followed stops on the same stop (two lines, two directions) share one
   * request.
   * @returns {Promise<object>} Its snapshot `{ passages, readAt }`.
   */
  async function readStop(followed, answers = new Map()) {
    try {
      const where =
        followed.stop.kind === 'stop' ? { id: followed.stop.id } : { name: followed.stop.name };
      const request = where.id ? `i:${where.id}` : `n:${fold(where.name)}`;
      if (!answers.has(request)) {
        answers.set(request, api.waitTimes(where, PASSAGES_PER_ROUTE));
      }
      const answer = await answers.get(request);
      const readAt = now();
      const snapshot = {
        passages: parsePassages(
          answer,
          { lineId: followed.line?.id ?? '', direction: followed.direction },
          readAt,
        ),
        readAt,
      };
      snapshots.set(followed.key, snapshot);
      stopErrors.delete(followed.key);
      return snapshot;
    } catch (err) {
      stopErrors.set(followed.key, err);
      throw err;
    }
  }

  /**
   * @description What follows a reading of a stop: events, states, widgets.
   * @param {object} followed - The followed stop.
   * @returns {Promise<void>}
   */
  async function digestStop(followed) {
    const snapshot = snapshots.get(followed.key);
    const events = [];
    if (gladys.connected !== false) {
      const { newly, memory } = detectNotServed({
        passages: snapshot.passages,
        memory: store.data.seen.notServed[followed.key] ?? null,
        now: now(),
      });
      store.data.seen.notServed[followed.key] = memory;
      events.push(
        ...newly.map((passage) => ({
          key: TRIGGERS.STOP_NOT_SERVED,
          data: notServedData(followed, passage, { language: textLanguage() }),
        })),
        ...reminderEvents(followed),
      );
    }
    await store.save();
    await publishEvents(events);
    await publishStopStates(followed);
  }

  /**
   * @description Whether a stop is due for a reading.
   * @param {object} followed - The followed stop.
   * @returns {boolean} True when due.
   */
  function stopDue(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot || stopErrors.has(followed.key)) {
      return true;
    }
    const age = now() - snapshot.readAt;
    // At night a stop announces nothing: read it less often.
    const quiet = snapshot.passages.length === 0;
    return age >= (quiet ? IDLE_INTERVAL_MS : config.interval * 1000) - 1000;
  }

  /**
   * @description Read the stops that are due (one reading round at a time).
   * @param {object} [options] - `{ force }`: read every stop.
   * @returns {Promise<void>}
   */
  function readStops({ force = false } = {}) {
    if (!readingStops) {
      readingStops = (async () => {
        let changed = false;
        const answers = new Map();
        for (const followed of stops) {
          if (!force && !stopDue(followed)) {
            continue;
          }
          try {
            await readStop(followed, answers);
            await digestStop(followed);
            changed = true;
          } catch (err) {
            logger.warn(`Ginko stop ${followed.name} (${err.kind ?? 'error'}): ${err.message}`);
          }
        }
        if (changed) {
          refreshWidgets([WIDGETS.DEPARTURES]);
        }
        await refreshStatus();
      })().finally(() => {
        readingStops = null;
      });
    }
    return readingStops;
  }

  /**
   * @description The snapshot of a stop, read again when older than `maxAgeMs`.
   * @param {object} followed - The followed stop.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<object>} The snapshot.
   */
  async function snapshotOf(followed, maxAgeMs) {
    const snapshot = snapshots.get(followed.key);
    if (snapshot && now() - snapshot.readAt <= maxAgeMs) {
      return snapshot;
    }
    await readStop(followed);
    await digestStop(followed);
    return snapshots.get(followed.key);
  }

  /**
   * @description Check the reminders on the last readings (between readings).
   * @returns {Promise<void>}
   */
  async function checkReminders() {
    // Disconnected, the event would be lost while marked as fired.
    if (gladys.connected === false) {
      return;
    }
    const events = stops.flatMap((followed) => reminderEvents(followed));
    if (events.length) {
      await store.save();
      await publishEvents(events);
    }
  }

  // --- Reading the traffic -----------------------------------------------------------

  /**
   * @description Publish what a traffic reading changed for the followed lines.
   * @returns {Promise<void>}
   */
  async function digestTraffic() {
    const current = now();
    if (gladys.connected !== false) {
      const { changes, seen } = detectLineChanges({
        lines,
        traffic: traffic.data,
        seen: store.data.seen.lines,
        now: current,
      });
      store.data.seen.lines = seen;
      await store.save();
      await publishEvents(changes.map((change) => lineEvent(change, { language: textLanguage() })));
    }
    const states = lines
      .filter((line) => createdDevices.has(line.deviceId))
      .flatMap((line) =>
        buildLineStates(gladys, line, lineTraffic(traffic.data, line.id), textLanguage()),
      );
    if (states.length > 0) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the traffic states: ${err.message}`));
    }
    refreshWidgets([WIDGETS.TRAFFIC]);
  }

  /**
   * @description Read the traffic now (one reading at a time).
   * @returns {Promise<object>} `{ data, readAt }`.
   */
  function readTrafficNow() {
    if (!trafficPending) {
      trafficPending = (async () => {
        try {
          const [states, messages] = await Promise.all([api.lineStates(), api.messages()]);
          traffic = { data: parseTraffic(states, messages), readAt: now(), error: null };
          await digestTraffic();
          return traffic;
        } catch (err) {
          traffic = { ...traffic, error: err };
          throw err;
        } finally {
          trafficPending = null;
        }
      })();
    }
    return trafficPending;
  }

  /**
   * @description The traffic, read again when older than `maxAgeMs`.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<object>} `{ data, readAt }`.
   */
  async function trafficOf(maxAgeMs) {
    if (traffic.data && now() - traffic.readAt <= maxAgeMs) {
      return traffic;
    }
    return readTrafficNow();
  }

  /**
   * @description The regular reading of the traffic, when lines are followed.
   * @returns {Promise<void>}
   */
  async function trafficTick() {
    if (!config.apiKey || lines.length === 0) {
      return;
    }
    await readTrafficNow().catch((err) =>
      logger.warn(`Ginko traffic (${err.kind ?? 'error'}): ${err.message}`),
    );
    await refreshStatus();
  }

  // --- Timers ------------------------------------------------------------------------

  /**
   * @description (Re)arm the timers.
   */
  function schedule() {
    clearInterval(stopTimer);
    clearInterval(trafficTimer);
    clearInterval(reminderTimer);
    if (!timers || stopped) {
      return;
    }
    // A short tick: each stop decides whether it is due (stopDue).
    stopTimer = setInterval(
      () => {
        readStops().catch((err) => logger.error('Stops', err));
      },
      Math.min(config.interval * 1000, 30000),
    );
    trafficTimer = setInterval(() => {
      trafficTick().catch((err) => logger.error('Traffic', err));
    }, TRAFFIC_INTERVAL_MS);
    reminderTimer = setInterval(() => {
      checkReminders().catch((err) => logger.warn(`Reminders: ${err.message}`));
    }, REMINDER_TICK_MS);
    [stopTimer, trafficTimer, reminderTimer].forEach((timer) => timer.unref?.());
  }

  /**
   * @description Resolve the configuration, offer the devices, read everything.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    await resolveConfig();
    logger.info(
      `${stops.length} stop(s): ${stops.map((followed) => followed.name).join(', ') || 'none'}; ` +
        `${lines.length} line(s): ${lines.map((line) => line.name).join(', ') || 'none'}` +
        (notFound.length ? `; unknown: ${notFound.join(', ')}` : ''),
    );
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await readStops({ force: true });
    await trafficTick();
    await refreshStatus();
    schedule();
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description What a widget or a scene action targets, by device external id.
   * @param {unknown} externalId - The `source: "devices"` value.
   * @param {string} type - DEVICE_TYPES.
   * @returns {object|null} The followed stop or line, the first one by default.
   */
  function target(externalId, type) {
    const parsed = parseExternalId(externalId);
    const list = type === DEVICE_TYPES.STOP ? stops : lines;
    const keyOf = (item) => (type === DEVICE_TYPES.STOP ? item.key : item.id.toLowerCase());
    const found = parsed?.type === type ? list.find((item) => keyOf(item) === parsed.key) : null;
    return found ?? list[0] ?? null;
  }

  /**
   * @description The passages of a stop typed in a widget.
   * @param {string} typed - The stop.
   * @param {string} typedLine - Its optional line.
   * @param {string} lang - The language.
   * @returns {Promise<object>} `{ title, passages, readAt }` or `{ message }`.
   */
  async function typedBoard(typed, typedLine, lang) {
    const line = typedLine ? await network.resolveLine(typedLine) : null;
    if (typedLine && !line) {
      return { message: t('statusNotFound', lang, { names: typedLine.slice(0, 60) }) };
    }
    const stop = await network.resolveStop(typed);
    if (!stop) {
      return { message: t('statusNotFound', lang, { names: typed.slice(0, 60) }) };
    }
    const key = stopKey(stop, line, '');
    let board = boards.get(key);
    if (!board || now() - board.readAt > BOARD_MAX_AGE_MS) {
      const answer = await api.waitTimes(
        stop.kind === 'stop' ? { id: stop.id } : { name: stop.name },
        PASSAGES_PER_ROUTE,
      );
      const readAt = now();
      board = { readAt, passages: parsePassages(answer, { lineId: line?.id ?? '' }, readAt) };
      boards.set(key, board);
    }
    const title = followedName({ stop, line, direction: '' });
    return { title, ...board };
  }

  gladys.onWidgetGet(WIDGETS.DEPARTURES, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!config.apiKey) {
      return messageContent(t('noApiKey', lang));
    }
    const count = readCount(settings.count, BOARD_COUNT);
    const typed = typeof settings.stop_name === 'string' ? settings.stop_name.trim() : '';
    const typedLine = typeof settings.line === 'string' ? settings.line.trim() : '';
    try {
      let board;
      if (typed) {
        board = await typedBoard(typed, typedLine, lang);
        if (board.message) {
          return messageContent(board.message);
        }
      } else {
        const followed = target(settings.stop, DEVICE_TYPES.STOP);
        if (!followed) {
          return messageContent(t('widgetNoStop', lang));
        }
        board = { title: followed.name, ...(await snapshotOf(followed, SNAPSHOT_MAX_AGE_MS)) };
      }
      return buildDeparturesWidget({ ...board, count, language: lang, now: now(), timeZone });
    } catch (err) {
      logger.warn(`Widget: unable to read the passages: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  gladys.onWidgetGet(WIDGETS.TRAFFIC, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!config.apiKey) {
      return messageContent(t('noApiKey', lang));
    }
    try {
      let wanted = lines;
      const typed = parseLines(settings.lines);
      if (typed.length > 0) {
        wanted = [];
        for (const entry of typed) {
          const line = await network.resolveLine(entry);
          if (!line) {
            return messageContent(t('statusNotFound', lang, { names: entry.slice(0, 60) }));
          }
          wanted.push(line);
        }
      }
      if (wanted.length === 0) {
        return messageContent(t('widgetNoLine', lang));
      }
      const current = await trafficOf(TRAFFIC_MAX_AGE_MS);
      return buildTrafficWidget({
        lines: wanted.map((line) => ({ line, traffic: lineTraffic(current.data, line.id) })),
        readAt: current.readAt,
        language: lang,
        timeZone,
      });
    } catch (err) {
      logger.warn(`Widget: unable to read the traffic: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, async (fields = {}) => {
    const followed = target(fields.stop, DEVICE_TYPES.STOP);
    if (!followed) {
      throw new Error('No Ginko stop is followed');
    }
    const snapshot = await snapshotOf(followed, SNAPSHOT_MAX_AGE_MS);
    return pick(
      nextDeparturesOutputs({
        followed,
        passages: snapshot.passages,
        now: now(),
        language: textLanguage(),
        timeZone,
      }),
      NEXT_DEPARTURES_OUTPUTS,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_LINE_TRAFFIC, async (fields = {}) => {
    const line = target(fields.line, DEVICE_TYPES.LINE);
    if (!line) {
      throw new Error('No Ginko line is followed');
    }
    const current = await trafficOf(SNAPSHOT_MAX_AGE_MS);
    return pick(
      lineTrafficOutputs({
        line,
        traffic: lineTraffic(current.data, line.id),
        language: textLanguage(),
      }),
      LINE_TRAFFIC_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.apiKey) {
      return all('noApiKey');
    }
    const messages = [];
    try {
      const known = await network.lines(true);
      messages.push(all('testKeyOk', { count: known.length }));
    } catch (err) {
      await refreshStatus();
      return all('statusInvalidKey', (l) => ({ detail: errorText(err, l) }));
    }
    await resolveConfig();
    await publishDiscoveredDevices().catch(() => {});
    const answers = new Map();
    for (const followed of stops) {
      try {
        await readStop(followed, answers);
        await digestStop(followed);
        const snapshot = snapshots.get(followed.key);
        const [first] = servedPassages(snapshot.passages, now());
        messages.push(
          all('testStop', (l) => ({
            stop: followed.name,
            count: snapshot.passages.length,
            next: first
              ? `${first.line} ${passageWhen(first, { language: l, now: now(), timeZone })}`
              : '–',
          })),
        );
      } catch (err) {
        messages.push(
          all('testStopError', (l) => ({ stop: followed.name, error: errorText(err, l) })),
        );
      }
    }
    if (lines.length > 0) {
      try {
        const current = await readTrafficNow();
        lines.forEach((line) => {
          const { state } = lineTraffic(current.data, line.id);
          messages.push(
            all('testLine', (l) => ({ line: line.name, state: lineStateText(state, l) })),
          );
        });
      } catch (err) {
        messages.push(all('testTrafficError', (l) => ({ error: errorText(err, l) })));
      }
    }
    notFound.forEach((name) => messages.push(all('unknownEntry', { name })));
    refreshWidgets(Object.values(WIDGETS));
    await refreshStatus();
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        messages
          .map((entry) => entry[l])
          .join(' · ')
          .slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.SEARCH_STOP, async (fields = {}) => {
    if (!config.apiKey) {
      return all('noApiKey');
    }
    const query = typeof fields.query === 'string' ? fields.query.trim() : '';
    if (query.length < 2) {
      return all('searchTooShort');
    }
    const found = await network.searchStops(query);
    if (found.length === 0) {
      return all('searchNone', { query: query.slice(0, 60) });
    }
    // The directions of each side of the street: what tells BQTSO01 from
    // BQTSO02. A stop whose directions could not be read keeps its id alone.
    let budget = SEARCH_ROUTES_MAX;
    let skipped = false;
    const blocks = [];
    for (const entry of found) {
      const sides = [];
      for (const id of entry.ids) {
        let routes = null;
        if (budget > 0) {
          budget -= 1;
          routes = await network.routesAt(id).catch((err) => {
            logger.warn(`Directions of ${id} not read: ${err.message}`);
            return null;
          });
        } else {
          skipped = true;
        }
        sides.push(routes ? `• ${id} → ${routesText(routes)}` : `• ${id}`);
      }
      blocks.push([entry.name, ...sides].join('\n'));
    }
    const list = clipLines(blocks.join('\n'), ACTION_TEXT_MAX - 300);
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        [t('searchFound', l, { list }), skipped ? t('searchMore', l) : '']
          .filter(Boolean)
          .join('\n'),
      ]),
    );
  });

  // --- Stops added with the buttons -------------------------------------------------

  const field = (value) => (typeof value === 'string' ? value.trim() : '');

  /**
   * @description Change the added stops, one change after the other: two quick
   * buttons never lose a stop. Applied in memory once Gladys saved it.
   * @param {Function} change - `(added) => Promise<{ next?, message }>`: the new
   * list (none: nothing to save) and the answer, or a function of nothing
   * giving it once the stops are read.
   * @returns {Promise<object>} The answer.
   */
  function changeAddedStops(change) {
    const run = writingStops.then(async () => {
      const { next, message } = await change(config.addedStops);
      if (next) {
        await gladys.setConfig({ [INTERNAL_KEYS.addedStops]: next });
        rawConfig = { ...rawConfig, [INTERNAL_KEYS.addedStops]: next };
        config = normalizeConfig(rawConfig);
        await resolveConfig();
        await publishDiscoveredDevices().catch((err) =>
          logger.warn(`Unable to offer the devices: ${err.message}`),
        );
        // Only the new stop is due: it has no reading yet.
        await readStops();
      }
      return typeof message === 'function' ? message() : message;
    });
    writingStops = run.catch(() => {});
    return run;
  }

  /**
   * @description How a stop of the configuration reads in "List the stops".
   * @param {object} entry - A stop of `config.stops`.
   * @param {number} index - Its position.
   * @param {string} lang - The language.
   * @returns {string} "2. Bouquet de Soleils [BQTSO01] (formulaire, arrêt 2)".
   */
  function entryText(entry, index, lang) {
    const followed = entries[index];
    const typed = [entry.stop, entry.line, entry.direction && `→ ${entry.direction}`]
      .filter(Boolean)
      .join(' ');
    const notes = [
      entry.slot ? t('stopFromForm', lang, { slot: entry.slot }) : '',
      config.apiKey && entries.length && !followed ? t('stopUnknownMark', lang) : '',
    ].filter(Boolean);
    const name = followed?.name ?? typed;
    return `${index + 1}. ${name}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  }

  gladys.onAction(ACTIONS.ADD_STOP, async (fields = {}) => {
    if (!config.apiKey) {
      return all('noApiKey');
    }
    const entry = {
      stop: field(fields.stop),
      line: field(fields.line),
      direction: field(fields.direction),
    };
    if (entry.stop.length < 2) {
      return all('searchTooShort');
    }
    return changeAddedStops(async (added) => {
      if (added.length >= MAX_ADDED_STOPS) {
        return { message: all('stopsFull', { max: MAX_ADDED_STOPS }) };
      }
      let followed;
      try {
        followed = await resolveEntry(entry);
      } catch (err) {
        return { message: all('statusInvalidKey', (l) => ({ detail: errorText(err, l) })) };
      }
      if (followed.unknown) {
        return { message: all('statusNotFound', { names: followed.unknown.slice(0, 60) }) };
      }
      if (stops.some((other) => other.key === followed.key)) {
        return { message: all('stopAlreadyFollowed', { name: followed.name }) };
      }
      // Stored as resolved: the exact name or the id, the public line name.
      const stored = {
        stop: followed.stop.kind === 'stop' ? followed.stop.id : followed.stop.name,
        line: followed.line?.name ?? '',
        direction: entry.direction,
      };
      logger.info(`Stop added: ${followed.name}`);
      return {
        next: [...added, stored],
        message: () => all('stopAdded', { name: followed.name, count: stops.length }),
      };
    });
  });

  gladys.onAction(ACTIONS.REMOVE_STOP, async (fields = {}) => {
    const query = field(fields.stop);
    if (!query) {
      return all('stopRemoveUnknown', { query });
    }
    return changeAddedStops(async (added) => {
      const number = /^#?\d+$/.test(query) ? Number(query.replace('#', '')) : null;
      let found;
      if (number !== null) {
        found = config.stops[number - 1] ? [number - 1] : [];
      } else {
        const wanted = fold(query);
        found = config.stops
          .map((entry, index) => ({ entry, index, followed: entries[index] }))
          .filter(
            ({ entry, followed }) =>
              fold(entry.stop) === wanted ||
              (followed && (fold(followed.name) === wanted || fold(followed.stop.name) === wanted)),
          )
          .map(({ index }) => index);
        // The same name in the form and in the added stops: the added one.
        const fromButtons = found.filter((index) => !config.stops[index].slot);
        found = fromButtons.length > 0 ? fromButtons : found;
      }
      if (found.length === 0) {
        return { message: all('stopRemoveUnknown', { query: query.slice(0, 60) }) };
      }
      if (found.length > 1) {
        return { message: all('stopRemoveAmbiguous', { query: query.slice(0, 60) }) };
      }
      const entry = config.stops[found[0]];
      const name = entries[found[0]]?.name ?? entry.stop;
      if (entry.slot) {
        return { message: all('stopInForm', { name, slot: entry.slot }) };
      }
      logger.info(`Stop removed: ${name}`);
      return {
        next: added.filter((_, index) => index !== entry.added - 1),
        message: all('stopRemoved', { name }),
      };
    });
  });

  gladys.onAction(ACTIONS.LIST_STOPS, async () => {
    if (config.stops.length === 0) {
      return all('stopsNone');
    }
    return all('stopsList', (l) => ({
      count: config.stops.length,
      list: clipLines(
        config.stops.map((entry, index) => entryText(entry, index, l)).join('\n'),
        ACTION_TEXT_MAX - 100,
      ),
    }));
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      apiKey: config.apiKey ? 'set' : 'missing',
      interval: config.interval,
      language: config.language,
      stops: stops.map((followed) => {
        const snapshot = snapshots.get(followed.key);
        return {
          slot: followed.slot,
          added: followed.added,
          key: followed.key,
          stop: followed.stop,
          line: followed.line?.name ?? null,
          direction: followed.direction,
          created: createdDevices.has(followed.deviceId),
          readAt: snapshot ? new Date(snapshot.readAt).toISOString() : null,
          passages: snapshot?.passages
            .slice(0, 6)
            .map((p) => `${p.line}>${p.destination} ${p.display} ${p.reliable ? 'gps' : 'th'}`),
          error: stopErrors.get(followed.key)?.message ?? null,
        };
      }),
      lines: lines.map((line) => ({
        id: line.id,
        name: line.name,
        created: createdDevices.has(line.deviceId),
        state: traffic.data ? lineTraffic(traffic.data, line.id).state : null,
        messages: traffic.data ? lineTraffic(traffic.data, line.id).messages.length : null,
      })),
      notFound,
      traffic: {
        readAt: traffic.readAt ? new Date(traffic.readAt).toISOString() : null,
        messages: traffic.data?.messages.length ?? null,
        error: traffic.error?.message ?? null,
      },
      network: {
        lines: store.data.network.lines?.length ?? null,
        linesAt: store.data.network.linesAt
          ? new Date(store.data.network.linesAt).toISOString()
          : null,
        stops: store.data.network.stops?.length ?? null,
        stopsAt: store.data.network.stopsAt
          ? new Date(store.data.network.stopsAt).toISOString()
          : null,
      },
      resolveError: resolveError?.message ?? null,
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Ginko diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await resolveConfig();
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const followed of stops) {
      await publishStopStates(followed);
    }
    if (traffic.data) {
      await digestTraffic();
    }
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      rawConfig = raw ?? {};
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        // The form values may lack the internal keys: never forget the added
        // stops, the next button would save the list without them.
        rawConfig = {
          [INTERNAL_KEYS.addedStops]: rawConfig[INTERNAL_KEYS.addedStops],
          ...fallback,
        };
        config = normalizeConfig(rawConfig);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    await loadConfig(rawConfig);
    lastDiscovery = null;
    boards.clear();
    snapshots.clear();
    stopErrors.clear();
    logger.info('Configuration updated');
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(stopTimer);
    clearInterval(trafficTimer);
    clearInterval(reminderTimer);
    clearTimeout(resolveTimer);
    await store.save();
  });

  return {
    store,
    api,
    readStops,
    trafficTick,
    checkReminders,
    applyConfig,
    getConfig: () => config,
    getStops: () => stops,
    getLines: () => lines,
    getSnapshot: (key) => snapshots.get(key),
    getTraffic: () => traffic,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  PASSAGES_PER_ROUTE,
  IDLE_INTERVAL_MS,
  TRAFFIC_INTERVAL_MS,
  SNAPSHOT_MAX_AGE_MS,
};
