import { buildSubmissionHandler } from './lib/leadtable-forwarder.mjs';

export const handler = buildSubmissionHandler({
  endpoint: process.env.LEADTABLE_WEBHOOK_URL,
});
