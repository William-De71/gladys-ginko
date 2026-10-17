// -----------------------------------------------------------------------------
// Configuration of the Ginko integration.
//
// Fields of the config_schema:
//   - `api_key`               the key of the Ginko open data API (free, asked
//                             by e-mail; a temporary key lasts 24 h);
//   - `stop_<n>`              a followed stop (`<n>` from 1 to 3): its name
//                             ("Chamars") or its id ("t_cham1");
//   - `stop_<n>_line`         only this line ("T1", "L3", "Plan B"), empty
//                             for every line;
//   - `stop_<n>_direction`    only the destinations holding these words
//                             ("Chalezeule | Gare Viotte"), empty for both
//                             directions;
//   - `lines`                 the lines whose traffic is followed ("T1, L3, 7"),
//                             six at most;
//   - `interval`              seconds between two readings of the stops;
//   - `language`              language of the texts Gladys does not ask for in
//                             a language (device names, scene summaries):
//                             `auto` follows the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`         language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const MAX_STOPS = 3;
const MAX_LINES = 6;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const INTERVALS = [30, 60, 120, 300];
const DEFAULT_INTERVAL = 60;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read the reading interval.
 * @param {unknown} raw - The raw value ("60", 60).
 * @returns {number} Seconds, one of INTERVALS.
 */
function readInterval(raw) {
  const value = Number(raw);
  return INTERVALS.includes(value) ? value : DEFAULT_INTERVAL;
}

/**
 * @description Split a list of lines typed by hand.
 * @param {unknown} raw - "T1, L3 ; 7".
 * @returns {string[]} The lines, without duplicates, six at most.
 * @example
 * parseLines('T1, L3 ; 7'); // -> ['T1', 'L3', '7']
 */
function parseLines(raw) {
  const seen = new Set();
  return readString(raw)
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (!entry || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LINES);
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ apiKey, stops: [{ slot, stop, line, direction }],
 * lines, interval, language }`; a slot without a stop is left out.
 * @example
 * normalizeConfig({ api_key: 'k', stop_1: 'Chamars', stop_1_line: 'T1' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const stops = [];
  for (let slot = 1; slot <= MAX_STOPS; slot += 1) {
    const stop = readString(config[`stop_${slot}`]);
    if (stop) {
      stops.push({
        slot,
        stop,
        line: readString(config[`stop_${slot}_line`]),
        direction: readString(config[`stop_${slot}_direction`]),
      });
    }
  }
  return {
    apiKey: readString(config.api_key),
    stops,
    lines: parseLines(config.lines),
    interval: readInterval(config.interval),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_STOPS,
  MAX_LINES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  DEFAULT_INTERVAL,
  readInterval,
  parseLines,
  normalizeConfig,
  readLanguage,
};
