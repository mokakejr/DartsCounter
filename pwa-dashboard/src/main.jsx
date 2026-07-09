import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyReducedAnimations } from './lib/performanceMode.js';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

applyReducedAnimations();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
