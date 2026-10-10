// ------------------------------------------------------------------
// App
//
// Top-level router. Two states:
//   1. First run (no settings saved yet) → render <Onboarding />
//   2. Otherwise → render the app shell (Layout) with all routes
//
// On boot we also load the saved language from IndexedDB so the
// whole app starts in the ASHA's chosen language without flicker.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Onboarding from './screens/Onboarding';
import Layout from './components/Layout';
import Today from './screens/Today';
import RecordVisit from './screens/RecordVisit';
import ReviewVisit from './screens/ReviewVisit';
import People from './screens/People';
import PersonDetail from './screens/PersonDetail';
import Ask from './screens/Ask';
import Report from './screens/Report';
import Settings from './screens/Settings';

import { getSettings } from './db';
import type { AppLanguage } from './i18n';

export default function App() {
  const { i18n } = useTranslation();
  const location = useLocation();

  const [ready, setReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // -------------------- Boot --------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        if (s) {
          setHasProfile(true);
          if (s.language && s.language !== i18n.language) {
            void i18n.changeLanguage(s.language as AppLanguage);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------- Loading --------------------
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="text-5xl mb-3" aria-hidden="true">
            🎤
          </div>
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  // -------------------- First run --------------------
  if (!hasProfile) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding onDone={() => setHasProfile(true)} />} />
      </Routes>
    );
  }

  // -------------------- Main app --------------------
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Today />} />
        <Route path="/record" element={<RecordVisit />} />
        <Route path="/review" element={<ReviewVisit />} />
        <Route path="/people" element={<People />} />
        <Route path="/person/:id" element={<PersonDetail />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/report" element={<Report />} />
        <Route path="/settings" element={<Settings />} />

        {/* Redirect unknown paths to Home, keeping query string only for record. */}
        <Route
          path="*"
          element={<Navigate to="/" replace state={{ from: location.pathname }} />}
        />
      </Route>
    </Routes>
  );
}