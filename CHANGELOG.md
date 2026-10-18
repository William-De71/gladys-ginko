# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.2.0] - 2026-10-18

### Added

- follow more stops, show the directions of each stop, compact departures widget ([5094333](https://github.com/William-De71/gladys-ginko/commit/5094333df3c263ec9fed0badbf77061970088cae))

## [0.1.0] - 2026-10-17

### Added

- One device per followed stop of the Ginko network (up to three, typed by name or by id, filtered by line and direction): the next passage as text, the wait of the next two passages serving the stop, and the count of passages not serving it.
- One device per followed line (up to six): its traffic state and the number of disruptions under way.
- Scene triggers: departure soon (2 to 20 minutes before a passage), stop not served (diversion, works), line disrupted or interrupted, line back to normal, and new traffic message about a followed line.
- Scene actions: read the next passages of a stop, and read the traffic of a line, each with a ready-made sentence.
- Dashboard widgets: the next passages of a stop, like the screens of the stops (any stop can be typed in the widget), and the traffic of lines with the full messages of Ginko.
- Configuration actions: test the connection, find a stop by name (with its ids), and a diagnostic written to the Logs tab.
- Cloud transport: the open data API of Ginko (a free key), stops read every 30 seconds to 5 minutes, traffic every 5 minutes; lines and stops of the network kept in /data.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.2.0]: https://github.com/William-De71/gladys-ginko/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/William-De71/gladys-ginko/releases/tag/v0.1.0
