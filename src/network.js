// -----------------------------------------------------------------------------
// The reference data of the network: lines and stops, kept in /data.
//
//   - lines (DR/getLignes): read again once a day, after 04:00 (the advice of
//     the API documentation). A line is typed the way the user reads it:
//     "T1", "L3", "3" (= L3), "Plan B", "51", "D101"; it resolves to its
//     internal id ("101" for T1, "3" for L3), the one the other methods use;
//   - stops (DR/getArrets): read again every seven days. A stop is typed by
//     name ("Chamars", "gare viotte") — every stop of that name, both sides
//     of the street — or by id ("t_cham1", one side only), given by the
//     "Find a stop" button. A name the list does not hold is asked to the
//     fuzzy search of the API, once;
//   - the directions of a stop (DR/getVariantesDesservantArret): read for the
//     "Find a stop" button, so that the user can tell the two sides of the
//     street apart; kept a day.
//
// Names are compared folded: no case, no accent, no punctuation.
// -----------------------------------------------------------------------------

const LINES_MAX_AGE_MS = 24 * 3600 * 1000;
const STOPS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * @description Fold a text for comparisons.
 * @param {unknown} value - The text.
 * @returns {string} Lower case, no accent, words separated by one space.
 * @example
 * fold('Pôle  Témis-Est'); // -> 'pole temis est'
 */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @description A slug for an external id.
 * @param {unknown} value - The text.
 * @param {number} [max] - Its longest length.
 * @returns {string} "gare-viotte".
 */
function slug(value, max = 40) {
  return fold(value).replace(/ /g, '-').slice(0, max).replace(/-$/, '');
}

/**
 * @description What is kept of a line.
 * @param {object} raw - A FormLigne.
 * @returns {object} `{ id, name, label, mode, typology, periurban, school, directions }`.
 */
function lineOf(raw) {
  return {
    id: String(raw.id),
    name: String(raw.numLignePublic ?? raw.id),
    label: String(raw.libellePublic ?? ''),
    mode: raw.modeTransport === 1 ? 'tram' : 'bus',
    typology: Number(raw.typologie) || 80,
    periurban: raw.periurbain === true,
    school: raw.scolaire === true,
    directions: (Array.isArray(raw.variantes) ? raw.variantes : [])
      .map((variant) => String(variant.destination ?? ''))
      .filter((destination, index, all) => destination && all.indexOf(destination) === index),
  };
}

/**
 * @description What is kept of a stop.
 * @param {object} raw - A FormArret.
 * @returns {object} `{ id, name, latitude, longitude }`.
 */
const stopOf = (raw) => ({
  id: String(raw.id),
  name: String(raw.nom ?? raw.id),
  latitude: Number(raw.latitude) || 0,
  longitude: Number(raw.longitude) || 0,
});

/**
 * @description Find a line among the known ones.
 * @param {object[]} lines - The known lines.
 * @param {string} typed - "T1", "L3", "3", "plan b", "101".
 * @returns {object|null} The line.
 * @example
 * findLine(lines, 'l3'); // -> { id: '3', name: 'L3', … }
 */
function findLine(lines, typed) {
  const wanted = fold(typed).replace(/ /g, '');
  if (!wanted) {
    return null;
  }
  const compact = (value) => fold(value).replace(/ /g, '');
  return (
    lines.find((line) => compact(line.name) === wanted) ??
    lines.find((line) => compact(line.name) === `l${wanted}`) ??
    lines.find((line) => compact(line.name) === `ginko${wanted}`) ??
    lines.find((line) => line.id.toLowerCase() === wanted) ??
    null
  );
}

/**
 * @description Find a stop among the known ones.
 * @param {object[]} stops - The known stops.
 * @param {string} typed - A name or an id.
 * @returns {{ kind: string, id: string|null, name: string }|null} `kind`:
 * `place` (every stop of the name) or `stop` (one id).
 * @example
 * findStop(stops, 'gare viotte'); // -> { kind: 'place', id: null, name: 'Gare Viotte' }
 */
