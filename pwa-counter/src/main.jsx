import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { flushQueue } from './flushQueue.js';
import { installFlushFallback } from './sync.js';
import './styles/global.css';

// registerSW (not a hand-rolled navigator.serviceWorker.register) because
// vite-plugin-pwa serves the service worker from a different URL in dev
// (an on-the-fly built /dev-sw.js) than in prod (the precompiled /sw.js).
registerSW({ immediate: true });

installFlushFallback();
flushQueue(); // pick up anything queued from a previous offline session

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
