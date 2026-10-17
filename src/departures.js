// -----------------------------------------------------------------------------
// The answer of TR/getTempsLieu -> the passages of a followed stop.
//
// Each FormTempsAttente gives a line, a destination and a time, written for
// the screens of the stops (`temps`) and in seconds (`tempsEnSeconde`):
//   - `typeDeTemps` 0: a wait ("3 min"), 1: a time ("17:30", from about an
//     hour), 2: a word replacing the time ("Non desservi", "Déviation",
//     "Travaux"): the vehicle does not serve the stop;
//   - `alternance`: the screens alternate the word with the wait ("Bus
//     complet" / "5 min"): the stop is still served;
//   - `fiable` false: the vehicle is not located, the time is the timetable
//     (Ginko asks to say so);
//   - `affluence` 0 low, 1 moderate, 2 high, -1 unknown, -2 not allowed for
//     this key (most keys).
// Passages towards the stop itself (the vehicle ends its trip there) are left
// out: nobody boards them.
// -----------------------------------------------------------------------------

import { fold } from './network.js';

const KINDS = { WAIT: 'wait', TIME: 'time', TEXT: 'text' };
const KIND_OF = { 0: KINDS.WAIT, 1: KINDS.TIME, 2: KINDS.TEXT };

/**
 * @description Split a typed direction into the words to look for.
 * @param {string} direction - "Chalezeule | Gare Viotte".
 * @returns {string[]} The folded alternatives.
 * @example
 * directionTerms('Chalezeule | Gare'); // -> ['chalezeule', 'gare']
 */
function directionTerms(direction) {
  return String(direction ?? '')
    .split('|')
    .map(fold)
    .filter(Boolean);
}

/**
 * @description One passage.
 * @param {object} raw - A FormTempsAttente.
 * @param {number} now - When the answer was read (ms).
 * @returns {object} The passage.
 */
function passageOf(raw, now) {
  const kind = KIND_OF[raw.typeDeTemps] ?? KINDS.WAIT;
  const seconds = Number(raw.tempsEnSeconde);
  const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  const word = kind === KINDS.TEXT ? String(raw.temps ?? '').trim() : '';
  const served = kind !== KINDS.TEXT || raw.alternance === true;
  const crowd = [0, 1, 2].includes(raw.affluence) ? raw.affluence : null;
  return {
    stopId: String(raw.idArret ?? ''),
    lineId: String(raw.idLigne ?? ''),
    line: String(raw.numLignePublic ?? raw.idLigne ?? ''),
    mode: raw.modeTransport === 1 ? 'tram' : 'bus',
    outbound: raw.sensAller === true,
    destination: String(raw.destination ?? '').trim(),
    via: String(raw.precisionDestination ?? '').trim(),
    kind,
    display: String(raw.temps ?? '').trim(),
    wait,
    at: wait === null ? null : now + wait * 1000,
    served,
    // The word of a stop not served ("Déviation"), or the note alternating
    // with the wait ("Bus complet").
    reason: served ? '' : word,
    note: served && kind === KINDS.TEXT ? word : '',
    reliable: raw.fiable === true,
    crowd,
    trafficId: Number(raw.idInfoTrafic) || 0,
  };
}

/**
 * @description The passages of a followed stop, soonest first.
 * @param {object} answer - The answer of getTempsLieu (`nomExact`, `listeTemps`).
 * @param {object} filter - `{ lineId, direction }`, empty for every passage.
 * @param {number} now - When it was read (ms).
 * @returns {object[]} The passages.
 */
function parsePassages(answer, { lineId = '', direction = '' } = {}, now) {
  const terms = directionTerms(direction);
  const here = fold(answer?.nomExact);
  return (Array.isArray(answer?.listeTemps) ? answer.listeTemps : [])
    .map((raw) => passageOf(raw, now))
    .filter((passage) => !lineId || passage.lineId === lineId)
    .filter((passage) => !here || fold(passage.destination) !== here)
    .filter((passage) => {
      if (terms.length === 0) {
        return true;
      }
      const target = fold(`${passage.destination} ${passage.via}`);
      return terms.some((term) => target.includes(term));
    })
    .sort((a, b) => (a.wait ?? Infinity) - (b.wait ?? Infinity));
}

/**
 * @description The minutes left before a passage.
 * @param {object} passage - The passage.
 * @param {number} now - Now (ms).
 * @returns {number|null} Whole minutes (rounded down, like the screens), null
 * when unknown.
 */
function minutesLeft(passage, now) {
  if (passage.at === null) {
    return null;
  }
  return Math.max(0, Math.floor((passage.at - now) / 60000));
}

/**
 * @description The passages still to come and serving the stop.
 * @param {object[]} passages - The passages.
 * @param {number} now - Now (ms).
 * @returns {object[]} The served passages not gone yet.
 */
const servedPassages = (passages, now) =>
  passages.filter((passage) => passage.served && passage.at !== null && passage.at > now - 30000);

/**
 * @description Who a passage is, across readings: line, direction and
 * destination (the API gives no stable id of the trip).
 * @param {object} passage - The passage.
 * @returns {string} "101|1|chalezeule".
 */
const routeOf = (passage) =>
  `${passage.lineId}|${passage.outbound ? 1 : 0}|${fold(passage.destination)}`;

export { KINDS, directionTerms, passageOf, parsePassages, minutesLeft, servedPassages, routeOf };