function findStop(stops, typed) {
  const raw = String(typed ?? '').trim();
  if (!raw) {
    return null;
  }
  const byId = stops.find((stop) => stop.id.toLowerCase() === raw.toLowerCase());
  if (byId) {
    return { kind: 'stop', id: byId.id, name: byId.name };
  }
  const wanted = fold(raw);
  const exact = stops.find((stop) => fold(stop.name) === wanted);
  if (exact) {
    return { kind: 'place', id: null, name: exact.name };
  }
  // A unique name holding every typed word ("viotte" -> "Gare Viotte").
  const words = wanted.split(' ');
  const names = [
    ...new Set(
      stops
        .filter((stop) => {
          const name = ` ${fold(stop.name)} `;
          return words.every((word) => name.includes(` ${word}`));
        })
        .map((stop) => stop.name),
    ),
  ];
  return names.length === 1 ? { kind: 'place', id: null, name: names[0] } : null;
}

/**
 * @description The directions served at one stop, from the lines serving it.
 * @param {object[]} raw - FormLigne objects of getVariantesDesservantArret.
 * @returns {Array<{ destination: string, lines: string[] }>} One entry per
 * destination, with the public names of its lines, in the order of the API.
 * @example
 * routesOf(answer); // -> [{ destination: 'Prés de Vaux', lines: ['12'] }, …]
 */
function routesOf(raw) {
  const byDestination = new Map();
  for (const line of Array.isArray(raw) ? raw : []) {
    const name = String(line?.numLignePublic ?? line?.id ?? '');
    for (const variant of Array.isArray(line?.variantes) ? line.variantes : []) {
      const destination = String(variant?.destination ?? '').trim();
      if (!destination || !name) {
        continue;
      }
      const entry = byDestination.get(destination) ?? { destination, lines: [] };
      if (!entry.lines.includes(name)) {
        entry.lines.push(name);
      }
      byDestination.set(destination, entry);
    }
  }
  return [...byDestination.values()];
}

/**
 * @description Search stops by name, for the "Find a stop" button.
 * @param {object[]} stops - The known stops.
 * @param {string} query - Words of the name.
 * @param {number} [max] - The most names returned.
 * @returns {Array<{ name: string, ids: string[] }>} The names, exact ones first.
 */
function searchStops(stops, query, max = 8) {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const byName = new Map();
  for (const stop of stops) {
    const name = ` ${fold(stop.name)} `;
    if (words.every((word) => name.includes(word))) {
      const entry = byName.get(stop.name) ?? { name: stop.name, ids: [] };
      entry.ids.push(stop.id);
      byName.set(stop.name, entry);
    }
  }
  const wanted = words.join(' ');
  return [...byName.values()]
    .sort((a, b) => {
      const rank = (entry) =>
        fold(entry.name) === wanted ? 0 : fold(entry.name).startsWith(wanted) ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr');
    })
    .slice(0, max);
}

/**
 * @description The reference data, read through the API and kept in the store.
 * @param {object} options - Options.
 * @param {object} options.api - The Ginko client.
 * @param {object} options.store - The store (`data.network`).
 * @param {Function} options.now - `() => number` in ms.
 * @param {Function} options.isNewDay - `(readAt) => boolean`: a 04:00 passed since.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The network.
 */
