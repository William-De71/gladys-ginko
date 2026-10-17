// -----------------------------------------------------------------------------
// The traffic of the lines: TR/getEtatLignes (one state per line) and
// TR/getMessages (the messages of the website), read together.
//
// States of a line (FormInfoLigne.etat), named here:
//   0 `unknown`      no information (on-demand services);
//   1 `normal`       the line runs normally;
//   2 `information`  a piece of news about the line (new timetable…);
//   3 `closed`       the line does not run at this time (evening, Sunday…);
//   4 `planned`      a disruption is planned;
//   5 `disrupted`    a disruption is under way;
//   6 `interrupted`  the line is interrupted.
// The messages (titles and texts in HTML, in French only: the network has no
// other language) name the internal ids of their lines. Several messages of
// one event can share a title: they are shown once.
// -----------------------------------------------------------------------------

const STATES = [
  'unknown',
  'normal',
  'information',
  'closed',
  'planned',
  'disrupted',
  'interrupted',
];
const SERIOUS = ['disrupted', 'interrupted'];
const TEXT_MAX = 2000;

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
  ugrave: 'ù',
  icirc: 'î',
  iuml: 'ï',
  euml: 'ë',
  rsquo: '’',
  lsquo: '‘',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  euro: '€',
  deg: '°',
};

/**
 * @description The name of a state code.
 * @param {unknown} code - 0 to 6.
 * @returns {string} The name, `unknown` for anything else.
 * @example
 * stateName(5); // -> 'disrupted'
 */
const stateName = (code) => STATES[Number(code)] ?? 'unknown';

/**
 * @description Decode the HTML entities of a text.
 * @param {string} text - The text.
 * @returns {string} The decoded text.
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return NAMED[entity.toLowerCase()] ?? whole;
  });
}

/**
 * @description The plain text of an HTML message: tags removed, list items
 * as bullets, entities decoded, blank space collapsed.
 * @param {unknown} html - The HTML.
 * @returns {string} The text.
 * @example
 * htmlToText('<p>Ligne <strong>L4</strong> d&#233;vi&eacute;e.</p>'); // -> 'Ligne L4 déviée.'
 */
function htmlToText(html) {
  const text = String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>|<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * @description What is kept of a message.
 * @param {object} raw - A FormMessage.
 * @returns {object} `{ id, event, state, title, text, url, lines, stops }`.
 */
function messageOf(raw) {
  return {
    id: Number(raw.id) || 0,
    event: Number(raw.idEvenement) || 0,
    state: stateName(raw.etat),
    title: htmlToText(raw.titre).replace(/\n/g, ' ').slice(0, 200),
    text: htmlToText(raw.texte).slice(0, TEXT_MAX),
    url: typeof raw.url === 'string' ? raw.url : '',
    lines: (Array.isArray(raw.lignes) ? raw.lignes : []).map(String),
    stops: (Array.isArray(raw.arrets) ? raw.arrets : []).map(String),
  };
}

/**
 * @description Read the two answers.
 * @param {object[]} states - The answer of getEtatLignes.
 * @param {object[]} messages - The answer of getMessages.
 * @returns {{ states: Object<string, string>, messages: object[] }} The state
 * of each line id, and the messages.
 */
function parseTraffic(states, messages) {
  return {
    states: Object.fromEntries(
      (Array.isArray(states) ? states : []).map((entry) => [
        String(entry.idLigne),
        stateName(entry.etat),
      ]),
    ),
    messages: (Array.isArray(messages) ? messages : []).map(messageOf).filter((m) => m.id),
  };
}

/**
 * @description The traffic of one line.
 * @param {object|null} traffic - parseTraffic().
 * @param {string} lineId - The internal id of the line.
 * @returns {{ state: string, messages: object[] }} Its state and messages
 * (one per event and title, the most serious first).
 */
function lineTraffic(traffic, lineId) {
  if (!traffic) {
    return { state: 'unknown', messages: [] };
  }
  const seen = new Set();
  const messages = traffic.messages
    .filter((message) => message.lines.includes(lineId))
    .filter((message) => {
      const key = `${message.event}|${message.title.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => STATES.indexOf(b.state) - STATES.indexOf(a.state));
  return { state: traffic.states[lineId] ?? 'unknown', messages };
}

/**
 * @description The messages of a line about a disruption under way.
 * @param {{ messages: object[] }} line - lineTraffic().
 * @returns {object[]} The messages.
 */
const seriousMessages = (line) => line.messages.filter((m) => SERIOUS.includes(m.state));

export {
  STATES,
  SERIOUS,
  stateName,
  decodeEntities,
  htmlToText,
  messageOf,
  parseTraffic,
  lineTraffic,
  seriousMessages,
};
