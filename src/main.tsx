// ------------------------------------------------------------------
// main.tsx
//
// The React entry point.
//
// Responsibilities:
//   - mount <App /> into #root
//   - wrap the tree in <BrowserRouter> so react-router works
//   - initialise i18next (side-effect import)
//   - import the global Tailwind stylesheet
//
// We do NOT initialise the database here — the App component does
// that lazily so the first paint is fast on a cheap phone.
// ------------------------------------------------------------------

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';
import './i18n'; // side-effect: initialises i18next

const rootEl = document.getElementById('root');
if (!rootEl) {
  // This should never happen because index.html has <div id="root">.
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);