// -----------------------------------------------------------------------------
// HTTP client of the Ginko open data API (https://api.ginko.voyage), the
// real-time API of the bus and tram network of Besançon, run by Keolis
// Besançon Mobilités for Grand Besançon Métropole.
//
// Every request carries the free key of the user (`apiKey`). The answers are
// JSON, always wrapped: `{ "ok": true, "objets": … }` or `{ "ok": false,
// "msg": "…" }` — with an HTTP 200 in both cases. The messages seen:
//   - "Une clé API est nécessaire pour utiliser l'API…"   no key;
//   - "La clé donnée en paramètre est invalide"          wrong or expired key
//                                                         (a temporary key
//                                                         lasts 24 h);
//   - "Aucun arrêt ne correspond à votre recherche."     unknown stop.
//
// Methods used (documentation: https://api.ginko.voyage/APIDoc/):
//   DR/getLignes.do         lines and their variants (directions), once a day;
//   DR/getArrets.do         every stop (id, name, position), cached for days;
//   TR/getTempsLieu.do      the next passages at a stop (by name: every stop
//                           of that name, both sides of the street; or by id);
//   TR/getEtatLignes.do     the traffic state of every line (0 to 6);
//   TR/getMessages.do       the traffic messages (Web support).
// The data are under the ODbL licence: the source is credited in the docs.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL = process.env.GINKO_API_URL || 'https://api.ginko.voyage';
const TIMEOUT_MS = 20000;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-ginko/${version} (+https://github.com/William-De71/gladys-ginko)`;

class GinkoError extends Error {
  /**
   * @param {string} kind - `auth`, `not_found`, `unreachable` or `invalid`.
   * @param {string} message - The detail (never the key).
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'GinkoError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The kind of a refusal of the API, from its message.
 * @param {string} message - The `msg` of an `ok: false` answer.
 * @returns {string} `auth`, `not_found` or `invalid`.
 * @example
 * refusalKind('La clé donnée en paramètre est invalide'); // -> 'auth'
 */
function refusalKind(message) {
  const text = String(message ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/\bcle\b|api ?key/.test(text)) {
    return 'auth';
  }
  if (/aucun|ne correspond|introuvable|inconnu/.test(text)) {
    return 'not_found';
  }
  return 'invalid';
}

/**
 * @description A client of the Ginko API.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`, the key of the user.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {string} [options.baseUrl] - The API root (tests, end-to-end runs).
 * @returns {object} The methods, and `requests` for the diagnostic.
 */
function createGinkoClient({
  getApiKey,
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = BASE_URL,
}) {
  // Requests made, per method, and the last refusal, for the diagnostic.
  const requests = { total: 0, byMethod: {}, failed: 0, last: null };

  /**
   * @description Call a method of the API.
   * @param {string} method - "TR/getTempsLieu".
   * @param {object} [params] - Query parameters (arrays are joined with ~).
   * @returns {Promise<unknown>} The unwrapped `objets`.
   */
  async function call(method, params = {}) {
    const key = getApiKey();
    if (!key) {
      throw new GinkoError('auth', 'no API key');
    }
    const query = new URLSearchParams({ apiKey: key });
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(name, Array.isArray(value) ? value.join('~') : String(value));
      }
    }
    requests.total += 1;
    requests.byMethod[method] = (requests.byMethod[method] ?? 0) + 1;
    requests.last = now();
    let response;
    try {
      response = await fetchFn(`${baseUrl}/${method}.do?${query}`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      throw new GinkoError('unreachable', err.cause?.code ?? err.message);
    }
    if (!response.ok) {
      requests.failed += 1;
      throw new GinkoError(
        response.status === 401 || response.status === 403 ? 'auth' : 'unreachable',
        `HTTP ${response.status}`,
        { status: response.status },
      );
    }
    let body;
    try {
      body = await response.json();
    } catch (err) {
      requests.failed += 1;
      throw new GinkoError('invalid', `${method}: ${err.message}`);
    }
    if (!body || typeof body !== 'object' || body.ok !== true) {
      requests.failed += 1;
      const message = typeof body?.msg === 'string' ? body.msg : 'unexpected answer';
      throw new GinkoError(refusalKind(message), message.slice(0, 200));
    }
    return body.objets;
  }

  /**
   * @description Check that an answer is an array.
   * @param {unknown} value - The unwrapped answer.
   * @param {string} method - For the message.
   * @returns {object[]} The array.
   */
  const list = (value, method) => {
    if (!Array.isArray(value)) {
      throw new GinkoError('invalid', `${method}: not a list`);
    }
    return value;
  };

  return {
    requests,
    /**
     * @description The lines running today, with their variants.
     * @returns {Promise<object[]>} FormLigne objects.
     */
    lines: async () => list(await call('DR/getLignes'), 'getLignes'),
    /**
     * @description Every stop of the network.
     * @returns {Promise<object[]>} FormArret objects.
     */
    stops: async () => list(await call('DR/getArrets'), 'getArrets'),
    /**
     * @description The next passages at a stop.
     * @param {object} target - `{ name }` (every stop of that name) or `{ id }`.
     * @param {number} [count] - Passages per line and direction (1 to 5).
     * @returns {Promise<{ nomExact: string, listeTemps: object[] }>} The answer.
     */
    async waitTimes(target, count = 3) {
      const answer = await call('TR/getTempsLieu', {
        ...(target.id ? { idArret: target.id } : { nom: target.name }),
        nb: Math.min(5, Math.max(1, count)),
      });
      if (!answer || typeof answer !== 'object' || !Array.isArray(answer.listeTemps)) {
        throw new GinkoError('invalid', 'getTempsLieu: no listeTemps');
      }
      return answer;
    },
    /**
     * @description The traffic state of every line.
     * @returns {Promise<object[]>} FormInfoLigne objects.
     */
    lineStates: async () => list(await call('TR/getEtatLignes'), 'getEtatLignes'),
    /**
     * @description The traffic messages of the network.
     * @returns {Promise<object[]>} FormMessage objects.
     */
    messages: async () => list(await call('TR/getMessages'), 'getMessages'),
  };
}

export { BASE_URL, USER_AGENT, GinkoError, refusalKind, createGinkoClient };
