// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a real Saturday evening in Besançon: the answers of the
// Ginko API read on 2026-10-17 at 22:19 and kept in test/fixtures (passages
// at Gare Viotte, state of the lines, traffic messages) go through the real
// parsers (src/departures.js, src/traffic.js) and the real widget builders
// (src/widgets.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDeparturesWidget, buildTrafficWidget } = await load('src/widgets.js');
const { parsePassages } = await load('src/departures.js');
const { parseTraffic, lineTraffic } = await load('src/traffic.js');
const { LANGUAGES } = await load('src/i18n.js');
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Saturday 17 October 2026, 22:19 in Paris.
const NOW = Date.parse('2026-10-17T20:19:00Z');
const TZ = 'Europe/Paris';

const passages = parsePassages(fixture('temps-viotte.json').objets, {}, NOW);
const traffic = parseTraffic(fixture('etat-lignes.json').objets, fixture('messages.json').objets);
const lines = [
  { id: '101', name: 'T1' },
  { id: '102', name: 'T2' },
  { id: '3', name: 'L3' },
  { id: '4', name: 'L4' },
  { id: '110', name: 'Plan B' },
].map((line) => ({ line, traffic: lineTraffic(traffic, line.id) }));

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    departures: buildDeparturesWidget({
      title: 'Gare Viotte',
      passages,
      readAt: NOW,
      count: 6,
      language,
      now: NOW,
      timeZone: TZ,
    }),
    traffic: buildTrafficWidget({ lines, readAt: NOW - 2 * 60 * 1000, language, timeZone: TZ }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
