// The traffic of the lines, from the real answers: states, messages in plain
// text, one message per event and title.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTraffic,
  lineTraffic,
  seriousMessages,
  htmlToText,
  decodeEntities,
  stateName,
} from '../src/traffic.js';
import { STATES, MESSAGES } from './helpers/fixtures.js';

const traffic = parseTraffic(STATES.objets, MESSAGES.objets);

test('the state of each line, named', () => {
  assert.equal(traffic.states['101'], 'disrupted');
  assert.equal(traffic.states['4'], 'interrupted');
  assert.equal(traffic.states['110'], 'closed');
  assert.equal(stateName(9), 'unknown');
  assert.equal(lineTraffic(traffic, '999').state, 'unknown');
  assert.deepEqual(lineTraffic(null, '101'), { state: 'unknown', messages: [] });
});

test('the messages of a line: plain text, deduplicated, most serious first', () => {
  const l4 = lineTraffic(traffic, '4');
  // 29708 and 29709 are the same message of event 3538.
  assert.equal(l4.messages.filter((m) => m.event === 3538).length, 1);
  assert.deepEqual(
    l4.messages.map((m) => m.state),
    [...l4.messages.map((m) => m.state)].sort(
      (a, b) =>
        ['information', 'planned', 'disrupted', 'interrupted'].indexOf(b) -
        ['information', 'planned', 'disrupted', 'interrupted'].indexOf(a),
    ),
  );
  const t1 = lineTraffic(traffic, '101');
  assert.deepEqual(
    t1.messages.map((m) => [m.id, m.state, m.title]),
    [
      [30233, 'disrupted', 'Manifestation'],
      [29244, 'information', 'Travaux Ginko - P+R Ile de France'],
    ],
  );
  assert.doesNotMatch(t1.messages[0].text, /<|&#|&[a-z]+;/);
  assert.equal(t1.messages[0].url.startsWith('https://www.ginko.voyage/'), true);
  assert.equal(seriousMessages(t1).length, 1);
});

test('HTML to text: tags, entities, list items, blank space', () => {
  assert.equal(
    htmlToText(
      '<p>La ligne <strong>L4</strong> sera d&#233;vi&eacute;e.</p><ul><li>A</li><li>B&nbsp;C</li></ul>',
    ),
    'La ligne L4 sera déviée.\n• A\n• B C',
  );
  assert.equal(decodeEntities('&#128197; &#x2705; &unknown;'), '📅 ✅ &unknown;');
  assert.equal(htmlToText('<script>x()</script>ok'), 'ok');
  assert.equal(htmlToText(null), '');
});
