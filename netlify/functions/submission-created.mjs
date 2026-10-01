import { buildSubmissionHandler } from './lib/leadtable-forwarder.mjs';

export const handler = buildSubmissionHandler({
  endpoint: process.env.LEADTABLE_WEBHOOK_URL,
  applicationEndpoint: process.env.LEADTABLE_APPLICATION_WEBHOOK_URL,
  leadTableApiKey: process.env.LEADTABLE_API_KEY,
  leadTableApiEmail: process.env.LEADTABLE_API_EMAIL,
});
