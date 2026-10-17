// -----------------------------------------------------------------------------
// Scene triggers (pure logic) and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `departure_soon`   a passage serving a followed stop arrives in N
//                        minutes (2, 3, 5, 10, 15 or 20): checked on each
//                        reading and every 30 seconds on the last one, fired
//                        close to the mark, once per passage. The API gives
//                        no trip id: a passage is matched by line, direction,
//                        destination and time (± 2 min);
//   - `stop_not_served`  the next passage of a route (line, direction,
//                        destination) at a followed stop no longer serves it
//                        ("Non desservi", "Déviation", "Travaux"). Fired again
//                        only after the route served the stop again;
//   - `line_disrupted`   a followed line becomes disrupted or interrupted
//                        (or goes from disrupted to interrupted);
//   - `line_restored`    it runs normally again;
//   - `traffic_message`  Ginko publishes a new message about a followed line
//                        (news, planned or current disruption).
//
// What was seen is kept in /data (`seen`): a restart never fires the same
// event twice, and the first reading of a stop or a line is a baseline (no
// event replays what was already there). A scene action or a widget never
// fires an event.
// -----------------------------------------------------------------------------

import { t, lineStateText, passageWhen } from './i18n.js';
import { routeOf, minutesLeft, servedPassages } from './departures.js';
import { lineTraffic, seriousMessages, SERIOUS } from './traffic.js';
import { formatTime } from './time.js';

const TRIGGERS = {
  DEPARTURE_SOON: 'departure_soon',
  STOP_NOT_SERVED: 'stop_not_served',
  LINE_DISRUPTED: 'line_disrupted',
  LINE_RESTORED: 'line_restored',
  TRAFFIC_MESSAGE: 'traffic_message',
};
const REMINDER_MINUTES = [2, 3, 5, 10, 15, 20];
const REMINDER_MATCH_MS = 2 * 60 * 1000;
const REMINDER_KEEP_MS = 10 * 60 * 1000;
// A message seen is remembered this long after it disappeared: a message the
// API drops for a moment must not fire again.
const MESSAGE_KEEP_MS = 3 * 24 * 3600 * 1000;
// At most this many new messages fire per line and reading.
const MAX_MESSAGES_PER_LINE = 5;
const SUMMARY_MAX = 1000;
const MESSAGE_MAX = 1000;
const OUTPUT_MAX = 10000;
const NEXT_DEPARTURES_OUTPUTS = [
  'stop_name',
  'found',
  'line',
  'destination',
  'minutes',
  'time',
  'reliable',
  'following_minutes',
  'not_served',
  'summary',
];
const LINE_TRAFFIC_OUTPUTS = [
  'line_name',
  'state',
  'state_label',
  'disrupted',
  'disruption_count',
  'title',
  'message',
  'summary',
];

/**
 * @description Truncate a text, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description How close to a mark a reminder may fire (minutes before it).
 * @param {number} mark - The mark (minutes).
 * @returns {number} The tolerance: the marks never overlap.
 */
function tolerance(mark) {
  if (mark <= 3) {
    return 1;
  }
  return mark <= 5 ? 1.5 : 3;
}

/**
 * @description The reminders due on the passages of a stop.
 * @param {object} options - Options.
 * @param {object[]} options.passages - The passages of the stop.
 * @param {object[]} [options.fired] - The reminders already fired `[{ route, mark, at }]`.
 * @param {number} options.now - Now (ms).
 * @returns {{ due: Array<{ passage: object, mark: number }>, fired: object[] }}
 * The reminders to fire and the memory to keep.
 */
function detectReminders({ passages, fired = [], now }) {
  const memory = fired.filter((entry) => entry.at > now - REMINDER_KEEP_MS);
  const due = [];
  for (const passage of servedPassages(passages, now)) {
    const left = (passage.at - now) / 60000;
    const route = routeOf(passage);
    for (const mark of REMINDER_MINUTES) {
      if (left > mark || left <= mark - tolerance(mark)) {
        continue;
      }
      const known = memory.some(
        (entry) =>
          entry.route === route &&
          entry.mark === mark &&
          Math.abs(entry.at - passage.at) <= REMINDER_MATCH_MS,
      );
      if (!known) {
        memory.push({ route, mark, at: passage.at });
        due.push({ passage, mark });
      }
    }
  }
  return { due, fired: memory };
}

/**
 * @description The routes of a stop whose next passage does not serve it.
 * @param {object} options - Options.
 * @param {object[]} options.passages - The passages of the stop.
 * @param {object|null} options.memory - `{ routes }` kept, null before the
 * first reading (a baseline).
 * @param {number} options.now - Now (ms).
 * @returns {{ newly: object[], memory: object }} The passages of the routes
 * newly not served, and the memory to keep.
 */
