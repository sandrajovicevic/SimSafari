import { App } from './core/App.js';

const app = new App(document.getElementById('app'));
app.start().catch((e) => {
  // The loop is already running; this only means module setup failed at the top level.
  console.error('[core] start failed', e);
});
