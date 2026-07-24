import { createApp } from './app.js';
import { runCheckpointTick } from './domain/checkpoints.js';

const port = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`RoutePilot API listening on :${port}`);
});

// Drives the adaptive checkpoint sequence (send due, escalate overdue) in
// dev/demo. A production deploy would run this as a scheduled job instead.
setInterval(() => {
  runCheckpointTick().catch((err) => console.error('[checkpoint-tick]', err));
}, 60_000);