function detectNotServed({ passages, memory, now }) {
  const routes = { ...(memory?.routes ?? {}) };
  const firsts = new Map();
  for (const passage of passages) {
    if (passage.at !== null && passage.at <= now - 30000) {
      continue;
    }
    const route = routeOf(passage);
    if (!firsts.has(route)) {
      firsts.set(route, passage);
    }
  }
  const newly = [];
  for (const [route, passage] of firsts) {
    if (passage.served) {
      delete routes[route];
    } else if (!routes[route]) {
      routes[route] = passage.reason || '?';
      if (memory) {
        newly.push(passage);
      }
    }
  }
  return { newly, memory: { routes } };
}

/**
 * @description The key of a message across readings.
 * @param {object} message - The message.
 * @returns {string} "<event>|<title>".
 */
const messageKey = (message) => `${message.event}|${message.title.toLowerCase()}`;

/**
 * @description What changed on the followed lines since the last reading.
 * @param {object} options - Options.
 * @param {object[]} options.lines - The followed lines (`id`).
 * @param {object} options.traffic - parseTraffic().
 * @param {object} [options.seen] - Per line id `{ state, messages: { key: lastSeen } }`.
 * @param {number} options.now - Now (ms).
 * @returns {{ changes: object[], seen: object }} `{ key, line, traffic,
 * message?, previous? }` per event, and the memory to keep.
 */
function detectLineChanges({ lines, traffic, seen = {}, now }) {
  const changes = [];
  const next = {};
  for (const line of lines) {
    const current = lineTraffic(traffic, line.id);
    const before = seen[line.id];
    const messages = {};
    for (const [key, at] of Object.entries(before?.messages ?? {})) {
      if (at > now - MESSAGE_KEEP_MS) {
        messages[key] = at;
      }
    }
    const fresh = current.messages.filter((message) => !messages[messageKey(message)]);
    current.messages.forEach((message) => {
      messages[messageKey(message)] = now;
    });
    // A line missing from the answer keeps its previous state.
    const state = current.state === 'unknown' && before ? before.state : current.state;
    next[line.id] = { state, messages };
    if (!before) {
      continue;
    }
    const wasSerious = SERIOUS.includes(before.state);
    const isSerious = SERIOUS.includes(state);
    if (isSerious && (!wasSerious || (before.state === 'disrupted' && state === 'interrupted'))) {
      changes.push({
        key: TRIGGERS.LINE_DISRUPTED,
        line,
        traffic: { ...current, state },
        message: seriousMessages(current)[0] ?? current.messages[0] ?? null,
      });
    } else if (wasSerious && !isSerious && state !== 'unknown') {
      changes.push({ key: TRIGGERS.LINE_RESTORED, line, traffic: { ...current, state } });
    }
    fresh.slice(0, MAX_MESSAGES_PER_LINE).forEach((message) => {
      changes.push({ key: TRIGGERS.TRAFFIC_MESSAGE, line, traffic: current, message });
    });
  }
  return { changes, seen: next };
}

// --- Payloads ------------------------------------------------------------------------

/**
 * @description The data of a `departure_soon` event.
 * @param {object} followed - The followed stop (`name`, `deviceId`).
 * @param {object} passage - The passage.
 * @param {number} mark - The minutes of the reminder.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} Flat scalars.
 */
