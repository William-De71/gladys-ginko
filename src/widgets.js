// -----------------------------------------------------------------------------
// Dashboard widgets of the Ginko integration.
//
//   - `departures`  the next passages of a stop, like the screens of the
//                   stops, compact: one row per line and destination, its
//                   next passages on one line — 1 · 9 · 27 min, 23:32, not
//                   served —, timetable times in grey. A followed stop
//                   (chosen among the devices), several (their routes
//                   merged under one heading), or any stop typed in the
//                   widget settings (with an optional line);
//   - `traffic`     the state of lines — normal, disrupted, interrupted —
//                   then their traffic messages; a tap opens the full text.
//                   The followed lines, or the ones typed in the settings.
// Every content credits Ginko and the time of the reading (ODbL licence).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, lineStateText, passageShort } from './i18n.js';
import { minutesLeft, routeOf } from './departures.js';
import { STATES } from './traffic.js';
import { formatTime } from './time.js';

const WIDGETS = {
  DEPARTURES: 'departures',
  TRAFFIC: 'traffic',
};

const TTL_SECONDS = {
  departures: 60,
  idle: 300,
  traffic: 180,
  message: 300,
};

const BOARD_COUNT = { min: 1, max: 8, default: 6 };
// Characters a status row holds on one line in a dashboard column: beyond,
// the core cuts the value. A route then drops its last passages.
const ROW_CHARACTERS = 46;
const MAX_LIST_ITEMS = 8;
const MAX_STATUS_ITEMS = 10;
const STATE_COLORS = {
  unknown: WIDGET_COLORS.NEUTRAL,
  normal: WIDGET_COLORS.SUCCESS,
  information: WIDGET_COLORS.INFO,
  closed: WIDGET_COLORS.NEUTRAL,
  planned: WIDGET_COLORS.INFO,
  disrupted: WIDGET_COLORS.WARNING,
  interrupted: WIDGET_COLORS.DANGER,
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Centre-ville - 8 Septembre', 12); // -> 'Centre-vill…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The rows of the "departures" widget: one per line and
 * destination, its next passages on one line, soonest route first.
 * @param {object[]} passages - The passages to come, soonest first.
 * @returns {object[][]} The passages of each route.
 */
function routesOf(passages) {
  const byRoute = new Map();
  for (const passage of passages) {
    const route = routeOf(passage);
    byRoute.set(route, [...(byRoute.get(route) ?? []), passage]);
  }
  return [...byRoute.values()];
}

/**
 * @description The times of one route, as on the screens of the stops, on one
 * line: "1 · 9 · 27 min", "23:32 · 23:47", "Non desservi". In a route mixing
 * located vehicles and timetable times, the timetable ones carry a star.
 * @param {object[]} passages - The passages of the route.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {{ value: string, starred: boolean }} The value of the row.
 */
function routeValue(passages, options) {
  const timetable = passages.filter((passage) => passage.served && !passage.reliable);
  const mixed = timetable.length > 0 && timetable.length < passages.length;
  const star = (passage) => (mixed && passage.served && !passage.reliable ? '*' : '');
  // A run of waits shares its unit: "10 · 33 min · 23:29".
  const parts = [];
  let run = [];
  const flush = () => {
    if (run.length) {
      parts.push(`${run.join(' · ')} ${t('minutesShort', options.language)}`);
      run = [];
    }
  };
  for (const passage of passages) {
    const minutes = minutesLeft(passage, options.now);
    // A note ("Bus complet") stays next to its own time.
    if (passage.served && !passage.note && passage.kind !== 'time' && minutes > 0 && minutes < 60) {
      run.push(`${minutes}${star(passage)}`);
      continue;
    }
    flush();
    const text = passage.served
      ? passageShort(passage, options)
      : passage.reason || t('badgeNotServed', options.language);
    const part = `${text}${star(passage)}${passage.note ? ` (${passage.note})` : ''}`;
    // "Non desservi · Non desservi" says it once.
    if (part !== parts[parts.length - 1]) {
      parts.push(part);
    }
  }
  flush();
  let value = parts.join(' · ');
  // Ginko asks to say it when no vehicle of the route is located.
  if (timetable.length > 0 && !mixed) {
    value = `${value} · ${t('timetableShort', options.language)}`;
  }
  return { value: clip(value, 40), starred: mixed };
}

/**
 * @description The colour of a row, from its next passage: located, timetable
 * (grey, the request of Ginko) or not served.
 * @param {object} passage - The next passage of the route.
 * @returns {string} A WIDGET_COLORS value.
 */
function rowColor(passage) {
  if (!passage.served) {
    return WIDGET_COLORS.DANGER;
  }
  return passage.reliable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL;
}

/**
 * @description The rows of one stop: one compact row per line and
 * destination, soonest first, each row cut to one line.
 * @param {object[]} upcoming - The passages to come.
 * @param {string} prefix - The stop before each label, when the widget shows
 * several stops ('' otherwise).
 * @param {number} count - How many routes (rows).
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {{ items: object[], starred: boolean }} The rows.
 */
function boardRows(upcoming, prefix, count, options) {
  let starred = false;
  const items = routesOf(upcoming)
    .slice(0, count)
    .map((route) => {
      const [next] = route;
      const routeName = next.destination ? `${next.line} → ${next.destination}` : next.line;
      const label = clip(prefix ? `${prefix} · ${routeName}` : routeName, 40);
      let shown = route;
      let row = routeValue(shown, options);
      while (shown.length > 1 && label.length + row.value.length > ROW_CHARACTERS) {
        shown = shown.slice(0, -1);
        row = routeValue(shown, options);
      }
      starred = starred || row.starred;
      return {
        label,
        value: row.value,
        color: rowColor(next),
      };
    });
  return { items, starred };
}

/**
 * @description The "departures" widget: the stop, then one compact row per
 * line and destination, like the screens of the stops. With several stops
 * (`boards`), one heading and one list still (the content budget of the core
 * allows one status list and two texts): each row starts with its stop.
 * @param {object} options - Options.
 * @param {string} [options.title] - The name of the stop.
 * @param {object[]} [options.passages] - Its passages.
 * @param {number} [options.readAt] - When they were read (ms).
 * @param {object[]} [options.boards] - Several stops instead:
 * `[{ title, label, passages, readAt }]`, `label` the short name of the stop
 * before its rows.
 * @param {number} options.count - How many routes (rows) to show per stop.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildDeparturesWidget({
  title,
  passages,
  readAt,
  boards = [{ title, passages, readAt }],
  count,
  language,
  now,
  timeZone,
}) {
  const options = { language, now, timeZone };
  const several = boards.length > 1;
  const headingText = several
    ? [...new Set(boards.map((board) => board.label ?? board.title))].join(' · ')
    : boards[0].title;
  const heading = { type: 'text', variant: 'heading', text: clip(headingText, 40) };
  // The oldest reading: the widget never claims fresher data than it shows.
  const oldest = Math.min(...boards.map((board) => board.readAt));
  const updated = t('updatedAt', language, { time: formatTime(oldest, timeZone) });
  const upcomingOf = (board) => board.passages.filter((p) => p.at === null || p.at > now - 30000);
  if (boards.every((board) => upcomingOf(board).length === 0)) {
    return {
      ttl_seconds: TTL_SECONDS.idle,
      components: [
        heading,
        { type: 'text', variant: 'body', text: `${t('noPassage', language)}. ${updated}.` },
      ],
    };
  }
  let starred = false;
  const items = [];
  for (const board of boards) {
    const upcoming = upcomingOf(board);
    const prefix = several ? (board.label ?? board.title) : '';
    if (upcoming.length === 0) {
      items.push({
        label: clip(prefix, 40),
        value: clip(t('noPassage', language), 40),
        color: WIDGET_COLORS.NEUTRAL,
      });
      continue;
    }
    const rows = boardRows(upcoming, prefix, count, options);
    starred = starred || rows.starred;
    items.push(...rows.items);
  }
  const caption = starred ? `${updated} · * ${t('timetableShort', language)}` : updated;
  return {
    ttl_seconds: TTL_SECONDS.departures,
    components: [
      heading,
      { type: 'text', variant: 'caption', text: clip(caption, 80) },
      { type: 'status', items: items.slice(0, MAX_STATUS_ITEMS) },
    ],
  };
}

/**
 * @description The "traffic" widget.
 * @param {object} options - Options.
 * @param {Array<{ line: object, traffic: object }>} options.lines - The lines and their traffic.
 * @param {number|null} options.readAt - When the traffic was read.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildTrafficWidget({ lines, readAt, language, timeZone }) {
  const components = [
    { type: 'text', variant: 'heading', text: t('trafficTitle', language) },
    {
      type: 'status',
      items: lines.slice(0, MAX_STATUS_ITEMS).map(({ line, traffic }) => ({
        label: clip(line.name, 40),
        value: clip(lineStateText(traffic.state, language), 40),
        color: STATE_COLORS[traffic.state] ?? WIDGET_COLORS.NEUTRAL,
      })),
    },
  ];
  // One card per message, even when it names several of the lines (a
  // demonstration on T1 and T2 is one message per line for Ginko).
  const grouped = new Map();
  for (const { line, traffic } of lines) {
    for (const message of traffic.messages) {
      const key = `${message.event}|${message.title.toLowerCase()}`;
      const entry = grouped.get(key) ?? { message, names: [] };
      if (STATES.indexOf(message.state) > STATES.indexOf(entry.message.state)) {
        entry.message = message;
      }
      entry.names.push(line.name);
      grouped.set(key, entry);
    }
  }
  const items = [...grouped.values()].sort(
    (a, b) => STATES.indexOf(b.message.state) - STATES.indexOf(a.message.state),
  );
  if (items.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: items.slice(0, MAX_LIST_ITEMS).map(({ message, names }) => {
        const item = {
          title: clip(message.title || names.join(', '), 60),
          subtitle: clip(lineStateText(message.state, language), 60),
          badge: {
            text: clip(names.join(' · '), 16),
            color: STATE_COLORS[message.state] ?? WIDGET_COLORS.NEUTRAL,
          },
        };
        if (message.text) {
          item.description = clip(message.text, 2000);
        }
        if (/^https:\/\//.test(message.url) && message.url.length <= 2048) {
          item.links = [{ url: message.url, label: clip(t('moreInfo', language), 24) }];
        }
        return item;
      }),
    });
  }
  // Two texts at most: without a message, the body carries the update time.
  const updated = readAt ? t('updatedAt', language, { time: formatTime(readAt, timeZone) }) : '';
  if (items.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: [t('noMessage', language), updated && `${updated}.`].filter(Boolean).join(' '),
    });
  } else if (updated) {
    components.push({ type: 'text', variant: 'caption', text: updated });
  }
  return { ttl_seconds: TTL_SECONDS.traffic, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  BOARD_COUNT,
  STATE_COLORS,
  clip,
  messageContent,
  readCount,
  routeValue,
  buildDeparturesWidget,
  buildTrafficWidget,
};
