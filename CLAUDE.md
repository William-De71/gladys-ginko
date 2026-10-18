# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Ginko, the bus and tram network
of Besançon: a Node.js service (Node 22+, ESM, no build step) that runs in its
own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the open data API of Ginko
(`https://api.ginko.voyage`, a free key asked by e-mail, ODbL data): the
passages of the followed stops — three in the form, up to 20 more added with
the "Add a stop" button (`TR/getTempsLieu`) —, the traffic of up to six
lines (`TR/getEtatLignes`, `TR/getMessages`), and the lines and stops of the
network (`DR/getLignes`, `DR/getArrets`, kept in /data), and the directions of
one stop for "Find a stop" (`DR/getVariantesDesservantArret`, kept a day).
Transport: cloud only.
Documentation of the API: https://api.ginko.voyage/APIDoc/ (Swagger, `APIGinko.yaml`).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timers
src/ginko-api.js        HTTP client: the key in the query, `{ ok, objets | msg }` unwrapped
src/network.js          lines and stops in /data, typed names -> ids, fuzzy fallback
src/departures.js       getTempsLieu -> passages (wait, time, word, served, timetable)
src/traffic.js          line states 0-6 and messages (HTML -> text)
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the stop and line devices and their states
src/widgets.js          departures and traffic dashboard widgets
src/store.js            /data/ginko.json: network, `seen`
src/time.js             times of day (TZ), the service day (04:00)
src/config.js           configuration (key, three stops + `added_stops`, lines, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of the Ginko API, reduced (ODbL)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`stop:n-<folded name>_<line id>_<direction>` or
  `stop:i-<stop id>…`, `line:<internal line id>`: never a public label that
  could change), feature `category` / `type` / `unit` / `min` / `max` /
  `step`, the keys of `config_schema`, `actions`, the widgets and their
  settings, scene triggers (fields, options, variables) and scene actions
  (fields, outputs), and the internal config keys `added_stops` (`[{ stop,
line, direction }]`) and `last_language`. `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** The next passage and the line traffic are `text`
  / `text`, the waits `duration` / `integer` in minutes (0-180), the counts
  `counter-sensor` / `integer` (0-20). Without a passage the waits are not
  published (a 0 would announce a bus now).
- **`should_poll` stays false**: the integration reads on its own timer — the
  stops every `interval` (30 s to 5 min, 1 min by default; 10 min while a stop
  announces nothing), the traffic every 5 min, the lines daily after 04:00,
  the stops weekly. A widget or a scene action reuses a reading of less than
  90 s.
- **The API answers 200 to everything**: a refusal is `{ "ok": false, "msg" }`,
  told apart by its message (`refusalKind`). Never log the key; the diagnostic
  says only whether it is set.
- **Timetable times.** `fiable: false` means the vehicle is not located: say
  "timetable" in every text and show it in grey (the request of Ginko).
- **Events once.** `seen` (in /data) remembers the reminders fired per stop,
  the routes not served per stop, the state and messages of each line. The
  first reading of a stop or a line is a baseline (a reminder already due may
  fire). A scene action or a widget never fires an event.
- **Data licence.** ODbL: keep "Ginko" and the time of the reading visible in
  the widgets, and the credit in the README, the docs and NOTICE.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Names of stops, destinations and the
  messages of Ginko stay in French.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): widgets and scene
  triggers need 5.1.x (`>=5.1.1` here), a widget button form would need 5.2.0.
  Transport: `["cloud"]`. No permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake API of
  `test/helpers/fixtures.js`).
