// A fake Ginko API for the tests, served through the `fetch` option of the
// integration. Its answers are real ones, read on 2026-10-17 at 22:19 (Paris)
// and reduced: nine lines, the stops of six names, the passages at Chamars
// (T1 and T2 not serving it: a demonstration in the city centre) and at Gare
// Viotte, the state of the lines and twelve traffic messages. Open data of
// Ginko, ODbL. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-10-17 22:19 in Paris: the time of the readings.
const NOW = Date.parse('2026-10-17T20:19:00Z');
const TZ = 'Europe/Paris';
const KEY = 'good-key';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const LINES = fixture('lignes.json');
const STOPS = fixture('arrets.json');
const CHAMARS = fixture('temps-chamars.json');
const VIOTTE = fixture('temps-viotte.json');
const STATES = fixture('etat-lignes.json');
const MESSAGES = fixture('messages.json');

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'ginko-')), 'ginko.json');

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description A FormTempsAttente.
 * @param {object} fields - What differs from a T2 tram towards Gare Viotte, located, in 5 min.
 * @returns {object} The passage, as the API writes it.
 */
function passage(fields = {}) {
  const seconds = fields.tempsEnSeconde ?? 300;
  return {
    idArret: 't_gvio1',
    idLigne: '102',
    numLignePublic: 'T2',
    modeTransport: 1,
    sensAller: true,
    destination: 'Hauts du Chazal',
    precisionDestination: '',
    temps: `${Math.floor(seconds / 60)} min`,
    typeDeTemps: 0,
    tempsEnSeconde: seconds,
    alternance: false,
    fiable: true,
    affluence: -2,
    idInfoTrafic: 0,
    ...fields,
  };
}

/**
 * @description The fake API.
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeGinko() {
  const state = {
    lines: clone(LINES),
    stops: clone(STOPS),
    // folded stop name -> answer of getTempsLieu
    places: { chamars: clone(CHAMARS), 'gare viotte': clone(VIOTTE) },
    states: clone(STATES),
    messages: clone(MESSAGES),
    // 'network', or an HTTP status, for every request.
    fail: null,
  };
  const calls = [];
  const json = (body) => new Response(JSON.stringify(body), { status: 200 });

  /**
   * @description The fetch function.
   * @param {string} url - The URL.
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(url) {
    const parsed = new URL(url);
    const method = parsed.pathname.replace(/^\//, '').replace(/\.do$/, '');
    calls.push({ method, params: Object.fromEntries(parsed.searchParams) });
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof state.fail === 'number') {
      return new Response('down', { status: state.fail });
    }
    const key = parsed.searchParams.get('apiKey');
    if (!key) {
      return json({
        ok: false,
        msg: "Une clé API est nécessaire pour utiliser l'API, plus d'information sur api.ginko.voyage",
      });
    }
    if (key !== KEY) {
      return json({ ok: false, msg: 'La clé donnée en paramètre est invalide' });
    }
    switch (method) {
      case 'DR/getLignes':
        return json(state.lines);
      case 'DR/getArrets':
        return json(state.stops);
      case 'TR/getEtatLignes':
        return json(state.states);
      case 'TR/getMessages':
        return json(state.messages);
      case 'TR/getTempsLieu': {
        const id = parsed.searchParams.get('idArret');
        if (id) {
          const answer = Object.values(state.places).find((place) =>
            place.objets.listeTemps.some((p) => p.idArret === id),
          );
          if (!answer) {
            return json({ ok: false, msg: 'Aucun arrêt ne correspond à votre recherche.' });
          }
          return json({
            ok: true,
            objets: {
              ...answer.objets,
              listeTemps: answer.objets.listeTemps.filter((p) => p.idArret === id),
            },
          });
        }
        const answer = state.places[fold(parsed.searchParams.get('nom'))];
        return json(answer ?? { ok: false, msg: 'Aucun arrêt ne correspond à votre recherche.' });
      }
      default:
        return new Response('not found', { status: 404 });
    }
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:ginko:${type}:${id}`,
    feature: (key) => `ext:ginko:${type}:${id}:${key}`,
  }),
};

export {
  NOW,
  TZ,
  KEY,
  LINES,
  STOPS,
  CHAMARS,
  VIOTTE,
  STATES,
  MESSAGES,
  silent,
  storePath,
  passage,
  fakeGinko,
  fakeGladys,
};
