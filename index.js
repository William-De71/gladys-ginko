// -----------------------------------------------------------------------------
// Entry point of the Ginko external integration.
//
// Brings the bus and tram network of Besançon (Ginko, Grand Besançon
// Métropole) into Gladys, through its open data API (a free key):
//   - devices: one per followed stop, with the next passages and the waits in
//     real time, and one per followed line, with its traffic (src/device.js);
//   - scene triggers: departure soon, stop not served, line disrupted, line
//     back to normal, new traffic message;
//   - scene actions: read the next passages of a stop, read the traffic of a
//     line;
//   - dashboard widgets: departures, traffic.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Ginko integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
