// -----------------------------------------------------------------------------
// Dashboard widgets of the Ginko integration.
//
//   - `departures`  the next passages of a stop, like the screens of the
//                   stops: line, destination, and a badge — 3 min, 23:32,
//                   not served. A followed stop (chosen among the devices),
//                   or any stop typed in the widget settings (with an
//                   optional line);
//   - `traffic`     the state of lines — normal, disrupted, interrupted —
//                   then their traffic messages; a tap opens the full text.
//                   The followed lines, or the ones typed in the settings.
// Every content credits Ginko and the time of the reading (ODbL licence).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, lineStateText, passageShort } from './i18n.js';
import { minutesLeft, servedPassages } from './departures.js';
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
 * @description The badge of a passage.
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {{ text: string, color: string }} The badge.
 */
function badgeOf(passage, options) {
  if (!passage.served) {
    return {
      text: clip(passage.reason || t('badgeNotServed', options.language), 16),
      color: WIDGET_COLORS.DANGER,
    };
  }
  const color = passage.reliable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL;
  return { text: clip(passageShort(passage, options), 16), color };
}

/**
 * @description The "departures" widget.
 * @param {object} options - Options.
 * @param {string} options.title - The name of the stop.
 * @param {object[]} options.passages - Its passages.
 * @param {number} options.readAt - When they were read (ms).
 * @param {number} options.count - How many passages to show.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildDeparturesWidget({ title, passages, readAt, count, language, now, timeZone }) {
  const options = { language, now, timeZone };
  const heading = { type: 'text', variant: 'heading', text: clip(title, 40) };
  const caption = {
    type: 'text',
    variant: 'caption',
    text: t('updatedAt', language, { time: formatTime(readAt, timeZone) }),
  };
  const upcoming = passages.filter((p) => p.at === null || p.at > now - 30000);
  if (upcoming.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.idle,
      components: [
        heading,
        {
          type: 'text',
          variant: 'body',
          text: `${t('noPassage', language)}. ${caption.text}.`,
        },
      ],
    };
  }
  const components = [heading];
  const [next] = servedPassages(upcoming, now);
  if (next && next.kind !== 'time' && minutesLeft(next, now) < 60) {
    components.push({
      type: 'value',
      value: minutesLeft(next, now),
      unit: t('minutesShort', language),
      label: clip(`${t('nextIn', language)} · ${next.line}`, 24),
      icon: 'clock',
      color: next.reliable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: upcoming.slice(0, Math.min(count, MAX_LIST_ITEMS)).map((passage) => {
      const details = [
        passage.via,
        passage.note,
        passage.served && !passage.reliable ? t('timetableNote', language) : '',
        passage.crowd !== null ? t(`crowd_${passage.crowd}`, language) : '',
      ].filter(Boolean);
      const item = {
        title: clip(
          passage.destination ? `${passage.line} → ${passage.destination}` : passage.line,
          60,
        ),
        badge: badgeOf(passage, options),
      };
      if (details.length) {
        item.subtitle = clip(details.join(' · '), 60);
      }
      return item;
    }),
  });
  components.push(caption);
  return { ttl_seconds: TTL_SECONDS.departures, components };
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
  badgeOf,
  buildDeparturesWidget,
  buildTrafficWidget,
};