function reminderData(followed, passage, mark, { language, timeZone }) {
  const time = formatTime(passage.at, timeZone);
  return {
    stop: followed.deviceId,
    minutes: String(mark),
    stop_name: followed.name,
    line: passage.line,
    destination: passage.destination,
    time,
    reliable: passage.reliable,
    summary: clip(
      t(passage.reliable ? 'summarySoon' : 'summarySoonTimetable', language, {
        line: passage.line,
        destination: passage.destination,
        stop: followed.stop.name,
        minutes: mark,
        time,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `stop_not_served` event.
 * @param {object} followed - The followed stop.
 * @param {object} passage - The passage not serving the stop.
 * @param {object} options - `{ language }`.
 * @returns {object} Flat scalars.
 */
function notServedData(followed, passage, { language }) {
  return {
    stop: followed.deviceId,
    stop_name: followed.name,
    line: passage.line,
    destination: passage.destination,
    reason: passage.reason,
    summary: clip(
      t('summaryNotServed', language, {
        line: passage.line,
        destination: passage.destination,
        stop: followed.stop.name,
        reason: passage.reason,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a line event.
 * @param {object} change - From detectLineChanges, with `deviceId` on its line.
 * @param {object} options - `{ language }`.
 * @returns {{ key: string, data: object }} The event.
 */
function lineEvent(change, { language }) {
  const { line, traffic, message } = change;
  const base = { line: line.deviceId, line_name: line.name };
  const stateLabel = lineStateText(traffic.state, language);
  if (change.key === TRIGGERS.LINE_RESTORED) {
    return {
      key: change.key,
      data: {
        ...base,
        state: traffic.state,
        summary: clip(
          t('summaryRestored', language, { line: line.name, state: stateLabel }),
          SUMMARY_MAX,
        ),
      },
    };
  }
  const title = message?.title ?? '';
  const details = {
    title,
    message: clip(message?.text ?? '', MESSAGE_MAX),
    url: message?.url ?? '',
  };
  if (change.key === TRIGGERS.LINE_DISRUPTED) {
    return {
      key: change.key,
      data: {
        ...base,
        severity: traffic.state,
        ...details,
        summary: clip(
          t(title ? 'summaryDisruptedTitle' : 'summaryDisrupted', language, {
            line: line.name,
            state: stateLabel,
            title,
          }),
          SUMMARY_MAX,
        ),
      },
    };
  }
  return {
    key: TRIGGERS.TRAFFIC_MESSAGE,
    data: {
      ...base,
      kind: message.state,
      ...details,
      summary: clip(
        t('summaryMessage', language, {
          line: line.name,
          kind: lineStateText(message.state, language),
          title,
        }),
        SUMMARY_MAX,
      ),
    },
  };
}

// --- Scene action outputs ------------------------------------------------------------

/**
 * @description The outputs of `get_next_departures`.
 * @param {object} options - Options.
 * @param {object} options.followed - The followed stop.
 * @param {object[]} options.passages - Its passages.
 * @param {number} options.now - Now (ms).
 * @param {string} options.language - Language of the summary.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The outputs.
 */
function nextDeparturesOutputs({ followed, passages, now, language, timeZone }) {
  const served = servedPassages(passages, now);
  const notServed = passages.filter((p) => !p.served && (p.at === null || p.at > now - 30000));
  const [first, second] = served;
  const outputs = {
    stop_name: followed.name,
    found: Boolean(first),
    line: first?.line ?? '',
    destination: first?.destination ?? '',
    minutes: first ? minutesLeft(first, now) : -1,
    time: first ? formatTime(first.at, timeZone) : '',
    reliable: first?.reliable ?? false,
    following_minutes: second ? minutesLeft(second, now) : -1,
    not_served: notServed.length,
  };
  let summary;
  if (first) {
    summary = t(first.reliable ? 'outputNext' : 'outputNextTimetable', language, {
      stop: followed.stop.name,
      line: first.line,
      destination: first.destination,
      when: passageWhen(first, { language, now, timeZone }),
    });
    if (second) {
      summary += ` ${t('outputFollowing', language, { when: passageWhen(second, { language, now, timeZone }) })}`;
    }
  } else if (notServed.length) {
    summary = t('outputOnlyNotServed', language, {
      stop: followed.stop.name,
      reason: notServed[0].reason,
    });
  } else {
    summary = t('outputNone', language, { stop: followed.stop.name });
  }
  return { ...outputs, summary: clip(summary, OUTPUT_MAX) };
}

/**
 * @description The outputs of `get_line_traffic`.
 * @param {object} options - `{ line, traffic, language }`.
 * @returns {object} The outputs.
 */
function lineTrafficOutputs({ line, traffic, language }) {
  const serious = seriousMessages(traffic);
  const first = serious[0] ?? traffic.messages[0] ?? null;
  const stateLabel = lineStateText(traffic.state, language);
  const disrupted = SERIOUS.includes(traffic.state);
  const count = disrupted ? Math.max(1, serious.length) : serious.length;
  const summary = first?.title
    ? t('summaryLineState', language, { line: line.name, state: stateLabel, title: first.title })
    : t('summaryLineStateOnly', language, { line: line.name, state: stateLabel });
  return {
    line_name: line.name,
    state: traffic.state,
    state_label: stateLabel,
    disrupted,
    disruption_count: count,
    title: first?.title ?? '',
    message: clip(first?.text ?? '', OUTPUT_MAX),
    summary: clip(summary, OUTPUT_MAX),
  };
}

/**
 * @description Keep only the declared outputs.
 * @param {object} outputs - The outputs.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The outputs.
 */
const pick = (outputs, keys) => Object.fromEntries(keys.map((key) => [key, outputs[key]]));

export {
  TRIGGERS,
  REMINDER_MINUTES,
  NEXT_DEPARTURES_OUTPUTS,
  LINE_TRAFFIC_OUTPUTS,
  tolerance,
  detectReminders,
  detectNotServed,
  detectLineChanges,
  messageKey,
  reminderData,
  notServedData,
  lineEvent,
  nextDeparturesOutputs,
  lineTrafficOutputs,
  pick,
};
