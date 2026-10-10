// ------------------------------------------------------------------
// Layout
//
// The shell for every signed-in screen:
//   - OfflineBadge pinned at the top
//   - <Outlet /> for the current route
//   - a floating "Record a visit" mic button (the primary action,
//     always reachable with one thumb)
//   - BottomNav pinned at the bottom
//
// The main content area is constrained to ~480px so it looks good
// one-handed on a 360px-wide cheap Android phone.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from './BottomNav';
import OfflineBadge from './OfflineBadge';

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [pressed, setPressed] = useState(false);

  // Scroll to top on route change so every screen starts fresh.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  // Hide the floating mic on screens where it would be in the way
  // (the recording screen and the review screen have their own CTAs).
  const hideFab =
    location.pathname.startsWith('/record') ||
    location.pathname.startsWith('/review');

  const goRecord = () => navigate('/record');

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Constrain width on tablets / desktops for readability. */}
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col">
        {/* Top status bar */}
        <OfflineBadge />

        {/* Screen content */}
        <main
          id="main"
          className="flex-1 px-4 pt-4 pb-32"
        >
          <Outlet />
        </main>

        {/* Floating primary action: Record a visit */}
        {!hideFab && (
          <button
            type="button"
            onClick={goRecord}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            aria-label={t('record_visit')}
            className={[
              'fixed z-30',
              'h-16 w-16 rounded-full shadow-xl',
              'bg-primary text-white text-3xl',
              'flex items-center justify-center',
              'active:scale-95',
              pressed ? 'scale-95' : 'scale-100',
              'transition-transform duration-150',
            ].join(' ')}
            style={{
              // Sit above the bottom nav (which is ~64px tall) and
              // hug the right edge with a comfortable thumb reach.
              right: 'max(1.25rem, calc((100vw - 480px) / 2 + 1.25rem))',
              bottom: 'calc(4.5rem + env(safe-area-inset-bottom))',
            }}
          >
            <span aria-hidden="true">🎤</span>
          </button>
        )}
      </div>

      {/* Bottom tab bar */}
      <BottomNav />
    </div>
  );
}