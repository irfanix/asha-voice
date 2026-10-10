// ------------------------------------------------------------------
// OfflineBadge
//
// Small bar at the top of every screen that shows:
//   - whether the device is online or offline
//   - how many AI tasks are queued waiting for internet
//   - the ASHA worker's name (top right), with a small lock icon that
//     explains names are removed before the AI reads the visit
//
// It also listens to the browser's 'online' event and automatically
// drains the offline queue when the connection returns.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { drainQueue, queueSize } from '../ai/client';
import { getSettings } from '../db';
import Icon from './Icon';

export default function OfflineBadge() {
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [queued, setQueued] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [ashaName, setAshaName] = useState<string>('');

  // Show the ASHA's own name in the top right corner. Re-read on focus
  // so a name changed in Settings appears straight away.
  useEffect(() => {
    const read = () =>
      void getSettings()
        .then((s) => setAshaName(s?.asha_name?.trim() || ''))
        .catch(() => {});
    read();
    window.addEventListener('focus', read);
    window.addEventListener('asha-settings-changed', read);
    return () => {
      window.removeEventListener('focus', read);
      window.removeEventListener('asha-settings-changed', read);
    };
  }, []);

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
        <span className="inline-flex items-center gap-1">
          <Icon name={online ? 'wifi' : 'wifiOff'} size={14} />
          {online ? t('online') : t('offline')}
        </span>
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

      {/* Right: ASHA's name + privacy lock */}
      <span className="flex items-center gap-1 min-w-0 text-gray-700 font-medium">
        <span title={t('privacy_badge')} aria-label={t('privacy_badge')} className="text-gray-400">
          <Icon name="lock" size={13} />
        </span>
        <span className="inline-flex items-center gap-1.5 truncate max-w-[170px] bg-primary/10 text-primary rounded-full pl-1 pr-2.5 py-0.5">
          <span className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
            <Icon name="user" size={12} strokeWidth={2.5} />
          </span>
          <span className="truncate">{ashaName || 'ASHA'}</span>
        </span>
      </span>
    </div>
  );
}