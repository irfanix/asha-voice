// ------------------------------------------------------------------
// OfflineBadge
//
// Small bar at the top of every screen that shows:
//   - whether the device is online or offline
//   - how many AI tasks are queued waiting for internet
//   - a small "Names removed before AI" privacy badge
//
// It also listens to the browser's 'online' event and automatically
// drains the offline queue when the connection returns.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { drainQueue, queueSize } from '../ai/client';

export default function OfflineBadge() {
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [queued, setQueued] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Keep the queue count fresh — poll every 5 seconds and also
  // whenever the window regains focus (users often background the
  // app while walking between houses).
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const n = await queueSize();
        if (!cancelled) setQueued(n);
      } catch {
        // IndexedDB may not be ready yet during very first render.
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 5000);

    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // React to connectivity changes.
  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true);
      setSyncing(true);
      try {
        await drainQueue();
      } finally {
        // Refresh the counter after draining.
        const n = await queueSize();
        setQueued(n);
        setSyncing(false);
      }
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="bg-white border-b px-4 py-1.5 flex items-center justify-between gap-2 text-xs">
      {/* Left: online / offline status */}
      <span className={online ? 'text-safe font-medium' : 'text-watch font-medium'}>
        {online ? '🟢 ' + t('online') : '🟠 ' + t('offline')}
      </span>

      {/* Middle: queued AI tasks */}
      {syncing ? (
        <span className="text-watch">{t('queue_draining')}</span>
      ) : queued > 0 ? (
        <span className="text-watch">
          {queued === 1 ? t('ai_waiting_one') : t('ai_waiting', { count: queued })}
        </span>
      ) : (
        <span />
      )}

      {/* Right: privacy badge */}
      <span className="text-gray-500" title={t('settings_privacy_body')}>
        🔒 {t('privacy_badge')}
      </span>
    </div>
  );
}