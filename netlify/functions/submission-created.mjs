import { buildSubmissionHandler } from './lib/leadtable-forwarder.mjs';
import { buildHubForwarder } from './lib/hub-forwarder.mjs';
import { buildDispatcher } from './lib/dispatcher.mjs';

// LeadTable (läuft weiter, solange die LEADTABLE_*-Variablen gesetzt sind)
const leadTableHandler = buildSubmissionHandler({
  endpoint: process.env.LEADTABLE_WEBHOOK_URL,
  applicationEndpoint: process.env.LEADTABLE_APPLICATION_WEBHOOK_URL,
  leadTableApiKey: process.env.LEADTABLE_API_KEY,
  leadTableApiEmail: process.env.LEADTABLE_API_EMAIL,
});

// Kunden-Hub (läuft, sobald HUB_PORTAL_KEY und die Kampagnen-ID gesetzt sind)
const hubForward = buildHubForwarder({
  portalKey: process.env.HUB_PORTAL_KEY,
  endpoint: process.env.HUB_ENDPOINT,
  campaigns: {
    erstgespraech: process.env.HUB_KAMPAGNE_ERSTGESPRAECH,
    kontakt: process.env.HUB_KAMPAGNE_KONTAKT,
    bewerbung: process.env.HUB_KAMPAGNE_BEWERBUNG,
  },
});

export const handler = buildDispatcher({
  leadTableHandler,
  leadTableEndpoints: {
    patient: process.env.LEADTABLE_WEBHOOK_URL,
    application: process.env.LEADTABLE_APPLICATION_WEBHOOK_URL,
  },
  hubForward,
});