function createNetwork({ api, store, now, isNewDay, logger }) {
  const data = () => {
    if (!store.data.network || typeof store.data.network !== 'object') {
      store.data.network = { lines: null, linesAt: 0, stops: null, stopsAt: 0 };
    }
    return store.data.network;
  };
  // stop id -> { routes, readAt }: the lines change from day to day (school
  // lines, holidays), so a day at most, like the lines.
  const routesCache = new Map();

  /**
   * @description The lines, read again when stale. A failed reading keeps the
   * ones known.
   * @param {boolean} [force] - Read even when fresh.
   * @returns {Promise<object[]>} The lines.
   */
  async function lines(force = false) {
    const kept = data();
    const fresh = kept.lines && now() - kept.linesAt < LINES_MAX_AGE_MS && !isNewDay(kept.linesAt);
    if (fresh && !force) {
      return kept.lines;
    }
    try {
      kept.lines = (await api.lines()).map(lineOf);
      kept.linesAt = now();
      await store.save();
    } catch (err) {
      if (!kept.lines || err.kind === 'auth') {
        throw err;
      }
      logger?.warn(`Ginko lines not read again (${err.kind ?? 'error'}): ${err.message}`);
    }
    return kept.lines;
  }

  /**
   * @description The stops, read again when older than seven days.
   * @param {boolean} [force] - Read even when fresh.
   * @returns {Promise<object[]>} The stops.
   */
  async function stops(force = false) {
    const kept = data();
    if (kept.stops && now() - kept.stopsAt < STOPS_MAX_AGE_MS && !force) {
      return kept.stops;
    }
    try {
      kept.stops = (await api.stops()).map(stopOf);
      kept.stopsAt = now();
      kept.aliases = {};
      await store.save();
    } catch (err) {
      if (!kept.stops || err.kind === 'auth') {
        throw err;
      }
      logger?.warn(`Ginko stops not read again (${err.kind ?? 'error'}): ${err.message}`);
    }
    return kept.stops;
  }

  return {
    lines,
    stops,
    /**
     * @description A line known without reading anything.
     * @param {string} id - The internal id.
     * @returns {object|null} The line.
     */
    peekLine: (id) => data().lines?.find((line) => line.id === String(id)) ?? null,
    /**
     * @description Resolve a typed line.
     * @param {string} typed - The line as typed.
     * @returns {Promise<object|null>} The line, null when unknown.
     */
    resolveLine: async (typed) => findLine(await lines(), typed),
    /**
     * @description Resolve a typed stop: among the known stops first, then
     * through the fuzzy search of the API ("Pôle Temis" -> "Temis"), whose
     * answers are remembered.
     * @param {string} typed - A name or an id.
     * @returns {Promise<object|null>} `{ kind, id, name }`, null when unknown.
     */
    async resolveStop(typed) {
      const known = await stops();
      const found = findStop(known, typed);
      if (found || !String(typed ?? '').trim()) {
        return found;
      }
      const kept = data();
      kept.aliases = kept.aliases && typeof kept.aliases === 'object' ? kept.aliases : {};
      const alias = fold(typed);
      if (!(alias in kept.aliases)) {
        try {
          const answer = await api.waitTimes({ name: String(typed).trim() }, 1);
          kept.aliases[alias] = findStop(known, answer.nomExact)?.name ?? null;
        } catch (err) {
          if (err.kind !== 'not_found') {
            throw err;
          }
          kept.aliases[alias] = null;
        }
        await store.save();
      }
      return kept.aliases[alias] ? { kind: 'place', id: null, name: kept.aliases[alias] } : null;
    },
    /**
     * @description Search stops by name.
     * @param {string} query - Words of the name.
     * @returns {Promise<object[]>} `[{ name, ids }]`.
     */
    searchStops: async (query) => searchStops(await stops(), query),
    /**
     * @description The directions served at one stop, kept a day.
     * @param {string} id - The stop id.
     * @returns {Promise<Array<{ destination: string, lines: string[] }>>} The directions.
     */
    async routesAt(id) {
      const kept = routesCache.get(id);
      if (kept && now() - kept.readAt < LINES_MAX_AGE_MS && !isNewDay(kept.readAt)) {
        return kept.routes;
      }
      const routes = routesOf(await api.routesAt(id));
      routesCache.set(id, { routes, readAt: now() });
      return routes;
    },
  };
}

export {
  LINES_MAX_AGE_MS,
  STOPS_MAX_AGE_MS,
  fold,
  slug,
  lineOf,
  stopOf,
  findLine,
  findStop,
  routesOf,
  searchStops,
  createNetwork,
};
